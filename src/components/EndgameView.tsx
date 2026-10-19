import type { DragEvent } from 'react'
import { cardFaceUrl } from '../game/cards'
import { BOARD_WIDTH, OBJECTIVE_ROW_INDEX, PLAYERS, PLAYER_IDS, nearestRowIndex, objectiveRowY } from '../game/logic'
import type { CampaignPawnId, Card, GameState, PlayerId, Point } from '../game/types'
import { CampaignBoard } from './CampaignBoard'
import { OBJECTIVE_HAND_MIME } from './dnd'

const BOARD_OBJECTIVE_MIME = 'application/x-nd1913-board-objective'

type HandObjectiveDrag = { sourcePlayerId: PlayerId; cardId: string }
type BoardObjectiveDrag = { pileId: string; cardId: string }
export type ObjectivePreview = { card: Card; playerId: PlayerId; source: 'hand' | 'board'; pileId?: string }

type EndgameViewProps = {
  state: GameState
  canEdit: boolean
  onPlayObjective: (sourcePlayerId: PlayerId, cardId: string, targetPlayerId: PlayerId, position: Point) => void
  onReturnObjective: (pileId: string, cardId: string, playerId: PlayerId) => void
  onPreviewObjective: (selection: ObjectivePreview) => void
  onMovePawn: (playerId: PlayerId, pawnId: CampaignPawnId, position: Point) => void
}

function readDragPayload<T>(event: DragEvent, mimeType: string): T | null {
  try {
    return JSON.parse(event.dataTransfer.getData(mimeType)) as T
  } catch {
    return null
  }
}

function allowObjectiveDrop(event: DragEvent, canEdit: boolean) {
  if (!canEdit || ![OBJECTIVE_HAND_MIME, BOARD_OBJECTIVE_MIME].some((mimeType) => event.dataTransfer.types.includes(mimeType))) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
}

export function EndgameView({ state, canEdit, onPlayObjective, onReturnObjective, onPreviewObjective, onMovePawn }: EndgameViewProps) {
  const boardObjectives: Record<PlayerId, { pileId: string; card: Card }[]> = { top: [], bottom: [] }
  for (const pile of state.piles) {
    const playerId = PLAYER_IDS.find((id) => nearestRowIndex(pile.y) === OBJECTIVE_ROW_INDEX[id])
    if (!playerId) continue
    for (const card of pile.cards) {
      if (card.kind === 'objective') boardObjectives[playerId].push({ pileId: pile.id, card })
    }
  }

  const renderObjectives = (playerId: PlayerId) => {
    const objectives: (
      | { card: Card; source: 'hand' }
      | { card: Card; source: 'board'; pileId: string }
    )[] = [
      ...state.objectiveHands[playerId].map((card) => ({ card, source: 'hand' as const })),
      ...boardObjectives[playerId].map(({ pileId, card }) => ({ card, source: 'board' as const, pileId })),
    ]

    return (
      <section
        className="endgame-objectives"
        aria-label={`Objectifs de ${PLAYERS[playerId].label}`}
        onDragOver={(event) => allowObjectiveDrop(event, canEdit)}
        onDrop={(event) => {
          const boardCard = readDragPayload<BoardObjectiveDrag>(event, BOARD_OBJECTIVE_MIME)
          if (boardCard && canEdit) {
            event.preventDefault()
            onReturnObjective(boardCard.pileId, boardCard.cardId, playerId)
            return
          }

          const handCard = readDragPayload<HandObjectiveDrag>(event, OBJECTIVE_HAND_MIME)
          if (!handCard || !canEdit) return
          event.preventDefault()
          const bounds = event.currentTarget.getBoundingClientRect()
          const x = ((event.clientX - bounds.left) / bounds.width) * BOARD_WIDTH
          onPlayObjective(handCard.sourcePlayerId, handCard.cardId, playerId, { x, y: objectiveRowY(playerId) })
        }}
      >
        <h2>{PLAYERS[playerId].label} · Objectifs <span>{objectives.length}</span></h2>
        <div className="endgame-objective-cards">
          {objectives.map((objective) => (
            <button
              key={objective.card.id}
              type="button"
              className="endgame-objective-card"
              draggable={canEdit}
              title={`Objectif ${objective.card.code}`}
              onClick={() => onPreviewObjective({
                card: objective.card,
                playerId,
                source: objective.source,
                ...(objective.source === 'board' ? { pileId: objective.pileId } : {}),
              })}
              onDragStart={(event) => {
                if (objective.source === 'hand') {
                  event.dataTransfer.setData(OBJECTIVE_HAND_MIME, JSON.stringify({ sourcePlayerId: playerId, cardId: objective.card.id } satisfies HandObjectiveDrag))
                } else {
                  event.dataTransfer.setData(BOARD_OBJECTIVE_MIME, JSON.stringify({ pileId: objective.pileId, cardId: objective.card.id } satisfies BoardObjectiveDrag))
                }
                event.dataTransfer.effectAllowed = 'move'
              }}
            >
              <img src={cardFaceUrl(objective.card.code, 'objective')} alt={`Objectif ${objective.card.code}`} draggable={false} />
            </button>
          ))}
          {objectives.length === 0 && <span className="endgame-objective-empty">Aucun objectif</span>}
        </div>
      </section>
    )
  }

  return (
    <div className="endgame-view">
      <header className="endgame-view-header">
        <span className="eyebrow">Vue de fin de partie</span>
        <p>Les objectifs et les pions restent liés à la partie et peuvent être modifiés.</p>
      </header>
      <div className="endgame-matrix">
        {PLAYER_IDS.map(renderObjectives)}
        {PLAYER_IDS.map((playerId) => (
          <section key={playerId} className="endgame-campaign" aria-label={`Plateau de mobilisation de ${PLAYERS[playerId].label}`}>
            <h2>{PLAYERS[playerId].label} · Mobilisation</h2>
            <CampaignBoard
              playerId={playerId}
              positions={state.campaignPawns[playerId]}
              rotated={playerId === 'top'}
              readOnly={!canEdit}
              onMovePawn={(pawnId: CampaignPawnId, position) => onMovePawn(playerId, pawnId, position)}
            />
          </section>
        ))}
      </div>
    </div>
  )
}