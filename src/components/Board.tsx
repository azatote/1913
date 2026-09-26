import { useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { cardImageUrl } from '../game/cards'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CARD_HEIGHT,
  CARD_WIDTH,
  PLAYER_IDS,
  PLAYERS,
  ROW_Y,
  VISIBLE_LAYERS,
  formatCardCount,
  getTopCard,
  isPlayerId,
  mirrorTopLeft,
  nearestRowIndex,
  snapPosition,
  viewedRowIndex,
} from '../game/logic'
import type { GameState, Pile, PlayerId, Point } from '../game/types'
import { isHandCardDrag, readHandCardIndex } from './dnd'

const DRAG_THRESHOLD_PX = 6

type BoardProps = {
  state: GameState
  mirrored: boolean
  zoom: number
  selectedPileId: string | null
  remoteDrags: Record<string, Point>
  canPlayFromHand: boolean
  onSelect: (pileId: string) => void
  onPileClick: (pileId: string) => void
  onPileDrop: (pileId: string, position: Point) => void
  onPileToHand: (pileId: string, playerId: PlayerId) => void
  onPlayFromHand: (index: number, position: Point) => void
  onDragMove: (pileId: string, position: Point) => void
  onDragEnd: (pileId: string) => void
}

type DragSession = {
  pileId: string
  pointerId: number
  startX: number
  startY: number
  offset: Point
  moved: boolean
  position: Point
}

function toPercent(value: number, total: number) {
  return `${(value / total) * 100}%`
}

function rowLabel(rowIndex: number) {
  const owner = PLAYER_IDS.find((playerId) => PLAYERS[playerId].rowIndex === rowIndex)
  return owner ? `Ligne de ${PLAYERS[owner].label}` : 'Zone centrale'
}

function handPlayerAt(clientX: number, clientY: number): PlayerId | null {
  const zone = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-hand-player]')
  const playerId = zone?.dataset.handPlayer
  return isPlayerId(playerId) ? playerId : null
}

function pileLabel(pile: Pile) {
  const topCard = getTopCard(pile)
  const face = topCard?.faceUp ? `Carte ${topCard.code}` : 'Paquet face cachée'
  return `${face}, ${formatCardCount(pile.cards.length)}`
}

export function Board({
  state,
  mirrored,
  zoom,
  selectedPileId,
  remoteDrags,
  canPlayFromHand,
  onSelect,
  onPileClick,
  onPileDrop,
  onPileToHand,
  onPlayFromHand,
  onDragMove,
  onDragEnd,
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragSession | null>(null)
  const [dragPreview, setDragPreview] = useState<{ pileId: string; position: Point } | null>(null)

  const pointerToView = (clientX: number, clientY: number): Point => {
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return { x: 0, y: 0 }
    return {
      x: ((clientX - rect.left) / rect.width) * BOARD_WIDTH,
      y: ((clientY - rect.top) / rect.height) * BOARD_HEIGHT,
    }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>, pile: Pile) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const pointer = pointerToView(event.clientX, event.clientY)
    const view = mirrorTopLeft(pile, mirrored)
    dragRef.current = {
      pileId: pile.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offset: { x: pointer.x - view.x, y: pointer.y - view.y },
      moved: false,
      position: { x: pile.x, y: pile.y },
    }
    onSelect(pile.id)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>, pile: Pile) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD_PX) return

    drag.moved = true
    const pointer = pointerToView(event.clientX, event.clientY)
    const model = mirrorTopLeft({ x: pointer.x - drag.offset.x, y: pointer.y - drag.offset.y }, mirrored)
    drag.position = snapPosition(state, pile, model)
    setDragPreview({ pileId: pile.id, position: drag.position })
    onDragMove(pile.id, drag.position)
  }

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragPreview(null)

    if (!drag.moved) {
      if (!cancelled) onPileClick(drag.pileId)
      return
    }

    onDragEnd(drag.pileId)
    if (cancelled) return

    const handPlayer = handPlayerAt(event.clientX, event.clientY)
    if (handPlayer) onPileToHand(drag.pileId, handPlayer)
    else onPileDrop(drag.pileId, drag.position)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!canPlayFromHand || !isHandCardDrag(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const index = readHandCardIndex(event.dataTransfer)
    if (!canPlayFromHand || index === null) return
    event.preventDefault()
    const pointer = pointerToView(event.clientX, event.clientY)
    onPlayFromHand(index, mirrorTopLeft({ x: pointer.x - CARD_WIDTH / 2, y: pointer.y - CARD_HEIGHT / 2 }, mirrored))
  }

  const boardStyle = {
    '--card-width': toPercent(CARD_WIDTH, BOARD_WIDTH),
    '--card-height': toPercent(CARD_HEIGHT, BOARD_HEIGHT),
    '--board-ratio': BOARD_WIDTH / BOARD_HEIGHT,
    '--zoom': zoom,
  } as CSSProperties

  return (
    <div className="board-stage">
      <div className="board-scroller">
        <div ref={boardRef} className="board" style={boardStyle} onDragOver={handleDragOver} onDrop={handleDrop} aria-label="Table de jeu">
          {ROW_Y.map((rowY, rowIndex) => (
            <div
              key={rowIndex}
              className={`board-row viewed-row-${viewedRowIndex(rowIndex, mirrored)}`}
              style={{ top: toPercent(mirrored ? BOARD_HEIGHT - CARD_HEIGHT - rowY : rowY, BOARD_HEIGHT) }}
            >
              <span>{rowLabel(rowIndex)}</span>
            </div>
          ))}

          {state.piles.map((pile) => {
            const isDragging = dragPreview?.pileId === pile.id
            const isRemoteDrag = !isDragging && pile.id in remoteDrags
            const model = isDragging ? dragPreview.position : remoteDrags[pile.id] ?? pile
            const view = mirrorTopLeft(model, mirrored)
            const className = [
              'pile',
              pile.id === selectedPileId && 'is-selected',
              isDragging && 'is-dragging',
              isRemoteDrag && 'is-remote-drag',
              viewedRowIndex(nearestRowIndex(model.y), mirrored) === 0 && 'is-opponent-row',
            ].filter(Boolean).join(' ')

            return (
              <div
                key={pile.id}
                className={className}
                style={{ left: toPercent(view.x, BOARD_WIDTH), top: toPercent(view.y, BOARD_HEIGHT), zIndex: isDragging ? state.topZ + 1 : pile.z }}
                role="button"
                aria-label={pileLabel(pile)}
                aria-pressed={pile.id === selectedPileId}
                onPointerDown={(event) => handlePointerDown(event, pile)}
                onPointerMove={(event) => handlePointerMove(event, pile)}
                onPointerUp={(event) => finishDrag(event, false)}
                onPointerCancel={(event) => finishDrag(event, true)}
              >
                <div className="pile-stack">
                  {pile.cards.slice(-VISIBLE_LAYERS).map((card, layer) => (
                    <div key={card.id} className="card-layer" style={{ '--layer': layer } as CSSProperties}>
                      <img src={cardImageUrl(card)} alt="" draggable={false} />
                    </div>
                  ))}
                </div>
                {pile.cards.length > 1 && <span className="pile-count">{pile.cards.length}</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
