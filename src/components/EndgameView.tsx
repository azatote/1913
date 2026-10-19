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

function allowDrop(event: DragEvent, mimeType: string, canEdit: boolean) {
  if (!canEdit || !event.dataTransfer.types.includes(mimeType)) return
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

  const renderObjectives = (playerId: PlayerId) => (
    <section className="endgame-objectives" aria-label={`Objectifs de ${PLAYERS[playerId].label}`}>
      <h2>{PLAYERS[playerId].label} · Objectifs</h2>
      <div className="endgame-objective-zones">
        <section
          className="endgame-objective-zone"
          aria-label={`Objectifs en main de ${PLAYERS[playerId].label}`}
          onDragOver={(event) => allowDrop(event, BOARD_OBJECTIVE_MIME, canEdit)}
          onDrop={(event) => {
            const payload = readDragPayload<BoardObjectiveDrag>(event, BOARD_OBJECTIVE_MIME)
            if (!canEdit || !payload) return
            event.preventDefault()
            onReturnObjective(payload.pileId, payload.cardId, playerId)
          }}
        >
          <h3>En main <span>{state.objectiveHands[playerId].length}</span></h3>
          <div className="endgame-objective-cards">
            {state.objectiveHands[playerId].map((card) => (
              <button
                key={card.id}
                type="button"
                className="endgame-objective-card"
                draggable={canEdit}
                title={canEdit ? `Objectif ${card.code} · glisser vers un plateau pour le jouer` : `Objectif ${card.code}`}
                onClick={() => onPreviewObjective({ card, playerId, source: 'hand' })}
                onDragStart={(event) => {
                  event.dataTransfer.setData(OBJECTIVE_HAND_MIME, JSON.stringify({ sourcePlayerId: playerId, cardId: card.id } satisfies HandObjectiveDrag))
                  event.dataTransfer.effectAllowed = 'move'
                }}
              >
                <img src={cardFaceUrl(card.code, 'objective')} alt={`Objectif ${card.code}`} draggable={false} />
              </button>
            ))}
            {state.objectiveHands[playerId].length === 0 && <span className="endgame-objective-empty">Aucun objectif en main</span>}
          </div>
        </section>

        <section
          className="endgame-objective-zone is-played"
          aria-label={`Objectifs sur le plateau de ${PLAYERS[playerId].label}`}
          onDragOver={(event) => allowDrop(event, OBJECTIVE_HAND_MIME, canEdit)}
          onDrop={(event) => {
            const payload = readDragPayload<HandObjectiveDrag>(event, OBJECTIVE_HAND_MIME)
            if (!canEdit || !payload) return
            event.preventDefault()
            const bounds = event.currentTarget.getBoundingClientRect()
            const x = ((event.clientX - bounds.left) / bounds.width) * BOARD_WIDTH
            onPlayObjective(payload.sourcePlayerId, payload.cardId, playerId, { x, y: objectiveRowY(playerId) })
          }}
        >
          <h3>Sur le plateau <span>{boardObjectives[playerId].length}</span></h3>
          <div className="endgame-objective-cards">
            {boardObjectives[playerId].map(({ pileId, card }) => (
              <button
                key={`${pileId}-${card.id}`}
                type="button"
                className="endgame-objective-card"
                draggable={canEdit}
                title={canEdit ? `Objectif ${card.code} · glisser vers une main objectifs pour le reprendre` : `Objectif ${card.code}`}
                onClick={() => onPreviewObjective({ card, playerId, source: 'board', pileId })}
                onDragStart={(event) => {
                  event.dataTransfer.setData(BOARD_OBJECTIVE_MIME, JSON.stringify({ pileId, cardId: card.id } satisfies BoardObjectiveDrag))
                  event.dataTransfer.effectAllowed = 'move'
                }}
              >
                <img src={cardFaceUrl(card.code, 'objective')} alt={`Objectif ${card.code}`} draggable={false} />
              </button>
            ))}
            {boardObjectives[playerId].length === 0 && <span className="endgame-objective-empty">Aucun objectif joué</span>}
          </div>
        </section>
      </div>
    </section>
  )

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