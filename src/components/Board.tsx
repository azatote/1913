import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { cardImageUrl } from '../game/cards'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CARD_HEIGHT,
  CARD_WIDTH,
  PLAYER_IDS,
  PLAYERS,
  ROW_Y,
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
const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 1.25
const WHEEL_ZOOM_SPEED = 0.0015
const EDGE_SCROLL_MARGIN_PX = 40
const EDGE_SCROLL_STEP_PX = 16

type BoardProps = {
  state: GameState
  mirrored: boolean
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

type ZoomAnchor = { fx: number; fy: number; clientX: number; clientY: number }

type PileHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, pileId: string) => void
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>, pileId: string) => void
  onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => void
}

// 1cqw = 1% of the board width: model units are converted once, zoom only resizes the container.
function toCqw(value: number) {
  return `${(value / BOARD_WIDTH) * 100}cqw`
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
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
  zIndex: number
  selected: boolean
  dragging: boolean
  remote: boolean
  opponentRow: boolean
}

const PileView = memo(function PileView({
  pile,
  viewX,
  viewY,
  zIndex,
  selected,
  dragging,
  remote,
  opponentRow,
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
  ].filter(Boolean).join(' ')

  return (
    <div
      className={className}
      style={{ transform: `translate(${toCqw(viewX)}, ${toCqw(viewY)})`, zIndex }}
      role="button"
      aria-label={`${topCard?.faceUp ? `Carte ${topCard.code}` : 'Paquet face cachée'}, ${formatCardCount(pile.cards.length)}`}
      aria-pressed={selected}
      onPointerDown={(event) => onPointerDown(event, pile.id)}
      onPointerMove={(event) => onPointerMove(event, pile.id)}
      onPointerUp={(event) => onPointerEnd(event, false)}
      onPointerCancel={(event) => onPointerEnd(event, true)}
    >
      <div className={`pile-stack depth-${stackDepth(pile.cards.length)}`}>
        {topCard && <img src={cardImageUrl(topCard)} alt="" draggable={false} decoding="async" />}
      </div>
      {pile.cards.length > 1 && <span className="pile-count">{pile.cards.length}</span>}
    </div>
  )
})

export function Board({
  state,
  mirrored,
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
  const scrollerRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragSession | null>(null)
  const zoomRef = useRef(1)
  const anchorRef = useRef<ZoomAnchor | null>(null)
  const pointersRef = useRef(new Map<number, Point>())
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [dragPreview, setDragPreview] = useState<{ pileId: string; position: Point } | null>(null)

  // Lets the memoized pile handlers read the latest props without being recreated.
  const latestRef = useRef({ state, mirrored, onSelect, onPileClick, onPileDrop, onPileToHand, onDragMove, onDragEnd })
  useLayoutEffect(() => {
    latestRef.current = { state, mirrored, onSelect, onPileClick, onPileDrop, onPileToHand, onDragMove, onDragEnd }
  })

  const pointerToView = useCallback((clientX: number, clientY: number): Point => {
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return { x: 0, y: 0 }
    return {
      x: ((clientX - rect.left) / rect.width) * BOARD_WIDTH,
      y: ((clientY - rect.top) / rect.height) * BOARD_HEIGHT,
    }
  }, [])

  // Zooms while keeping the point under (clientX, clientY) in place.
  const zoomAt = useCallback((requested: number, clientX?: number, clientY?: number) => {
    const board = boardRef.current
    const scroller = scrollerRef.current
    if (!board || !scroller) return
    const next = clamp(requested, MIN_ZOOM, MAX_ZOOM)
    if (Math.abs(next - zoomRef.current) < 0.001) return

    const rect = board.getBoundingClientRect()
    const stage = scroller.getBoundingClientRect()
    const anchorX = clientX ?? stage.left + stage.width / 2
    const anchorY = clientY ?? stage.top + stage.height / 2
    anchorRef.current = {
      fx: (anchorX - rect.left) / rect.width,
      fy: (anchorY - rect.top) / rect.height,
      clientX: anchorX,
      clientY: anchorY,
    }
    zoomRef.current = next
    setZoom(next)
  }, [])

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const board = boardRef.current
    const scroller = scrollerRef.current
    if (!anchor || !board || !scroller) return
    anchorRef.current = null
    const rect = board.getBoundingClientRect()
    scroller.scrollLeft += rect.left + anchor.fx * rect.width - anchor.clientX
    scroller.scrollTop += rect.top + anchor.fy * rect.height - anchor.clientY
  }, [zoom])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY
      zoomAt(zoomRef.current * Math.exp(-delta * WHEEL_ZOOM_SPEED), event.clientX, event.clientY)
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return
      if (event.key === '+' || event.key === '=') zoomAt(zoomRef.current * ZOOM_STEP)
      else if (event.key === '-') zoomAt(zoomRef.current / ZOOM_STEP)
      else if (event.key === '0') zoomAt(MIN_ZOOM)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [zoomAt])

  const scrollNearEdge = (clientX: number, clientY: number) => {
    const scroller = scrollerRef.current
    if (!scroller || zoomRef.current <= MIN_ZOOM) return
    const rect = scroller.getBoundingClientRect()
    const dx = clientX < rect.left + EDGE_SCROLL_MARGIN_PX ? -EDGE_SCROLL_STEP_PX : clientX > rect.right - EDGE_SCROLL_MARGIN_PX ? EDGE_SCROLL_STEP_PX : 0
    const dy = clientY < rect.top + EDGE_SCROLL_MARGIN_PX ? -EDGE_SCROLL_STEP_PX : clientY > rect.bottom - EDGE_SCROLL_MARGIN_PX ? EDGE_SCROLL_STEP_PX : 0
    if (dx || dy) scroller.scrollBy(dx, dy)
  }

  const handlePilePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>, pileId: string) => {
    if (event.button !== 0) return
    const { state: current, mirrored: isMirrored, onSelect: select } = latestRef.current
    const pile = current.piles.find((entry) => entry.id === pileId)
    if (!pile) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const pointer = pointerToView(event.clientX, event.clientY)
    const view = mirrorTopLeft(pile, isMirrored)
    dragRef.current = {
      pileId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offset: { x: pointer.x - view.x, y: pointer.y - view.y },
      moved: false,
      position: { x: pile.x, y: pile.y },
    }
    select(pileId)
  }, [pointerToView])

  const handlePilePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>, pileId: string) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD_PX) return

    const { state: current, mirrored: isMirrored, onDragMove: notify } = latestRef.current
    const pile = current.piles.find((entry) => entry.id === pileId)
    if (!pile) return
    drag.moved = true
    scrollNearEdge(event.clientX, event.clientY)
    const pointer = pointerToView(event.clientX, event.clientY)
    const model = mirrorTopLeft({ x: pointer.x - drag.offset.x, y: pointer.y - drag.offset.y }, isMirrored)
    drag.position = snapPosition(current, pile, model)
    setDragPreview({ pileId, position: drag.position })
    notify(pileId, drag.position)
  }, [pointerToView])

  const handlePilePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragPreview(null)
    const { onPileClick: click, onDragEnd: end, onPileToHand: toHand, onPileDrop: drop } = latestRef.current

    if (!drag.moved) {
      if (!cancelled) click(drag.pileId)
      return
    }

    end(drag.pileId)
    if (cancelled) return
    const handPlayer = handPlayerAt(event.clientX, event.clientY)
    if (handPlayer) toHand(drag.pileId, handPlayer)
    else drop(drag.pileId, drag.position)
  }, [])

  // Background gestures: one pointer pans, two pointers pinch-zoom.
  const handleStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (event.target instanceof HTMLElement && event.target.closest('.pile')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()]
      pinchRef.current = { distance: Math.hypot(first.x - second.x, first.y - second.y) || 1, zoom: zoomRef.current }
    }
    event.currentTarget.classList.add('is-panning')
  }

  const handleStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointersRef.current.get(event.pointerId)
    if (!previous) return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    const pinch = pinchRef.current
    if (pinch && pointersRef.current.size >= 2) {
      const [first, second] = [...pointersRef.current.values()]
      const distance = Math.hypot(first.x - second.x, first.y - second.y)
      zoomAt(pinch.zoom * (distance / pinch.distance), (first.x + second.x) / 2, (first.y + second.y) / 2)
      return
    }

    event.currentTarget.scrollLeft -= event.clientX - previous.x
    event.currentTarget.scrollTop -= event.clientY - previous.y
  }

  const handleStagePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    if (pointersRef.current.size === 0) event.currentTarget.classList.remove('is-panning')
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
    '--card-width': toCqw(CARD_WIDTH),
    '--card-height': toCqw(CARD_HEIGHT),
    '--board-ratio': BOARD_WIDTH / BOARD_HEIGHT,
    '--zoom': zoom,
  } as CSSProperties

  return (
    <div className="board-stage">
      <div
        ref={scrollerRef}
        className="board-scroller"
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerEnd}
        onPointerCancel={handleStagePointerEnd}
      >
        <div ref={boardRef} className="board" style={boardStyle} onDragOver={handleDragOver} onDrop={handleDrop} aria-label="Table de jeu">
          {ROW_Y.map((rowY, rowIndex) => (
            <div
              key={rowIndex}
              className={`board-row viewed-row-${viewedRowIndex(rowIndex, mirrored)}`}
              style={{ top: toCqw(mirrored ? BOARD_HEIGHT - CARD_HEIGHT - rowY : rowY) }}
            >
              <span>{rowLabel(rowIndex)}</span>
            </div>
          ))}

          {state.piles.map((pile) => {
            const isDragging = dragPreview?.pileId === pile.id
            const model = isDragging ? dragPreview.position : remoteDrags[pile.id] ?? pile
            const view = mirrorTopLeft(model, mirrored)
            return (
              <PileView
                key={pile.id}
                pile={pile}
                viewX={view.x}
                viewY={view.y}
                zIndex={isDragging ? state.topZ + 1 : pile.z}
                selected={pile.id === selectedPileId}
                dragging={isDragging}
                remote={!isDragging && pile.id in remoteDrags}
                opponentRow={viewedRowIndex(nearestRowIndex(model.y), mirrored) === 0}
                onPointerDown={handlePilePointerDown}
                onPointerMove={handlePilePointerMove}
                onPointerEnd={handlePilePointerEnd}
              />
            )
          })}
        </div>
      </div>

      <div className="board-controls" role="toolbar" aria-label="Zoom de la table">
        <button type="button" onClick={() => zoomAt(zoomRef.current / ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} aria-label="Dézoomer" title="Dézoomer (−)">−</button>
        <button type="button" className="zoom-value" onClick={() => zoomAt(MIN_ZOOM)} title="Ajuster à l'écran (0)">{Math.round(zoom * 100)} %</button>
        <button type="button" onClick={() => zoomAt(zoomRef.current * ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} aria-label="Zoomer" title="Zoomer (+)">+</button>
      </div>
      <p className="board-hint">Molette ou pincement : zoom · Glisser le fond : déplacer la vue</p>
    </div>
  )
}
