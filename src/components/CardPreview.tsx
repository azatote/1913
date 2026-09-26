import { cardImageUrl } from '../game/cards'
import type { Card } from '../game/types'

type CardPreviewProps = {
  card: Card
  onClose: () => void
}

export function CardPreview({ card, onClose }: CardPreviewProps) {
  const label = card.faceUp ? `Vue agrandie de la carte ${card.code}` : 'Vue agrandie du dos de la carte'

  return (
    <div className="overlay preview" role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
      <figure className="preview-card" onClick={(event) => event.stopPropagation()}>
        <img src={cardImageUrl(card)} alt={label} />
        <figcaption>
          <span>{card.faceUp ? `Carte ${card.code}` : 'Face cachée'}</span>
          <button type="button" className="secondary-button small" onClick={onClose}>Fermer · Échap</button>
        </figcaption>
      </figure>
    </div>
  )
}
