import { type CSSProperties, type DragEvent } from 'react'
import { cardImageUrl } from '../game/cards'
import { CARD_HEIGHT, CARD_WIDTH, OBJECTIVE_MARKET_SIZE } from '../game/logic'
import type { ObjectivePile } from '../game/types'
import { OBJECTIVE_CARD_MIME } from './dnd'

type ObjectiveRiverProps = {
  piles: ObjectivePile[]
  drawPileId: string | null
  selectedPileId: string | null
  boardScale: number
  onSelect: (pileId: string) => void
}

export function ObjectiveRiver({ piles, drawPileId, selectedPileId, boardScale, onSelect }: ObjectiveRiverProps) {
  const cardWidth = CARD_HEIGHT * boardScale
  const cardHeight = CARD_WIDTH * boardScale
  const riverStyle = {
    '--river-card-height': `${cardHeight}px`,
    '--river-card-width': `${cardWidth}px`,
  } as CSSProperties

  const startDrag = (event: DragEvent<HTMLButtonElement>, pile: ObjectivePile) => {
    if (pile.id === drawPileId) {
      event.preventDefault()
      return
    }

    event.dataTransfer.setData(OBJECTIVE_CARD_MIME, pile.id)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <section className="objective-river" style={riverStyle} aria-label="Rivière des cartes objectif">
      <h2 className="objective-river-title">Objectifs</h2>
      <div className="objective-river-slots">
        {Array.from({ length: OBJECTIVE_MARKET_SIZE + 1 }, (_, slot) => {
          const pile = piles.find((entry) => entry.slot === slot)
          if (!pile) {
            return <div key={slot} className="objective-river-slot is-empty" aria-label="Emplacement objectif vide" />
          }

          const isDrawPile = pile.id === drawPileId
          const topCard = pile.cards.at(-1)
          const selected = pile.id === selectedPileId
          return (
            <button
              key={pile.id}
              type="button"
              className={`objective-river-slot${isDrawPile ? ' is-draw-pile' : ''}${selected ? ' is-selected' : ''}`}
              aria-label={isDrawPile ? `Pioche objectifs, ${pile.cards.length} cartes` : `Objectif ${topCard?.code ?? ''}`}
              aria-pressed={selected}
              draggable={!isDrawPile}
              onClick={() => onSelect(pile.id)}
              onDragStart={(event) => startDrag(event, pile)}
              title={isDrawPile ? `${pile.cards.length} cartes objectif` : `Déplacer l'objectif ${topCard?.code ?? ''}`}
            >
              {topCard && <img className="objective-card-rotated" src={cardImageUrl(topCard)} alt="" draggable={false} decoding="async" />}
              {isDrawPile && <span className="objective-river-count">{pile.cards.length}</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}