import { useState, type DragEvent } from 'react'
import { RESOURCES } from '../game/cardData'
import { cardFaceUrl } from '../game/cards'
import { BOARD_WIDTH, OBJECTIVE_ROW_INDEX, PLAYERS, PLAYER_IDS, nearestRowIndex, objectiveRowY, opponentOf } from '../game/logic'
import { scorePlayerRow } from '../game/scoring'
import type { CampaignPawnId, Card, GameState, PlayerId, Point } from '../game/types'
import { readStored, writeStored } from '../lib/storage'
import { CampaignBoard } from './CampaignBoard'
import { COUNTRY_PAWN_IMAGES, RESOURCE_PAWN_IMAGES } from './pawnImages'

const ENDGAME_OBJECTIVE_MIME = 'application/x-nd1913-endgame-objective'

type ObjectiveDrag = { sourcePlayerId: PlayerId; cardId: string; source: 'hand' | 'board'; pileId?: string }
type ObjectiveRow = string[]
type ObjectiveRows = Record<PlayerId, ObjectiveRow[]>
export type ObjectivePreview = { card: Card; playerId: PlayerId; source: 'hand' | 'board'; pileId?: string }

type EndgameViewProps = {
  gameId: string
  state: GameState
  activePlayer: PlayerId
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

function loadObjectiveRows(gameId: string, playerId: PlayerId): ObjectiveRows[PlayerId] {
  try {
    const stored = JSON.parse(readStored('local', `nd1913.endgame-rows.${gameId}.${playerId}`) ?? '[]') as unknown
    if (!Array.isArray(stored)) return [[]]
    const rows = stored
      .filter((row): row is unknown[] => Array.isArray(row))
      .map((row) => row.filter((cardId): cardId is string => typeof cardId === 'string'))
    return rows.length > 0 ? rows : [[]]
  } catch {
    return [[]]
  }
}

function normalizeObjectiveRows(rows: ObjectiveRow[], cardIds: string[]): ObjectiveRow[] {
  const remaining = new Set(cardIds)
  const normalized = rows.map((row) => row.filter((cardId) => {
    if (!remaining.has(cardId)) return false
    remaining.delete(cardId)
    return true
  }))
  if (normalized.length === 0) normalized.push([])
  normalized[0].push(...remaining)
  return normalized
}

function allowObjectiveDrop(event: DragEvent, canEdit: boolean) {
  if (!canEdit || !event.dataTransfer.types.includes(ENDGAME_OBJECTIVE_MIME)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
}

export function EndgameView({ gameId, state, activePlayer, canEdit, onPlayObjective, onReturnObjective, onPreviewObjective, onMovePawn }: EndgameViewProps) {
  const playerOrder = [activePlayer, opponentOf(activePlayer)]
  const [savedRows, setSavedRows] = useState<ObjectiveRows>(() => ({
    bottom: loadObjectiveRows(gameId, 'bottom'),
    top: loadObjectiveRows(gameId, 'top'),
  }))
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
    const objectiveById = new Map(objectives.map((objective) => [objective.card.id, objective]))
    const rows = normalizeObjectiveRows(savedRows[playerId], objectives.map(({ card }) => card.id))

    const saveRows = (nextRows: ObjectiveRow[]) => {
      setSavedRows((current) => ({ ...current, [playerId]: nextRows }))
      writeStored('local', `nd1913.endgame-rows.${gameId}.${playerId}`, JSON.stringify(nextRows))
    }

    const dropOnRow = (event: DragEvent<HTMLDivElement>, rowIndex: number) => {
      const dragged = readDragPayload<ObjectiveDrag>(event, ENDGAME_OBJECTIVE_MIME)
      if (!dragged || !canEdit) return
      event.preventDefault()

      if (dragged.sourcePlayerId !== playerId) {
        if (dragged.source === 'board' && dragged.pileId) {
          onReturnObjective(dragged.pileId, dragged.cardId, playerId)
        } else if (dragged.source === 'hand') {
          const bounds = event.currentTarget.getBoundingClientRect()
          const x = ((event.clientX - bounds.left) / bounds.width) * BOARD_WIDTH
          onPlayObjective(dragged.sourcePlayerId, dragged.cardId, playerId, { x, y: objectiveRowY(playerId) })
        }
        return
      }

      const nextRows = rows.map((row) => row.filter((cardId) => cardId !== dragged.cardId))
      const destination = nextRows[rowIndex]
      if (!destination || !objectiveById.has(dragged.cardId)) return

      const targetCard = event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-objective-card-id]')
        : null
      const targetCardIndex = targetCard?.dataset.objectiveCardId
        ? destination.indexOf(targetCard.dataset.objectiveCardId)
        : -1
      const targetBounds = targetCard?.getBoundingClientRect()
      const insertIndex = targetCardIndex < 0
        ? destination.length
        : targetCardIndex + (targetBounds && event.clientX > targetBounds.left + targetBounds.width / 2 ? 1 : 0)
      destination.splice(insertIndex, 0, dragged.cardId)
      saveRows(nextRows)
    }

    const removeRow = (rowIndex: number) => {
      if (rows.length < 2) return
      const nextRows = rows.map((row) => [...row])
      const [removed] = nextRows.splice(rowIndex, 1)
      nextRows[Math.max(0, rowIndex - 1)].push(...removed)
      saveRows(nextRows)
    }

    return (
      <section
        className="endgame-objectives"
        aria-label={`Objectifs de ${PLAYERS[playerId].label}`}
      >
        <h2>{PLAYERS[playerId].label} · Objectifs <span>{objectives.length}</span></h2>
        <div className="endgame-objective-rows">
          {rows.map((row, rowIndex) => (
            <section key={`${playerId}-row-${rowIndex}`} className="endgame-objective-row-group">
              <header className="endgame-objective-row-header">
                <span>Ligne {rowIndex + 1}</span>
                {rows.length > 1 && (
                  <button
                    type="button"
                    className="endgame-remove-row"
                    aria-label={`Supprimer la ligne ${rowIndex + 1}`}
                    title="Supprimer la ligne"
                    onClick={() => removeRow(rowIndex)}
                  >
                    −
                  </button>
                )}
              </header>
              <div
                className="endgame-objective-row"
                onDragOver={(event) => allowObjectiveDrop(event, canEdit)}
                onDrop={(event) => dropOnRow(event, rowIndex)}
              >
                {row.map((cardId) => {
                  const objective = objectiveById.get(cardId)
                  if (!objective) return null
                  return (
                    <button
                      key={objective.card.id}
                      type="button"
                      className="endgame-objective-card"
                      data-objective-card-id={objective.card.id}
                      draggable={canEdit}
                      title={`Objectif ${objective.card.code}`}
                      onClick={() => onPreviewObjective({
                        card: objective.card,
                        playerId,
                        source: objective.source,
                        ...(objective.source === 'board' ? { pileId: objective.pileId } : {}),
                      })}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(ENDGAME_OBJECTIVE_MIME, JSON.stringify({
                          sourcePlayerId: playerId,
                          cardId: objective.card.id,
                          source: objective.source,
                          ...(objective.source === 'board' ? { pileId: objective.pileId } : {}),
                        } satisfies ObjectiveDrag))
                        event.dataTransfer.effectAllowed = 'move'
                      }}
                    >
                      <img src={cardFaceUrl(objective.card.code, 'objective')} alt={`Objectif ${objective.card.code}`} draggable={false} />
                    </button>
                  )
                })}
                {row.length === 0 && <span className="endgame-objective-empty">Déposer des objectifs ici</span>}
              </div>
            </section>
          ))}
        </div>
        <button type="button" className="secondary-button small endgame-add-row" onClick={() => saveRows([...rows, []])}>Ajouter une ligne</button>
      </section>
    )
  }

  const renderRoundScore = (playerId: PlayerId) => {
    const { groups, impossibleConnections } = scorePlayerRow(state, playerId)
    return (
      <section key={`score-${playerId}`} className="endgame-round-score" aria-label={`Fin de manche de ${PLAYERS[playerId].label}`}>
        <h2>{PLAYERS[playerId].label} · Fin de manche</h2>
        {groups.length === 0 ? (
          <p className="endgame-score-empty">Aucun camp relié par une radio complète.</p>
        ) : (
          <ol className="endgame-score-groups">
            {groups.map((group, index) => (
              <li key={index}>
                <p className="endgame-score-group-title">
                  {COUNTRY_PAWN_IMAGES[group.country] && <img className="endgame-score-pawn" src={COUNTRY_PAWN_IMAGES[group.country]} alt="" />}
                  <span>Camp de {group.country} · {group.cards.length} cartes · {group.completeRadios} radio{group.completeRadios > 1 ? 's' : ''} complète{group.completeRadios > 1 ? 's' : ''}</span>
                </p>
                {group.invalidated && <p className="endgame-score-invalidated">Camp annulé : liaison avec un autre pays.</p>}
                <p className="endgame-score-cards">{group.cards.map((card) => card.title).join(' · ')}</p>
                <div className="endgame-score-resources">
                  {RESOURCES.filter(({ id }) => group.resourceCounts[id] > 0)
                    .map(({ id, label }) => (
                      <div key={id} className="endgame-score-resource">
                        <span className="endgame-score-resource-name">
                          <img src={RESOURCE_PAWN_IMAGES[id]} alt="" />
                          {label}
                        </span>
                        <small>{group.resourceCounts[id]} carte{group.resourceCounts[id] > 1 ? 's' : ''} × {group.completeRadios} radio{group.completeRadios > 1 ? 's' : ''}</small>
                        <strong>{group.scores[id]}</strong>
                      </div>
                    ))}
                </div>
              </li>
            ))}
          </ol>
        )}
        {impossibleConnections.length > 0 && (
          <aside className="endgame-impossible-connections" aria-label="Liaisons radio impossibles entre pays">
            <h3>Liaisons impossibles</h3>
            {impossibleConnections.map(({ leftCard, rightCard, radios }, index) => (
              <p key={`${leftCard.code}-${rightCard.code}-${index}`}>
                {leftCard.country} · {leftCard.title} ↔ {rightCard.country} · {rightCard.title} : {radios} radio{radios > 1 ? 's' : ''} complète{radios > 1 ? 's' : ''}, liaison interdite; les deux camps sont annulés
              </p>
            ))}
          </aside>
        )}
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
        {playerOrder.map(renderRoundScore)}
        {playerOrder.map(renderObjectives)}
        {playerOrder.map((playerId) => (
          <section key={playerId} className="endgame-campaign" aria-label={`Plateau de mobilisation de ${PLAYERS[playerId].label}`}>
            <h2>{PLAYERS[playerId].label} · Mobilisation</h2>
            <CampaignBoard
              playerId={playerId}
              positions={state.campaignPawns[playerId]}
              rotated={false}
              readOnly={!canEdit || playerId !== activePlayer}
              onMovePawn={(pawnId: CampaignPawnId, position) => {
                if (canEdit && playerId === activePlayer) onMovePawn(playerId, pawnId, position)
              }}
            />
          </section>
        ))}
      </div>
    </div>
  )
}