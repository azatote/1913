import type { DragEvent } from 'react'
import { CARD_BACK_URL, cardFaceUrl } from '../game/cards'
import { PLAYERS } from '../game/logic'
import type { Card, PlayerId } from '../game/types'
import { HAND_CARD_MIME, isHandCardDrag, readHandCardIndex } from './dnd'

type HandProps = {
  playerId: PlayerId
  cards: Card[]
  isOwn: boolean
  placement: 'top' | 'bottom'
  onPlay: (index: number) => void
  onReorder: (from: number, to: number) => void
}

export function Hand({ playerId, cards, isOwn, placement, onPlay, onReorder }: HandProps) {
  const plural = cards.length > 1 ? 's' : ''

  const allowReorder = (event: DragEvent<HTMLElement>) => {
    if (!isOwn || !isHandCardDrag(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const dropAt = (event: DragEvent<HTMLElement>, target: number) => {
    const from = readHandCardIndex(event.dataTransfer)
    if (!isOwn || from === null) return
    event.preventDefault()
    event.stopPropagation()
    onReorder(from, target)
  }

  return (
    <section
      className={`hand hand-${placement}${isOwn ? ' is-own' : ''}`}
      data-hand-player={playerId}
      aria-label={`Main de ${PLAYERS[playerId].label}`}
      onDragOver={allowReorder}
      onDrop={(event) => dropAt(event, cards.length - 1)}
    >
      <header className="hand-header">
        <span className="pill">{isOwn ? 'Votre main' : 'Main adverse'}</span>
        <strong>{PLAYERS[playerId].label}</strong>
        <small>{cards.length} carte{plural} {isOwn ? `visible${plural}` : `cachée${plural}`}</small>
      </header>

      <div className="hand-cards">
        {cards.length === 0 && (
          <p className="hand-empty">{isOwn ? 'Glissez une carte de la table ici pour la prendre en main.' : 'Aucune carte en main.'}</p>
        )}
        {cards.map((card, index) => isOwn ? (
          <button
            key={card.id}
            type="button"
            className="hand-card"
            draggable
            title="Double-cliquez ou glissez sur la table pour jouer"
            onDoubleClick={() => onPlay(index)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onPlay(index)
            }}
            onDragStart={(event) => {
              event.dataTransfer.setData(HAND_CARD_MIME, String(index))
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={allowReorder}
            onDrop={(event) => dropAt(event, index)}
          >
            <img src={cardFaceUrl(card.code)} alt={`Carte ${card.code}`} draggable={false} />
          </button>
        ) : (
          <div key={card.id} className="hand-card is-hidden">
            <img src={CARD_BACK_URL} alt="Carte cachée" draggable={false} />
          </div>
        ))}
      </div>
    </section>
  )
}
