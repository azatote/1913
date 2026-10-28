import { memo, type PointerEvent as ReactPointerEvent } from 'react'
import { cardImageUrl } from '../../game/cards'
import { formatCardCount, getTopCard } from '../../game/logic'
import type { Pile } from '../../game/types'
import { toCqw } from './boardGeometry'

export type PileHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, pileId: string) => void
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>, pileId: string) => void
  onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => void
}

function stackDepth(count: number) {
  if (count > 35) return 4
  if (count > 15) return 3
  if (count > 5) return 2
  return count > 1 ? 1 : 0
}

type PileViewProps = PileHandlers & {
  pile: Pile
  viewX: number
  viewY: number
  scale: number
  zIndex: number
  selected: boolean
  dragging: boolean
  remote: boolean
  opponentRow: boolean
  objectiveRow: boolean
}

export const PileView = memo(function PileView({
  pile,
  viewX,
  viewY,
  scale,
  zIndex,
  selected,
  dragging,
  remote,
  opponentRow,
  objectiveRow,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: PileViewProps) {
  const topCard = getTopCard(pile)
  const className = [
    'pile',
    selected && 'is-selected',
    dragging && 'is-dragging',
    remote && 'is-remote-drag',
    opponentRow && 'is-opponent-row',
    objectiveRow && 'is-objective-row',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={className}
      style={{ transform: `translate(${toCqw(viewX)}, ${toCqw(viewY)}) scale(${scale})`, zIndex }}
      role="button"
      aria-label={`${topCard?.faceUp ? `Carte ${topCard.code}` : 'Paquet face cachée'}, ${formatCardCount(pile.cards.length)}`}
      aria-pressed={selected}
      onPointerDown={(event) => onPointerDown(event, pile.id)}
      onPointerMove={(event) => onPointerMove(event, pile.id)}
      onPointerUp={(event) => onPointerEnd(event, false)}
      onPointerCancel={(event) => onPointerEnd(event, true)}
    >
      <div className={`pile-stack depth-${stackDepth(pile.cards.length)}`}>
        {topCard && (
          <img
            className={topCard.kind === 'objective' ? 'is-objective-card' : undefined}
            src={cardImageUrl(topCard)}
            alt=""
            draggable={false}
            decoding="async"
          />
        )}
      </div>
      {pile.cards.length > 1 && <span className="pile-count">{pile.cards.length}</span>}
    </div>
  )
})
