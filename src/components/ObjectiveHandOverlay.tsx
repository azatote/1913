import type { CSSProperties } from 'react'
import { cardFaceUrl } from '../game/cards'
import { PLAYERS } from '../game/logic'
import type { Card, PlayerId } from '../game/types'
import { isObjectiveCardDrag, OBJECTIVE_HAND_MIME, readObjectivePileId } from './dnd'

type ObjectiveHandOverlayProps = {
  playerId: PlayerId
  cards: Card[]
  isOwn: boolean
  onSelect: (card: Card) => void
  onPreview: (card: Card) => void
  onTakeObjective: (pileId: string, playerId: PlayerId) => void
}

export function ObjectiveHandOverlay({ playerId, cards, isOwn, onSelect, onPreview, onTakeObjective }: ObjectiveHandOverlayProps) {
  return (
    <section
      className={`hand-overlay objective-hand-overlay${isOwn ? ' is-own' : ' is-opponent'}`}
      aria-label={`Main objectifs de ${PLAYERS[playerId].label}`}
    >
      <span className="hand-label">
        {isOwn ? 'Vos objectifs' : `Objectifs de ${PLAYERS[playerId].label}`} · {cards.length}
      </span>
      <div
        className="hand-fan objective-hand-fan"
        data-hand-player={isOwn ? playerId : undefined}
        onDragOver={(event) => {
          if (!isOwn || !isObjectiveCardDrag(event.dataTransfer)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(event) => {
          const pileId = readObjectivePileId(event.dataTransfer)
          if (!isOwn || !pileId) return
          event.preventDefault()
          event.stopPropagation()
          onTakeObjective(pileId, playerId)
        }}
      >
        {cards.map((card, index) => (
          <button
            key={card.id}
            type="button"
            className="hand-card"
            draggable={isOwn}
            style={{ '--i': Math.max(-3, Math.min(3, index - (cards.length - 1) / 2)) } as CSSProperties}
            title={`Objectif ${card.code}`}
            onFocus={() => onSelect(card)}
            onPointerEnter={() => onSelect(card)}
            onClick={() => onPreview(card)}
            onDragStart={(event) => {
              if (!isOwn) return
              event.dataTransfer.setData(OBJECTIVE_HAND_MIME, card.id)
              event.dataTransfer.effectAllowed = 'move'
            }}
          >
            <img src={cardFaceUrl(card.code, card.kind)} alt={`Objectif ${card.code}`} draggable={false} decoding="async" />
          </button>
        ))}
        {isOwn && cards.length === 0 && <div className="hand-slot">Objectifs</div>}
      </div>
    </section>
  )
}