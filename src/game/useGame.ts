import type { RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../lib/errors'
import { GAMES_TABLE, supabase } from '../lib/supabase'
import { parseGameState } from './logic'
import type { ActionResult, GameState, PlayerId, Point } from './types'

const DRAG_BROADCAST_INTERVAL_MS = 100
const REMOTE_DRAG_LINGER_MS = 1500

// SQL columns (snake_case) are kept separate from the in-app model.
type GameRow = { id: string; revision: number; state: unknown }
type Snapshot = { state: GameState; revision: number }

export type PresencePlayer = { tabId: string; seat: PlayerId | null; seatSince: number }
export type ConnectionStatus = 'connecting' | 'online' | 'offline'

type UseGameOptions = {
  gameId: string
  tabId: string
  onNotice: (text: string) => void
}

function toSnapshot(row: GameRow): Snapshot | null {
  const state = parseGameState(row.state)
  return state ? { state, revision: row.revision } : null
}

export function useGame({ gameId, tabId, onNotice }: UseGameOptions) {
  const [state, setState] = useState<GameState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [pendingWrites, setPendingWrites] = useState(0)
  const [players, setPlayers] = useState<PresencePlayer[]>([])
  const [remoteDrags, setRemoteDrags] = useState<Record<string, Point>>({})

  const displayedRef = useRef<Snapshot | null>(null)
  const confirmedRef = useRef<Snapshot | null>(null)
  const pendingRef = useRef(0)
  const generationRef = useRef(0)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastDragSentRef = useRef(0)

  const display = useCallback((snapshot: Snapshot) => {
    displayedRef.current = snapshot
    setState(snapshot.state)
  }, [])

  const fetchRow = useCallback(async () => {
    if (!supabase) return null
    const { data, error } = await supabase
      .from(GAMES_TABLE)
      .select('id, revision, state')
      .eq('id', gameId)
      .maybeSingle<GameRow>()
    if (error) throw error
    return data
  }, [gameId])

  // The server wins: used on reconnect and after a rejected write.
  const reload = useCallback(async () => {
    try {
      const row = await fetchRow()
      if (!row) {
        setDeleted(true)
        return
      }
      const snapshot = toSnapshot(row)
      if (!snapshot) return
      confirmedRef.current = snapshot
      display(snapshot)
      setRemoteDrags({})
    } catch {
      setStatus('offline')
    }
  }, [display, fetchRow])

  const acceptRemoteRow = useCallback((row: GameRow) => {
    const snapshot = toSnapshot(row)
    if (!snapshot) return
    if (confirmedRef.current && snapshot.revision <= confirmedRef.current.revision) return
    confirmedRef.current = snapshot
    setRemoteDrags({})
    if (pendingRef.current === 0) display(snapshot)
  }, [display])

  useEffect(() => {
    let cancelled = false
    fetchRow()
      .then((row) => {
        if (cancelled) return
        const snapshot = row && toSnapshot(row)
        if (!snapshot) {
          setLoadError(row ? 'Les données de cette partie sont illisibles.' : "Cette partie n'existe pas ou a été supprimée.")
          return
        }
        confirmedRef.current = snapshot
        display(snapshot)
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(`Chargement impossible : ${errorMessage(error)}`)
      })
    return () => {
      cancelled = true
    }
  }, [display, fetchRow])

  useEffect(() => {
    const client = supabase
    if (!client) return
    const lingerTimers = new Set<number>()

    const channel = client
      .channel(`nd1913-${gameId}`, { config: { presence: { key: tabId } } })
      .on('presence', { event: 'sync' }, () => {
        setPlayers(Object.values(channel.presenceState<PresencePlayer>()).flat())
      })
      .on('broadcast', { event: 'pile-drag' }, ({ payload }) => {
        const { pileId, x, y } = payload as { pileId: string } & Point
        setRemoteDrags((current) => ({ ...current, [pileId]: { x, y } }))
      })
      .on('broadcast', { event: 'pile-drag-end' }, ({ payload }) => {
        const { pileId } = payload as { pileId: string }
        // Kept a moment so the pile doesn't jump back before the database update arrives.
        const timer = window.setTimeout(() => {
          lingerTimers.delete(timer)
          setRemoteDrags((current) => {
            if (!(pileId in current)) return current
            const next = { ...current }
            delete next[pileId]
            return next
          })
        }, REMOTE_DRAG_LINGER_MS)
        lingerTimers.add(timer)
      })
      .on('broadcast', { event: 'game-deleted' }, () => setDeleted(true))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: GAMES_TABLE, filter: `id=eq.${gameId}` }, (payload) => {
        acceptRemoteRow(payload.new as GameRow)
      })
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === 'SUBSCRIBED') {
          setStatus('online')
          // Catch up on updates missed while disconnected.
          if (confirmedRef.current && pendingRef.current === 0) void reload()
        } else {
          setStatus('offline')
        }
      })

    channelRef.current = channel
    return () => {
      lingerTimers.forEach((timer) => window.clearTimeout(timer))
      channelRef.current = null
      void client.removeChannel(channel)
    }
  }, [acceptRemoteRow, gameId, reload, tabId])

  const trackPresence = useCallback((presence: PresencePlayer) => {
    void channelRef.current?.track(presence)
  }, [])

  const rejectPendingWrites = useCallback((text: string) => {
    generationRef.current += 1
    onNotice(text)
    if (confirmedRef.current) display(confirmedRef.current)
  }, [display, onNotice])

  // Optimistic update: the UI changes now, the database confirms or the change is reverted.
  const commit = useCallback((action: (draft: GameState) => ActionResult): ActionResult => {
    const client = supabase
    const base = displayedRef.current
    if (!client || !base) return { ok: false, message: 'La partie est en cours de chargement.' }

    const draft = structuredClone(base.state)
    const result = action(draft)
    if (!result.ok) return result

    const snapshot: Snapshot = { state: draft, revision: base.revision + 1 }
    const generation = generationRef.current
    display(snapshot)
    pendingRef.current += 1
    setPendingWrites(pendingRef.current)

    queueRef.current = queueRef.current
      .then(async () => {
        // An earlier write was rejected: this one was built on a discarded state.
        if (generation !== generationRef.current) return

        const { data, error } = await client
          .from(GAMES_TABLE)
          .update({ state: snapshot.state, revision: snapshot.revision })
          .eq('id', gameId)
          .eq('revision', base.revision)
          .select('revision')
          .maybeSingle()

        if (!error && data) {
          if (!confirmedRef.current || confirmedRef.current.revision < snapshot.revision) confirmedRef.current = snapshot
          return
        }

        rejectPendingWrites(error
          ? `Action annulée par la base : ${error.message}`
          : "Action annulée : l'autre joueur a joué au même moment.")
        await reload()
      })
      .catch(() => {
        rejectPendingWrites('Action annulée : connexion à Supabase impossible.')
        setStatus('offline')
      })
      .finally(() => {
        pendingRef.current -= 1
        setPendingWrites(pendingRef.current)
        const confirmed = confirmedRef.current
        const displayed = displayedRef.current
        if (pendingRef.current === 0 && confirmed && displayed && confirmed.revision > displayed.revision) display(confirmed)
      })

    return result
  }, [display, gameId, rejectPendingWrites, reload])

  // Broadcast: ephemeral positions while dragging, never stored.
  const broadcastDrag = useCallback((pileId: string, position: Point) => {
    const now = Date.now()
    if (now - lastDragSentRef.current < DRAG_BROADCAST_INTERVAL_MS) return
    lastDragSentRef.current = now
    void channelRef.current?.send({ type: 'broadcast', event: 'pile-drag', payload: { pileId, ...position } })
  }, [])

  const broadcastDragEnd = useCallback((pileId: string) => {
    lastDragSentRef.current = 0
    void channelRef.current?.send({ type: 'broadcast', event: 'pile-drag-end', payload: { pileId } })
  }, [])

  const deleteGame = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.from(GAMES_TABLE).delete().eq('id', gameId)
    if (error) throw error
    await channelRef.current?.send({ type: 'broadcast', event: 'game-deleted', payload: {} })
  }, [gameId])

  return {
    state,
    loadError,
    deleted,
    status,
    pendingWrites,
    players,
    remoteDrags,
    commit,
    trackPresence,
    broadcastDrag,
    broadcastDragEnd,
    deleteGame,
  }
}
