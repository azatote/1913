import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  MAX_HAND_SIZE,
  PLAYER_IDS,
  PLAYERS,
  drawCard,
  findPile,
  flipTopCard,
  formatCardCount,
  getTopCard,
  isPileFaceUp,
  isPlayerId,
  movePile,
  movePileToHand,
  opponentOf,
  playFromHand,
  reorderHand,
  resetGame,
  shufflePile,
} from '../game/logic'
import type { ActionResult, GameState, PlayerId, Point } from '../game/types'
import { useGame, type PresencePlayer } from '../game/useGame'
import { errorMessage } from '../lib/errors'
import { readStored, writeStored } from '../lib/storage'
import { tabId } from '../lib/tab'
import { Board } from './Board'
import { CardPreview } from './CardPreview'
import { HandOverlay } from './HandOverlay'
import { InvitePanel } from './InvitePanel'
import { SeatChooser } from './SeatChooser'

const HIDE_OPPONENT_KEY = 'nd1913.hide-opponent-hand'
const HIDE_SIDEBAR_KEY = 'nd1913.hide-sidebar'

type SeatClaim = { seat: PlayerId; since: number }

function loadSeatClaim(key: string): SeatClaim | null {
  try {
    const value = JSON.parse(readStored('session', key) ?? 'null') as Partial<SeatClaim> | null
    return value && isPlayerId(value.seat) && typeof value.since === 'number' ? { seat: value.seat, since: value.since } : null
  } catch {
    return null
  }
}

// The earliest claim wins when two tabs pick the same seat at the same time.
function computeSeatOwners(players: PresencePlayer[]): Record<PlayerId, string | null> {
  const owners: Record<PlayerId, string | null> = { top: null, bottom: null }
  for (const seat of PLAYER_IDS) {
    const [owner] = players
      .filter((player) => player.seat === seat)
      .sort((left, right) => left.seatSince - right.seatSince || left.tabId.localeCompare(right.tabId))
    owners[seat] = owner?.tabId ?? null
  }
  return owners
}

type GameScreenProps = {
  gameId: string
  themeToggle: ReactNode
  onLeave: () => void
}

export function GameScreen({ gameId, themeToggle, onLeave }: GameScreenProps) {
  const seatKey = `nd1913.seat.${gameId}`
  const [claim, setClaim] = useState<SeatClaim | null>(() => loadSeatClaim(seatKey))
  const [openedAt] = useState(() => Date.now())
  const [message, setMessage] = useState('Double-cliquez sur la pioche pour tirer une carte.')

  const {
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
  } = useGame({ gameId, tabId, onNotice: setMessage })

  // Derived from Presence: a seat held earlier by another tab wins; the last free seat is auto-assigned.
  const owners = useMemo(() => computeSeatOwners(players), [players])
  const othersOwners = useMemo(() => computeSeatOwners(players.filter((player) => player.tabId !== tabId)), [players])
  const claimLost = Boolean(claim && owners[claim.seat] && owners[claim.seat] !== tabId)
  const freeSeats = PLAYER_IDS.filter((id) => !othersOwners[id])
  const autoSeat = freeSeats.length === 1 ? freeSeats[0] : null
  const activeClaim: SeatClaim | null = claim && !claimLost
    ? claim
    : !claim && autoSeat ? { seat: autoSeat, since: openedAt } : null
  const seat = activeClaim?.seat ?? null
  const seatSince = activeClaim?.since ?? 0

  useEffect(() => {
    if (status === 'online') trackPresence({ tabId, seat, seatSince })
  }, [seat, seatSince, status, trackPresence])

  const [selectedPileId, setSelectedPileId] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [handPreviewIndex, setHandPreviewIndex] = useState<number | null>(null)
  const [hideOpponentHand, setHideOpponentHand] = useState(() => readStored('local', HIDE_OPPONENT_KEY) === '1')
  const [hideSidebar, setHideSidebar] = useState(() => readStored('local', HIDE_SIDEBAR_KEY) === '1')

  const viewerSeat = seat ?? 'bottom'
  const opponentSeat = opponentOf(viewerSeat)
  const selectedPile = state ? findPile(state, selectedPileId) : undefined
  const selectedTopCard = selectedPile ? getTopCard(selectedPile) : undefined
  const ownHand = seat && state ? state.hands[seat] : []
  const handPreviewCard = handPreviewIndex === null ? undefined : ownHand[handPreviewIndex]

  const updateClaim = useCallback((next: SeatClaim | null) => {
    writeStored('session', seatKey, next ? JSON.stringify(next) : null)
    setClaim(next)
  }, [seatKey])

  const chooseSeat = useCallback((nextSeat: PlayerId) => {
    if (owners[nextSeat] && owners[nextSeat] !== tabId) return
    updateClaim({ seat: nextSeat, since: Date.now() })
    setMessage(`Vous incarnez ${PLAYERS[nextSeat].label}.`)
  }, [owners, updateClaim])

  const run = useCallback((action: (draft: GameState) => ActionResult) => {
    const result = commit(action)
    if (result.message) setMessage(result.message)
    if (result.ok && result.selectedPileId !== undefined) setSelectedPileId(result.selectedPileId)
  }, [commit])

  const drawSelected = () => {
    if (!state) return
    const pileId = selectedPile?.id ?? state.piles[0]?.id
    if (!pileId) {
      setMessage('Aucune carte disponible à piocher.')
      return
    }
    run((draft) => drawCard(draft, pileId))
  }

  const flipSelected = () => run((draft) => flipTopCard(draft, selectedPileId))

  const handlePileActivate = (pileId: string) => {
    const pile = state && findPile(state, pileId)
    if (!pile) return
    const faceUp = isPileFaceUp(pile)
    run((draft) => faceUp ? flipTopCard(draft, pileId) : drawCard(draft, pileId))
  }

  const selectPile = (pileId: string) => {
    setSelectedPileId(pileId)
    const pile = state && findPile(state, pileId)
    if (pile) setMessage(`Paquet sélectionné : ${formatCardCount(pile.cards.length)}.`)
  }

  const playCard = (index: number, position?: Point) => {
    if (!seat) return
    run((draft) => playFromHand(draft, seat, index, position))
  }

  const toggleOpponentHand = () => {
    const next = !hideOpponentHand
    writeStored('local', HIDE_OPPONENT_KEY, next ? '1' : '0')
    setHideOpponentHand(next)
  }

  const toggleSidebar = () => {
    const next = !hideSidebar
    writeStored('local', HIDE_SIDEBAR_KEY, next ? '1' : '0')
    setHideSidebar(next)
  }

  const purgeGame = async () => {
    if (!window.confirm('Supprimer définitivement cette partie pour les deux joueurs ?')) return
    try {
      await deleteGame()
      writeStored('session', seatKey, null)
      onLeave()
    } catch (error) {
      setMessage(`Suppression impossible : ${errorMessage(error)}`)
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return

      if (event.code === 'Space') {
        if (target?.closest('button')) return
        event.preventDefault()
        if (previewOpen) setPreviewOpen(false)
        else if (selectedTopCard) setPreviewOpen(true)
        else setMessage("Sélectionnez un paquet avec une carte pour afficher l'aperçu.")
        return
      }

      if (event.key === 'Escape') {
        setPreviewOpen(false)
        setHandPreviewIndex(null)
        return
      }

      if (event.repeat || !seat) return
      const key = event.key.toLowerCase()
      if (key === 'f') flipSelected()
      if (key === 'd') drawSelected()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (loadError || deleted) {
    return (
      <main className="center-page">
        {themeToggle}
        <section className="center-card">
          <span className="eyebrow">Partie indisponible</span>
          <h1>Partie <span className="accent">introuvable</span></h1>
          <p className="center-copy">{deleted ? 'Cette partie a été supprimée.' : loadError}</p>
          <button type="button" className="primary-button full" onClick={onLeave}>Retour à l'accueil <span aria-hidden="true">→</span></button>
        </section>
      </main>
    )
  }

  if (!state) {
    return (
      <main className="center-page">
        {themeToggle}
        <section className="center-card is-loading">
          <span className="eyebrow">Connexion</span>
          <h1>Chargement de la <span className="accent">partie…</span></h1>
        </section>
      </main>
    )
  }

  const connection = status === 'online'
    ? pendingWrites > 0 ? { key: 'saving', label: 'Enregistrement…' } : { key: 'online', label: 'Synchronisé' }
    : status === 'connecting' ? { key: 'connecting', label: 'Connexion…' } : { key: 'offline', label: 'Hors ligne' }

  return (
    <div className="game">
      <header className="game-header">
        <div className="header-left">
          <button
            type="button"
            className={`burger-button${hideSidebar ? '' : ' is-active'}`}
            onClick={toggleSidebar}
            aria-label={hideSidebar ? 'Afficher le panneau' : 'Masquer le panneau'}
            aria-expanded={!hideSidebar}
            title={hideSidebar ? 'Afficher le panneau' : 'Masquer le panneau pour agrandir la table'}
          >
            <span /><span /><span />
          </button>
          <button type="button" className="brand" onClick={onLeave} title="Retour à l'accueil">
            Table <span className="accent">1913</span>
          </button>
          <span className="pill">{seat ? `Vous jouez ${PLAYERS[seat].label}` : 'Spectateur'}</span>
        </div>
        <div className="header-right">
          <span className={`status-pill is-${connection.key}`} aria-live="polite"><i aria-hidden="true" />{connection.label}</span>
          {themeToggle}
        </div>
      </header>

      <div className={`game-layout${hideSidebar ? ' sidebar-hidden' : ''}`}>
        <aside className="sidebar">
          <section className="panel">
            <h2 className="panel-title">Actions de <span className="accent">jeu</span></h2>
            <button type="button" className="action-button" onClick={drawSelected}>Piocher une carte <kbd>D</kbd></button>
            <button type="button" className="action-button" onClick={flipSelected}>Retourner le dessus <kbd>F</kbd></button>
            <button type="button" className="action-button" onClick={() => run((draft) => shufflePile(draft, selectedPileId))}>Mélanger la pile</button>
            <button type="button" className="action-button" onClick={() => setPreviewOpen(true)} disabled={!selectedTopCard}>Agrandir la carte <kbd>Espace</kbd></button>
          </section>

          <section className="panel">
            <h2 className="panel-title">Mains <span className="accent">cachées</span></h2>
            {PLAYER_IDS.map((playerId) => (
              <button key={playerId} type="button" className="action-button" onClick={() => run((draft) => movePileToHand(draft, selectedPileId, playerId))}>
                Envoyer vers la main de {PLAYERS[playerId].label}
              </button>
            ))}
            <button type="button" className={`action-button${hideOpponentHand ? ' is-active' : ''}`} onClick={toggleOpponentHand}>
              {hideOpponentHand ? 'Afficher la main adverse' : 'Masquer la main adverse'}
            </button>
          </section>

          <section className="panel">
            <h2 className="panel-title">Inviter un <span className="accent">joueur</span></h2>
            <InvitePanel gameId={gameId} />
            <ul className="player-list" aria-label="Joueurs connectés">
              {players.map((player, index) => (
                <li key={`${player.tabId}-${index}`} className={player.tabId === tabId ? 'is-me' : undefined}>
                  <i aria-hidden="true" />
                  {player.seat ? PLAYERS[player.seat].label : 'Spectateur'}
                  {player.tabId === tabId && <small>vous</small>}
                </li>
              ))}
            </ul>
          </section>

          <section className="panel legend">
            <h2 className="panel-title">Aide</h2>
            <p>Clic sur un paquet : le sélectionner</p>
            <p>Double-clic sur une pioche : piocher 1 carte</p>
            <p>Double-clic sur une carte visible : la retourner</p>
            <p>Glisser-déposer : déplacer, ou fusionner sur un autre paquet</p>
            <p>Main ({MAX_HAND_SIZE} cartes max) : clic pour agrandir, glisser sur la table pour jouer</p>
            <p>Molette, pincement ou <kbd>+</kbd> <kbd>−</kbd> : zoom · <kbd>0</kbd> : ajuster</p>
            <p>Glisser le fond de la table : déplacer la vue</p>
          </section>

          <section className="panel">
            <p className="status-text" aria-live="polite">{message}</p>
            <button type="button" className="action-button" onClick={() => run(resetGame)}>Nouvelle partie</button>
            {seat && <button type="button" className="link-button" onClick={() => updateClaim(null)}>Changer de joueur</button>}
            <button type="button" className="danger-button" onClick={() => void purgeGame()}>Supprimer la partie</button>
          </section>
        </aside>

        <main className="play-area">
          <Board
            state={state}
            mirrored={seat === 'top'}
            selectedPileId={selectedPileId}
            remoteDrags={remoteDrags}
            canPlayFromHand={Boolean(seat)}
            onSelect={selectPile}
            onPileActivate={handlePileActivate}
            onPileDrop={(pileId, position) => run((draft) => movePile(draft, pileId, position))}
            onPileToHand={(pileId, playerId) => run((draft) => movePileToHand(draft, pileId, playerId))}
            onPlayFromHand={playCard}
            onDragMove={broadcastDrag}
            onDragEnd={broadcastDragEnd}
            hasOwnHand={Boolean(seat)}
          >
            {!hideOpponentHand && (
              <HandOverlay
                playerId={opponentSeat}
                cards={state.hands[opponentSeat]}
                isOwn={false}
                onPreview={() => undefined}
                onReorder={() => undefined}
              />
            )}
            {seat && (
              <HandOverlay
                playerId={seat}
                cards={state.hands[seat]}
                isOwn
                onPreview={setHandPreviewIndex}
                onReorder={(from, to) => run((draft) => reorderHand(draft, seat, from, to))}
              />
            )}
          </Board>
        </main>
      </div>

      {!seat && <SeatChooser owners={owners} tabId={tabId} onChoose={chooseSeat} />}
      {previewOpen && selectedTopCard && <CardPreview card={selectedTopCard} onClose={() => setPreviewOpen(false)} />}
      {handPreviewIndex !== null && handPreviewCard && (
        <CardPreview
          card={{ ...handPreviewCard, faceUp: true }}
          onClose={() => setHandPreviewIndex(null)}
          actions={(
            <button
              type="button"
              className="primary-button small"
              onClick={() => {
                playCard(handPreviewIndex)
                setHandPreviewIndex(null)
              }}
            >
              Jouer sur la table
            </button>
          )}
        />
      )}
    </div>
  )
}
