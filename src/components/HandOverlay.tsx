import type { CSSProperties, DragEvent } from 'react'
import { CARD_BACK_URL, cardFaceUrl } from '../game/cards'
import { MAX_HAND_SIZE, PLAYERS } from '../game/logic'
import type { Card, PlayerId } from '../game/types'
import {
  HAND_CARD_MIME,
  isHandCardDrag,
  isObjectiveCardDrag,
  readHandCardIndex,
  readObjectivePileId,
} from './dnd'

type HandOverlayProps = {
  playerId: PlayerId
  cards: Card[]
  isOwn: boolean
  onPreview: (index: number) => void
  onReorder: (from: number, to: number) => void
  onTakeObjective: (objectivePileId: string, playerId: PlayerId) => void
}

// Cards held "in first person" over the table: own hand at the bottom, opponent's in a corner.
export function HandOverlay({ playerId, cards, isOwn, onPreview, onReorder, onTakeObjective }: HandOverlayProps) {
  const allowDrop = (event: DragEvent<HTMLElement>) => {
    if (!isOwn || (!isHandCardDrag(event.dataTransfer) && !isObjectiveCardDrag(event.dataTransfer))) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const dropAt = (event: DragEvent<HTMLElement>, target: number) => {
    const objectivePileId = readObjectivePileId(event.dataTransfer)
    if (isOwn && objectivePileId) {
      event.preventDefault()
      event.stopPropagation()
      onTakeObjective(objectivePileId, playerId)
      return
    }

    const from = readHandCardIndex(event.dataTransfer)
    if (!isOwn || from === null) return
    event.preventDefault()
    event.stopPropagation()
    onReorder(from, target)
  }

  const fanStyle = (index: number) => ({ '--i': index - (cards.length - 1) / 2 }) as CSSProperties

  return (
    <section
      className={`hand-overlay ${isOwn ? 'is-own' : 'is-opponent'}`}
      aria-label={`Main de ${PLAYERS[playerId].label}`}
    >
      <span className="hand-label">
        {isOwn ? 'Votre main' : `Main de ${PLAYERS[playerId].label}`} · {cards.length}/{MAX_HAND_SIZE}
      </span>
      <div
        className="hand-fan"
        data-hand-player={playerId}
        onDragOver={allowDrop}
        onDrop={(event) => dropAt(event, Math.max(0, cards.length - 1))}
      >
        {cards.map((card, index) => isOwn ? (
          <button
            key={card.id}
            type="button"
            className="hand-card"
            style={fanStyle(index)}
            draggable
            title="Cliquez pour agrandir, glissez sur la table pour jouer"
            onClick={() => onPreview(index)}
            onDragStart={(event) => {
              event.dataTransfer.setData(HAND_CARD_MIME, String(index))
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={allowDrop}
            onDrop={(event) => dropAt(event, index)}
          >
            <img
              src={cardFaceUrl(card.code, card.kind)}
              alt={card.kind === 'objective' ? `Objectif ${card.code}` : `Carte ${card.code}`}
              draggable={false}
              decoding="async"
            />
          </button>
        ) : (
          <div key={card.id} className="hand-card is-hidden" style={fanStyle(index)}>
            <img src={CARD_BACK_URL} alt="Carte cachée" draggable={false} decoding="async" />
          </div>
        ))}
        {isOwn && Array.from({ length: MAX_HAND_SIZE - cards.length }, (_, index) => (
          <div key={`slot-${index}`} className="hand-slot">Glissez une carte ici</div>
        ))}
      </div>
    </section>
  )
}
