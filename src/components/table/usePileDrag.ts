import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CARD_HEIGHT,
  CARD_WIDTH,
  PLAYER_IDS,
  PLAYERS,
  clampPlayerRowShift,
  isPlayerId,
  mirrorTopLeft,
  nearestRowIndex,
  snapPosition,
} from '../../game/logic'
import type { GameState, PlayerId, Point } from '../../game/types'
import { clamp, toViewRect, unscaleViewPoint } from './boardGeometry'

const DRAG_THRESHOLD_PX = 6
const DOUBLE_TAP_MS = 350

type DragSession = {
  pileId: string
  pointerId: number
  startX: number
  startY: number
  grab: Point
  moved: boolean
  position: Point
  pointerPosition: Point
  groupStartPointer: Point | null
  groupPlayerId: PlayerId | null
}

export type DragPreview = {
  pileId: string
  position: Point
  groupPlayerId?: PlayerId
  groupShift?: number
}

type PileDragOptions = {
  state: GameState
  mirrored: boolean
  pointerToView: (clientX: number, clientY: number) => Point
  scrollNearEdge: (clientX: number, clientY: number) => void
  onSelect: (pileId: string) => void
  onPileActivate: (pileId: string) => void
  onPileDrop: (pileId: string, position: Point) => void
  onMovePlayerRow: (playerId: PlayerId, slots: number) => void
  onPileToHand: (pileId: string, playerId: PlayerId) => void
  onDragMove: (pileId: string, position: Point) => void
  onDragEnd: (pileId: string) => void
}

function beginPlayerRowGroupDrag(drag: DragSession, state: GameState): PlayerId | null {
  const pile = state.piles.find((entry) => entry.id === drag.pileId)
  const rowIndex = pile ? nearestRowIndex(pile.y) : -1
  const playerId = PLAYER_IDS.find((id) => PLAYERS[id].rowIndex === rowIndex)
  if (!playerId) return null

  drag.groupPlayerId = playerId
  drag.groupStartPointer = drag.pointerPosition
  return playerId
}

function handPlayerAt(clientX: number, clientY: number): PlayerId | null {
  const zone = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-hand-player]')
  const playerId = zone?.dataset.handPlayer
  return isPlayerId(playerId) ? playerId : null
}

// Pile drag & drop: single drag, Space-held row drag, double tap, drop on a hand.
export function usePileDrag({
  state,
  mirrored,
  pointerToView,
  scrollNearEdge,
  onSelect,
  onPileActivate,
  onPileDrop,
  onMovePlayerRow,
  onPileToHand,
  onDragMove,
  onDragEnd,
}: PileDragOptions) {
  const dragRef = useRef<DragSession | null>(null)
  const groupDragRef = useRef<{ playerId: PlayerId; slots: number } | null>(null)
  const spaceHeldRef = useRef(false)
  const lastTapRef = useRef<{ pileId: string; time: number } | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)

  // Lets the memoized pile handlers read the latest props without being recreated.
  const latestRef = useRef({ state, mirrored, onSelect, onPileActivate, onPileDrop, onMovePlayerRow, onPileToHand, onDragMove, onDragEnd })
  useLayoutEffect(() => {
    latestRef.current = { state, mirrored, onSelect, onPileActivate, onPileDrop, onMovePlayerRow, onPileToHand, onDragMove, onDragEnd }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      const target = event.target instanceof HTMLElement ? event.target : null
      const drag = dragRef.current
      if (!drag && target?.closest('button, input, textarea, select, [contenteditable="true"]')) return
      spaceHeldRef.current = true
      event.preventDefault()
      if (event.repeat) {
        if (drag) event.stopImmediatePropagation()
        return
      }
      if (!drag) return
      event.stopImmediatePropagation()

      const playerId = beginPlayerRowGroupDrag(drag, latestRef.current.state)
      if (playerId) groupDragRef.current = { playerId, slots: 0 }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !spaceHeldRef.current) return
      spaceHeldRef.current = false
      event.preventDefault()
      if (dragRef.current) event.stopImmediatePropagation()
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    const onBlur = () => { spaceHeldRef.current = false }
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const handlePilePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>, pileId: string) => {
    if (event.button !== 0) return
    const { state: current, mirrored: isMirrored, onSelect: select } = latestRef.current
    const pile = current.piles.find((entry) => entry.id === pileId)
    if (!pile) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const pointer = pointerToView(event.clientX, event.clientY)
    const rect = toViewRect(pile, isMirrored)
    groupDragRef.current = null
    const drag: DragSession = {
      pileId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      // Grab point as a fraction of the card, so it stays under the pointer at any display scale.
      grab: {
        x: (pointer.x - rect.x) / (CARD_WIDTH * rect.scale),
        y: (pointer.y - rect.y) / (CARD_HEIGHT * rect.scale),
      },
      moved: false,
      position: { x: pile.x, y: pile.y },
      pointerPosition: mirrorTopLeft(unscaleViewPoint(pointer), isMirrored),
      groupStartPointer: null,
      groupPlayerId: null,
    }
    dragRef.current = drag
    if (spaceHeldRef.current) {
      const playerId = beginPlayerRowGroupDrag(drag, current)
      if (playerId) groupDragRef.current = { playerId, slots: 0 }
    }
    select(pileId)
  }, [pointerToView])

  const handlePilePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>, pileId: string) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD_PX) return

    const { state: current, mirrored: isMirrored, onDragMove: notify } = latestRef.current
    const pile = current.piles.find((entry) => entry.id === pileId)
    if (!pile) return
    drag.moved = true
    scrollNearEdge(event.clientX, event.clientY)
    const pointer = unscaleViewPoint(pointerToView(event.clientX, event.clientY))
    const modelPointer = mirrorTopLeft(pointer, isMirrored)
    drag.pointerPosition = modelPointer
    if (drag.groupPlayerId && drag.groupStartPointer) {
      const requestedSlots = Math.round((modelPointer.x - drag.groupStartPointer.x) / CARD_WIDTH)
      const slots = clampPlayerRowShift(current, drag.groupPlayerId, requestedSlots)
      drag.position = { x: pile.x + slots * CARD_WIDTH, y: pile.y }
      groupDragRef.current = { playerId: drag.groupPlayerId, slots }
      setDragPreview({ pileId, position: drag.position, groupPlayerId: drag.groupPlayerId, groupShift: slots })
      notify(pileId, drag.position)
      return
    }

    const model = mirrorTopLeft({ x: pointer.x - drag.grab.x * CARD_WIDTH, y: pointer.y - drag.grab.y * CARD_HEIGHT }, isMirrored)
    drag.position = snapPosition(current, pile, model) ?? {
      x: clamp(model.x, 0, BOARD_WIDTH - CARD_WIDTH),
      y: clamp(model.y, 0, BOARD_HEIGHT - CARD_HEIGHT),
    }
    setDragPreview({ pileId, position: drag.position })
    notify(pileId, drag.position)
  }, [pointerToView, scrollNearEdge])

  const handlePilePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragPreview(null)
    const { onPileActivate: activate, onDragEnd: end, onPileToHand: toHand, onPileDrop: drop, onMovePlayerRow: moveRow } = latestRef.current

    // A simple click only selects (done on pointer down); a double click/tap draws or flips.
    if (!drag.moved) {
      groupDragRef.current = null
      if (cancelled) return
      const lastTap = lastTapRef.current
      if (lastTap && lastTap.pileId === drag.pileId && event.timeStamp - lastTap.time < DOUBLE_TAP_MS) {
        lastTapRef.current = null
        activate(drag.pileId)
      } else {
        lastTapRef.current = { pileId: drag.pileId, time: event.timeStamp }
      }
      return
    }

    lastTapRef.current = null
    end(drag.pileId)
    if (cancelled) {
      groupDragRef.current = null
      return
    }
    if (groupDragRef.current) {
      moveRow(groupDragRef.current.playerId, groupDragRef.current.slots)
      groupDragRef.current = null
      return
    }
    const handPlayer = handPlayerAt(event.clientX, event.clientY)
    if (handPlayer) toHand(drag.pileId, handPlayer)
    else drop(drag.pileId, drag.position)
  }, [])

  return { dragPreview, handlePilePointerDown, handlePilePointerMove, handlePilePointerEnd }
}
