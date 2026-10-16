import { cardImageUrl } from '../game/cards'
import { PLAYERS } from '../game/logic'
import type { Card, PlayerId } from '../game/types'

type ObjectiveHandOverlayProps = {
  playerId: PlayerId
  cards: Card[]
  isOwn: boolean
}

export function ObjectiveHandOverlay({ playerId, cards, isOwn }: ObjectiveHandOverlayProps) {
  return (
    <section
      className={`objective-hand-overlay${isOwn ? ' is-own' : ' is-opponent'}`}
      aria-label={`Main objectifs de ${PLAYERS[playerId].label}`}
    >
      <span className="objective-hand-label">
        {isOwn ? 'Vos objectifs' : `Objectifs de ${PLAYERS[playerId].label}`} · {cards.length}
      </span>
      <div className="objective-hand-cards">
        {cards.map((card) => (
          <div key={card.id} className="objective-hand-card" title={`Objectif ${card.code}`}>
            <img className="objective-card-rotated" src={cardImageUrl(card)} alt={`Objectif ${card.code}`} draggable={false} decoding="async" />
          </div>
        ))}
      </div>
    </section>
  )
}