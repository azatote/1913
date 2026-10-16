import { useId, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
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
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryCardId, setGalleryCardId] = useState<string | null>(null)
  const galleryTitleId = useId()

  const openGallery = () => {
    const firstCard = cards[0]
    setGalleryCardId(firstCard?.id ?? null)
    if (firstCard) onSelect(firstCard)
    setGalleryOpen(true)
  }

  const previewGalleryCard = (card: Card) => {
    setGalleryOpen(false)
    onPreview(card)
  }

  return (
    <>
      <section
        className={`hand-overlay objective-hand-overlay${isOwn ? ' is-own' : ' is-opponent'}`}
        aria-label={`Main objectifs de ${PLAYERS[playerId].label}`}
      >
        {isOwn ? (
          <button
            type="button"
            className="hand-label objective-hand-label"
            aria-haspopup="dialog"
            aria-expanded={galleryOpen}
            onClick={openGallery}
          >
            Vos objectifs · {cards.length}
          </button>
        ) : (
          <span className="hand-label">
            Objectifs de {PLAYERS[playerId].label} · {cards.length}
          </span>
        )}
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
              style={{ '--i': Math.max(-3, Math.min(3, index - (cards.length - 1) / 2)), zIndex: cards.length - index } as CSSProperties}
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
      {isOwn && galleryOpen && createPortal(
        <div
          className="overlay objective-gallery-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby={galleryTitleId}
          onClick={() => setGalleryOpen(false)}
          onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Escape') {
              setGalleryOpen(false)
              return
            }
            if (event.key.toLowerCase() === 'p') {
              event.preventDefault()
              event.stopPropagation()
              const card = cards.find((entry) => entry.id === galleryCardId)
              if (card) previewGalleryCard(card)
            }
          }}
        >
          <section className="objective-gallery" onClick={(event) => event.stopPropagation()}>
            <header className="objective-gallery-header">
              <h2 id={galleryTitleId}>Vos objectifs <span>{cards.length}</span></h2>
              <button type="button" className="secondary-button small" autoFocus onClick={() => setGalleryOpen(false)}>
                Fermer
              </button>
            </header>
            {cards.length > 0 ? (
              <div className="objective-gallery-grid">
                {cards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className="objective-gallery-card"
                    onFocus={() => {
                      setGalleryCardId(card.id)
                      onSelect(card)
                    }}
                    onPointerEnter={() => {
                      setGalleryCardId(card.id)
                      onSelect(card)
                    }}
                    onClick={() => previewGalleryCard(card)}
                    title={`Agrandir l’objectif ${card.code}`}
                  >
                    <img src={cardFaceUrl(card.code, card.kind)} alt={`Objectif ${card.code}`} decoding="async" />
                    <span>Objectif {card.code}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="objective-gallery-empty">Aucun objectif dans votre main.</p>
            )}
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}