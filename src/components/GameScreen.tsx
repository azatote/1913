import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  MAX_HAND_SIZE,
  BOARD_WIDTH,
  CARD_WIDTH,
  OBJECTIVE_ROW_INDEX,
  PLAYER_IDS,
  PLAYERS,
  drawCard,
  findPile,
  flipTopCard,
  formatCardCount,
  getTopCard,
  isPileFaceUp,
  isPlayerId,
  moveCampaignPawn,
  moveObjectiveToHand,
  moveObjectiveCardToHand,
  moveObjectiveToPile,
  movePlayerRowGroup,
  movePile,
  movePileToHand,
  nearestRowIndex,
  objectiveRowY,
  opponentOf,
  playFromHand,
  playObjectiveFromHand,
  reorderHand,
  resetGame,
  shufflePile,
} from '../game/logic'
import type { ActionResult, CampaignPawnId, Card, GameState, PlayerId, Point } from '../game/types'
import { useGame, type PresencePlayer } from '../game/useGame'
import { errorMessage } from '../lib/errors'
import { readStored, writeStored } from '../lib/storage'
import { tabId } from '../lib/tab'
import { Board } from './table/Board'
import { CampaignBoard } from './CampaignBoard'
import { CardPreview } from './CardPreview'
import { HandOverlay } from './HandOverlay'
import { InvitePanel } from './InvitePanel'
import { ObjectiveHandOverlay } from './ObjectiveHandOverlay'
import { ObjectiveRiver } from './ObjectiveRiver'
import { ResetDatabase } from './ResetDatabase'
import { EndgameView, type ObjectivePreview } from './EndgameView'
import { SeatChooser } from './SeatChooser'

const HIDE_OPPONENT_KEY = 'nd1913.hide-opponent-hand'
const HIDE_OWN_OBJECTIVE_KEY = 'nd1913.hide-own-objective-hand'
const HIDE_SIDEBAR_KEY = 'nd1913.hide-sidebar'

type SeatClaim = { seat: PlayerId; since: number }

function nextObjectivePosition(state: GameState, playerId: PlayerId): Point {
  const rowIndex = OBJECTIVE_ROW_INDEX[playerId]
  const step = CARD_WIDTH + 24
  const firstX = 24
  const slotCount = Math.floor((BOARD_WIDTH - firstX - CARD_WIDTH) / step) + 1
  for (let slot = 0; slot < slotCount; slot += 1) {
    const x = firstX + slot * step
    if (state.piles.every((pile) => nearestRowIndex(pile.y) !== rowIndex || Math.abs(pile.x - x) >= CARD_WIDTH)) {
      return { x, y: objectiveRowY(playerId) }
    }
  }
  return { x: BOARD_WIDTH - CARD_WIDTH, y: objectiveRowY(playerId) }
}

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
    announceDeleted,
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
  const [selectedObjectivePileId, setSelectedObjectivePileId] = useState<string | null>(null)
  const [selectedHandObjective, setSelectedHandObjective] = useState<{ playerId: PlayerId; cardId: string } | null>(null)
  const [boardScale, setBoardScale] = useState(0)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [endgameSelection, setEndgameSelection] = useState<ObjectivePreview | null>(null)
  const [showEndgameView, setShowEndgameView] = useState(false)
  const [handPreviewIndex, setHandPreviewIndex] = useState<number | null>(null)
  const [hideOpponentHand, setHideOpponentHand] = useState(() => readStored('local', HIDE_OPPONENT_KEY) === '1')
  const [hideOwnObjectiveHand, setHideOwnObjectiveHand] = useState(() => readStored('local', HIDE_OWN_OBJECTIVE_KEY) === '1')
  const [hideSidebar, setHideSidebar] = useState(() => readStored('local', HIDE_SIDEBAR_KEY) === '1')
  const [hideCampaignBoards, setHideCampaignBoards] = useState(false)

  const viewerSeat = seat ?? 'bottom'
  const opponentSeat = opponentOf(viewerSeat)
  const selectedPile = state ? findPile(state, selectedPileId) : undefined
  const selectedObjectivePile = state?.objectivePiles.find((pile) => pile.id === selectedObjectivePileId)
  const selectedHandObjectiveCard = selectedHandObjective
    ? state?.objectiveHands[selectedHandObjective.playerId].find((card) => card.id === selectedHandObjective.cardId)
    : undefined
  const selectedTopCard = endgameSelection?.card ?? selectedHandObjectiveCard ?? (selectedPile
    ? getTopCard(selectedPile)
    : selectedObjectivePile?.cards.at(-1))
  const selectedObjectiveRow = selectedPile
    && selectedTopCard?.kind === 'objective'
    && Object.values(OBJECTIVE_ROW_INDEX).includes(nearestRowIndex(selectedPile.y))
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
    return result
  }, [commit])

  const moveObjectiveToBoard = (objectivePileId: string, position: Point) => {
    const result = run((draft) => moveObjectiveToPile(draft, objectivePileId, position))
    if (result.ok) setSelectedObjectivePileId(null)
  }

  const takeObjectiveToHand = (objectivePileId: string, playerId: PlayerId) => {
    const result = run((draft) => moveObjectiveToHand(draft, objectivePileId, playerId))
    if (result.ok) setSelectedObjectivePileId(null)
  }

  const sendSelectedToHand = (playerId: PlayerId) => {
    if (selectedObjectivePileId) takeObjectiveToHand(selectedObjectivePileId, playerId)
    else run((draft) => movePileToHand(draft, selectedPileId, playerId))
  }

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
    setSelectedHandObjective(null)
    setSelectedPileId(pileId)
    setSelectedObjectivePileId(null)
    const pile = state && findPile(state, pileId)
    if (pile) setMessage(`Paquet sélectionné : ${formatCardCount(pile.cards.length)}.`)
  }

  const selectObjectivePile = (pileId: string) => {
    setSelectedHandObjective(null)
    setSelectedPileId(null)
    setSelectedObjectivePileId(pileId)
    const pile = state?.objectivePiles.find((entry) => entry.id === pileId)
    const card = pile?.cards.at(-1)
    if (pile && pile.id === state?.objectiveDrawPileId) setMessage(`Pioche objectifs : ${formatCardCount(pile.cards.length)}.`)
    else if (card) setMessage(`Objectif ${card.code} sélectionné.`)
  }

  const selectObjectiveInHand = (playerId: PlayerId, card: Card) => {
    setSelectedPileId(null)
    setSelectedObjectivePileId(null)
    setSelectedHandObjective({ playerId, cardId: card.id })
  }

  const objectiveHandProps = (playerId: PlayerId) => ({
    onSelect: (card: Card) => selectObjectiveInHand(playerId, card),
    onPreview: (card: Card) => {
      selectObjectiveInHand(playerId, card)
      setPreviewOpen(true)
    },
    onTakeObjective: takeObjectiveToHand,
  })

  const playCard = (index: number, position?: Point) => {
    if (!seat) return
    run((draft) => playFromHand(draft, seat, index, position))
  }

  const playObjectiveCard = (cardId: string, position?: Point) => {
    if (!seat) return
    const result = run((draft) => playObjectiveFromHand(draft, seat, cardId, position))
    if (result.ok) {
      setSelectedHandObjective(null)
      setPreviewOpen(false)
    }
  }

  const playEndgameObjective = (sourcePlayerId: PlayerId, cardId: string, targetPlayerId: PlayerId, position: Point) => {
    const target = { x: position.x, y: objectiveRowY(targetPlayerId) }
    const result = run((draft) => playObjectiveFromHand(draft, sourcePlayerId, cardId, target))
    if (result.ok) {
      setEndgameSelection(null)
      setPreviewOpen(false)
    }
  }

  const returnEndgameObjective = (pileId: string, cardId: string, playerId: PlayerId) => {
    const result = run((draft) => moveObjectiveCardToHand(draft, pileId, cardId, playerId))
    if (result.ok) {
      setEndgameSelection(null)
      setPreviewOpen(false)
    }
  }

  const previewEndgameObjective = (selection: ObjectivePreview) => {
    setSelectedHandObjective(null)
    setSelectedPileId(null)
    setSelectedObjectivePileId(null)
    setEndgameSelection(selection)
    setPreviewOpen(true)
  }

  const toggleOpponentHand = () => {
    const next = !hideOpponentHand
    writeStored('local', HIDE_OPPONENT_KEY, next ? '1' : '0')
    setHideOpponentHand(next)
  }

  const toggleOwnObjectiveHand = () => {
    const next = !hideOwnObjectiveHand
    writeStored('local', HIDE_OWN_OBJECTIVE_KEY, next ? '1' : '0')
    setHideOwnObjectiveHand(next)
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

  const resetAfterDatabaseWipe = async () => {
    await announceDeleted()
    writeStored('session', seatKey, null)
    onLeave()
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return

      if (event.key.toLowerCase() === 'p') {
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
          <button
            type="button"
            className="secondary-button small"
            aria-pressed={showEndgameView}
            onClick={() => setShowEndgameView((current) => !current)}
          >
            {showEndgameView ? 'Retour à la partie' : 'Vue de fin de partie'}
          </button>
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
            <button type="button" className="action-button" onClick={() => setPreviewOpen(true)} disabled={!selectedTopCard}>Agrandir la carte <kbd>P</kbd></button>
          </section>

          <section className="panel">
            <h2 className="panel-title">Mains <span className="accent">cachées</span></h2>
            {PLAYER_IDS.map((playerId) => (
              <button key={playerId} type="button" className="action-button" onClick={() => sendSelectedToHand(playerId)}>
                Envoyer vers la main de {PLAYERS[playerId].label}
              </button>
            ))}
            <button type="button" className={`action-button${hideOpponentHand ? ' is-active' : ''}`} onClick={toggleOpponentHand}>
              {hideOpponentHand ? 'Afficher les mains adverses' : 'Masquer les mains adverses'}
            </button>
            <button
              type="button"
              className={`action-button${hideCampaignBoards ? ' is-active' : ''}`}
              aria-expanded={!hideCampaignBoards}
              aria-controls="campaign-boards"
              onClick={() => setHideCampaignBoards((current) => !current)}
            >
              {hideCampaignBoards ? 'Afficher les deux plateaux' : 'Masquer les deux plateaux'}
            </button>
            <button type="button" className={`action-button${hideOwnObjectiveHand ? ' is-active' : ''}`} onClick={toggleOwnObjectiveHand}>
              {hideOwnObjectiveHand ? 'Afficher ma main objectifs' : 'Masquer ma main objectifs'}
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
            <a className="action-button" href="/TABLE_1913_Regles_ludiques%201.pdf" target="_blank" rel="noreferrer">Consulter les règles ludiques (PDF)</a>
            <p>Clic sur un paquet : le sélectionner; glisser-déposer : le déplacer ou le fusionner avec un autre paquet</p>
            <p>Double-clic sur une pioche : piocher 1 carte; double-clic sur une carte visible : la retourner</p>
            <p><kbd>D</kbd> : piocher dans le paquet sélectionné (ou la pioche); <kbd>F</kbd> : retourner sa carte supérieure</p>
            <p><kbd>P</kbd> : agrandir la carte sélectionnée; <kbd>Échap</kbd> : fermer l'aperçu</p>
            <p>Actions de jeu : mélanger le paquet sélectionné, ou envoyer un paquet vers la main d'un joueur</p>
            <p>Main ({MAX_HAND_SIZE} cartes max) : cliquer sur une carte pour l'agrandir, glisser pour la jouer ou réorganiser sa main</p>
            <p>Glisser un paquet vers une main pour y transférer ses cartes; glisser un objectif vers la table ou une main pour le jouer</p>
            <p>Rivière objectifs : après le départ d'un objectif visible, son emplacement se renouvelle</p>
            <p>Ligne d'un joueur : 7 cartes max, une par emplacement; maintenir Espace pendant le glissement pour déplacer toute la ligne</p>
            <p>Plateaux de mobilisation : glisser ses pions; dans la vue de fin, les deux plateaux sont modifiables</p>
            <p>Dans « Mains cachées » : afficher/masquer les mains adverses, sa main objectifs et les deux plateaux</p>
            <p>« Vue de fin de partie » dans l'en-tête : comparer les objectifs et plateaux; « Retour à la partie » revient au jeu</p>
            <p>Fin de manche : dans chaque groupe de cartes voisines reliées par des radios complètes, chaque ressource rapporte radios complètes × cartes portant cette ressource</p>
            <p>Molette, pincement ou <kbd>+</kbd> <kbd>−</kbd> : zoom · <kbd>0</kbd> : ajuster; glisser le fond pour déplacer la vue</p>
          </section>

          <section className="panel">
            <p className="status-text" aria-live="polite">{message}</p>
            <button type="button" className="action-button" onClick={() => run(resetGame)}>Nouvelle partie</button>
            {seat && <button type="button" className="link-button" onClick={() => updateClaim(null)}>Changer de joueur</button>}
            <button type="button" className="danger-button" onClick={() => void purgeGame()}>Supprimer la partie</button>
            {seat === 'bottom' && <ResetDatabase onReset={resetAfterDatabaseWipe} />}
          </section>
        </aside>

        <main className="play-area">
          {showEndgameView ? (
            <EndgameView
              key={gameId}
              gameId={gameId}
              state={state}
              activePlayer={viewerSeat}
              canEdit={Boolean(seat)}
              onPlayObjective={playEndgameObjective}
              onReturnObjective={returnEndgameObjective}
              onPreviewObjective={previewEndgameObjective}
              onMovePawn={(playerId, pawnId, position) => run((draft) => moveCampaignPawn(draft, playerId, pawnId, position))}
            />
          ) : (
          <div className="playfield-layout">
            <ObjectiveRiver
              piles={state.objectivePiles}
              drawPileId={state.objectiveDrawPileId}
              selectedPileId={selectedObjectivePileId}
              boardScale={boardScale}
              onSelect={selectObjectivePile}
            />
            <Board
              state={state}
              mirrored={seat === 'top'}
              selectedPileId={selectedPileId}
              remoteDrags={remoteDrags}
              canPlayFromHand={Boolean(seat)}
              onSelect={selectPile}
              onPileActivate={handlePileActivate}
              onPileDrop={(pileId, position) => run((draft) => movePile(draft, pileId, position))}
              onMoveObjectiveCard={moveObjectiveToBoard}
              onMovePlayerRow={(playerId, slots) => run((draft) => movePlayerRowGroup(draft, playerId, slots))}
              onPileToHand={(pileId, playerId) => run((draft) => movePileToHand(draft, pileId, playerId))}
              onPlayFromHand={playCard}
              onPlayObjectiveFromHand={playObjectiveCard}
              onBoardScaleChange={setBoardScale}
              onDragMove={broadcastDrag}
              onDragEnd={broadcastDragEnd}
              hasOwnHand={Boolean(seat)}
            >
              {seat && !hideOwnObjectiveHand && (
                <ObjectiveHandOverlay playerId={seat} cards={state.objectiveHands[seat]} isOwn {...objectiveHandProps(seat)} />
              )}
              {seat && !hideOpponentHand && (
                <ObjectiveHandOverlay playerId={opponentSeat} cards={state.objectiveHands[opponentSeat]} isOwn={false} {...objectiveHandProps(opponentSeat)} />
              )}
              {!seat && !hideOpponentHand && PLAYER_IDS.map((playerId) => (
                <ObjectiveHandOverlay key={playerId} playerId={playerId} cards={state.objectiveHands[playerId]} isOwn={false} {...objectiveHandProps(playerId)} />
              ))}
              {!hideOpponentHand && (
                <HandOverlay
                  playerId={opponentSeat}
                  cards={state.hands[opponentSeat]}
                  isOwn={false}
                  onPreview={() => undefined}
                  onReorder={() => undefined}
                  onTakeObjective={takeObjectiveToHand}
                />
              )}
              {seat && (
                <HandOverlay
                  playerId={seat}
                  cards={state.hands[seat]}
                  isOwn
                  onPreview={setHandPreviewIndex}
                  onReorder={(from, to) => run((draft) => reorderHand(draft, seat, from, to))}
                  onTakeObjective={takeObjectiveToHand}
                />
              )}
            </Board>
            <div className="campaign-boards" id="campaign-boards" hidden={hideCampaignBoards} aria-label="Plateaux individuels des joueurs">
              <CampaignBoard
                playerId={opponentSeat}
                positions={state.campaignPawns[opponentSeat]}
                rotated
                readOnly
                onMovePawn={() => undefined}
              />
              <CampaignBoard
                playerId={viewerSeat}
                positions={state.campaignPawns[viewerSeat]}
                rotated={false}
                readOnly={!seat}
                onMovePawn={(pawnId: CampaignPawnId, position) => run((draft) => moveCampaignPawn(draft, viewerSeat, pawnId, position))}
              />
            </div>
          </div>
          )}
        </main>
      </div>

      {!seat && <SeatChooser owners={owners} tabId={tabId} onChoose={chooseSeat} />}
      {previewOpen && selectedTopCard && (
        <CardPreview
          card={selectedTopCard}
          objectiveUpright={Boolean(endgameSelection || selectedHandObjectiveCard || selectedObjectivePile || selectedObjectiveRow)}
          onClose={() => {
            setPreviewOpen(false)
            setEndgameSelection(null)
          }}
          actions={endgameSelection && seat ? (
            <button
              type="button"
              className="primary-button small"
              onClick={() => endgameSelection.source === 'hand'
                ? playEndgameObjective(endgameSelection.playerId, endgameSelection.card.id, endgameSelection.playerId, nextObjectivePosition(state, endgameSelection.playerId))
                : endgameSelection.pileId && returnEndgameObjective(endgameSelection.pileId, endgameSelection.card.id, endgameSelection.playerId)}
            >
              {endgameSelection.source === 'hand' ? 'Jouer sur le plateau' : 'Reprendre en main objectifs'}
            </button>
          ) : selectedHandObjectiveCard && selectedHandObjective?.playerId === seat ? (
            <button type="button" className="primary-button small" onClick={() => playObjectiveCard(selectedHandObjectiveCard.id)}>
              Jouer sur la table
            </button>
          ) : undefined}
        />
      )}
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
