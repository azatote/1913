import {
  useLayoutEffect,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from 'react'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CARD_HEIGHT,
  CARD_WIDTH,
  OBJECTIVE_ROW_INDEX,
  PLAYER_IDS,
  PLAYER_ROW_SLOTS,
  PLAYERS,
  RADIO_STACK_HOME,
  RADIO_TOKEN_HEIGHT,
  RADIO_TOKEN_WIDTH,
  ROW_INDEX,
  ROW_Y,
  isPlayerRow,
  mirrorTopLeft,
  nearestRowIndex,
  playerRowSlotIndex,
  playerRowSlotX,
  viewedRowIndex,
} from '../../game/logic'
import type { GameState, PlayerId, Point, RadioPlacement } from '../../game/types'
import { isHandCardDrag, isObjectiveCardDrag, OBJECTIVE_HAND_MIME, readHandCardIndex, readObjectivePileId } from '../dnd'
import { mirrorBox, toCqw, toViewRect, unscaleViewPoint } from './boardGeometry'
import { PileView } from './PileView'
import { isAtStack, stackedTokenView, tokenViewRect } from './radioGeometry'
import { RadioTokenView } from './RadioTokenView'
import { MAX_ZOOM, MIN_ZOOM, useBoardZoom } from './useBoardZoom'
import { usePileDrag } from './usePileDrag'
import { useRadioTokenDrag } from './useRadioTokenDrag'

// Above every card, including the one being dragged.
const TOKEN_Z_BASE = 100000

type BoardProps = {
  state: GameState
  mirrored: boolean
  selectedPileId: string | null
  remoteDrags: Record<string, Point>
  canPlayFromHand: boolean
  onSelect: (pileId: string) => void
  onPileActivate: (pileId: string) => void
  onPileDrop: (pileId: string, position: Point) => void
  onMoveObjectiveCard: (objectivePileId: string, position: Point) => void
  onMovePlayerRow: (playerId: PlayerId, slots: number) => void
  onPileToHand: (pileId: string, playerId: PlayerId) => void
  onPlayFromHand: (index: number, position: Point) => void
  onPlayObjectiveFromHand: (cardId: string, position: Point) => void
  onTokenDrop: (tokenId: string, placement: RadioPlacement) => void
  onBoardScaleChange: (scale: number) => void
  onDragMove: (pileId: string, position: Point) => void
  onDragEnd: (pileId: string) => void
  hasOwnHand: boolean
  children?: ReactNode
}

function rowLabel(rowIndex: number) {
  const owner = PLAYER_IDS.find((playerId) => PLAYERS[playerId].rowIndex === rowIndex)
  if (owner) return `Ligne de ${PLAYERS[owner].label}`
  const objectiveOwner = PLAYER_IDS.find((playerId) => OBJECTIVE_ROW_INDEX[playerId] === rowIndex)
  return objectiveOwner ? `Objectifs de ${PLAYERS[objectiveOwner].label}` : 'Zone centrale'
}

export function Board({
  state,
  mirrored,
  selectedPileId,
  remoteDrags,
  canPlayFromHand,
  onSelect,
  onPileActivate,
  onPileDrop,
  onMoveObjectiveCard,
  onMovePlayerRow,
  onPileToHand,
  onPlayFromHand,
  onPlayObjectiveFromHand,
  onTokenDrop,
  onBoardScaleChange,
  onDragMove,
  onDragEnd,
  hasOwnHand,
  children,
}: BoardProps) {
  const { scrollerRef, boardRef, zoom, zoomIn, zoomOut, fitZoom, pointerToView, scrollNearEdge, stageHandlers } = useBoardZoom()
  const { dragPreview, handlePilePointerDown, handlePilePointerMove, handlePilePointerEnd } = usePileDrag({
    state,
    mirrored,
    pointerToView,
    scrollNearEdge,
    onSelect,
    onPileActivate,
    onPileDrop,
    onMovePlayerRow,
    onPileToHand,
    onDragMove,
    onDragEnd,
  })
  const { tokenDrag, handleTokenPointerDown, handleTokenPointerMove, handleTokenPointerEnd } = useRadioTokenDrag({
    state,
    mirrored,
    remoteDrags,
    pointerToView,
    scrollNearEdge,
    onTokenDrop,
    onDragMove,
    onDragEnd,
  })

  useLayoutEffect(() => {
    const board = boardRef.current
    if (!board) return

    const reportScale = () => onBoardScaleChange(board.getBoundingClientRect().width / BOARD_WIDTH)
    const observer = new ResizeObserver(reportScale)
    observer.observe(board)
    reportScale()
    return () => observer.disconnect()
  }, [boardRef, onBoardScaleChange])

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    const handCard = canPlayFromHand && (isHandCardDrag(event.dataTransfer) || event.dataTransfer.types.includes(OBJECTIVE_HAND_MIME))
    if (!handCard && !isObjectiveCardDrag(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const handObjectiveId = event.dataTransfer.getData(OBJECTIVE_HAND_MIME)
    const objectivePileId = readObjectivePileId(event.dataTransfer)
    const index = readHandCardIndex(event.dataTransfer)
    if (!objectivePileId && (!canPlayFromHand || (!handObjectiveId && index === null))) return
    event.preventDefault()
    const pointer = unscaleViewPoint(pointerToView(event.clientX, event.clientY))
    const position = mirrorTopLeft({ x: pointer.x - CARD_WIDTH / 2, y: pointer.y - CARD_HEIGHT / 2 }, mirrored)
    if (handObjectiveId) onPlayObjectiveFromHand(handObjectiveId, position)
    else if (objectivePileId) onMoveObjectiveCard(objectivePileId, position)
    else if (index !== null) onPlayFromHand(index, position)
  }

  const pileEntries = state.piles.map((pile) => {
    const isDragging = dragPreview?.pileId === pile.id
    const rowPlayer = PLAYER_IDS.find((id) => PLAYERS[id].rowIndex === nearestRowIndex(pile.y))
    const groupShift = dragPreview && dragPreview.groupPlayerId === rowPlayer ? dragPreview.groupShift ?? 0 : 0
    const model: Point = isDragging
      ? dragPreview.position
      : groupShift !== 0
        ? { x: playerRowSlotX(playerRowSlotIndex(pile.x) + groupShift), y: pile.y }
        : remoteDrags[pile.id] ?? pile
    return { pile, isDragging, model }
  })
  // Tokens riding a card follow the position the card is displayed at, drags included.
  const pileModels = new Map(pileEntries.map(({ pile, model }) => [pile.id, model]))
  const radioTokens = state.radioTokens
  const stacked = radioTokens
    .filter((token) => isAtStack(token) && token.id !== tokenDrag?.tokenId && !(token.id in remoteDrags))
    .sort((left, right) => left.z - right.z)
  const stackOrder = new Map(stacked.map((token, index) => [token.id, index]))
  const stackTop = stacked.length - 1
  const stackHomeView = mirrorBox(RADIO_STACK_HOME, RADIO_TOKEN_WIDTH, RADIO_TOKEN_HEIGHT, mirrored)

  const boardStyle = {
    '--card-width': toCqw(CARD_WIDTH),
    '--card-height': toCqw(CARD_HEIGHT),
    '--token-width': toCqw(RADIO_TOKEN_WIDTH),
    '--token-height': toCqw(RADIO_TOKEN_HEIGHT),
    '--board-ratio': BOARD_WIDTH / BOARD_HEIGHT,
    '--zoom': zoom,
  } as CSSProperties

  return (
    <div className={`board-stage${hasOwnHand ? ' has-own-hand' : ''}`}>
      <div
        ref={scrollerRef}
        className="board-scroller"
        onPointerDown={stageHandlers.onPointerDown}
        onPointerMove={stageHandlers.onPointerMove}
        onPointerUp={stageHandlers.onPointerEnd}
        onPointerCancel={stageHandlers.onPointerEnd}
      >
        <div ref={boardRef} className="board" style={boardStyle} onDragOver={handleDragOver} onDrop={handleDrop} aria-label="Table de jeu">
          {ROW_Y.map((rowY, rowIndex) => {
            const viewed = viewedRowIndex(rowIndex, mirrored)
            if (!isPlayerRow(rowIndex)) {
              return (
                <div
                  key={rowIndex}
                  className={`board-row viewed-row-${viewed}`}
                  style={{ top: toCqw(mirrored ? BOARD_HEIGHT - CARD_HEIGHT - rowY : rowY) }}
                >
                  <span>{rowLabel(rowIndex)}</span>
                </div>
              )
            }

            const slots = Array.from({ length: PLAYER_ROW_SLOTS }, (_, slot) => toViewRect({ x: playerRowSlotX(slot), y: rowY }, mirrored))
            const first = slots.reduce((left, slot) => (slot.x < left.x ? slot : left))
            return (
              <div key={rowIndex} className={`row-slots viewed-row-${viewed}`}>
                {slots.map((slot, index) => (
                  <div
                    key={index}
                    className="row-slot"
                    style={{
                      left: toCqw(slot.x),
                      top: toCqw(slot.y),
                      width: toCqw(CARD_WIDTH * slot.scale),
                      height: toCqw(CARD_HEIGHT * slot.scale),
                    }}
                  />
                ))}
                <span className="row-label" style={{ left: toCqw(first.x), top: toCqw(first.y + (CARD_HEIGHT * first.scale) / 2) }}>
                  {rowLabel(rowIndex)}
                </span>
              </div>
            )
          })}

          {pileEntries.map(({ pile, isDragging, model }) => {
            const view = toViewRect(model, mirrored)
            return (
              <PileView
                key={pile.id}
                pile={pile}
                viewX={view.x}
                viewY={view.y}
                scale={view.scale}
                zIndex={isDragging ? state.topZ + 1 : pile.z}
                selected={pile.id === selectedPileId}
                dragging={isDragging}
                remote={!isDragging && pile.id in remoteDrags}
                opponentRow={viewedRowIndex(nearestRowIndex(model.y), mirrored) === ROW_INDEX.topPlayer}
                objectiveRow={Object.values(OBJECTIVE_ROW_INDEX).includes(nearestRowIndex(model.y))}
                onPointerDown={handlePilePointerDown}
                onPointerMove={handlePilePointerMove}
                onPointerEnd={handlePilePointerEnd}
              />
            )
          })}

          <div
            className="radio-stack-home"
            style={{
              transform: `translate(${toCqw(stackHomeView.x)}, ${toCqw(stackHomeView.y)})`,
            }}
          />
          {radioTokens.map((token) => {
            const isDragging = tokenDrag?.tokenId === token.id
            const stackIndex = stackOrder.get(token.id)
            const hostModel = token.attachedTo ? pileModels.get(token.attachedTo.pileId) : undefined
            let view = tokenViewRect(token, hostModel, remoteDrags[token.id], mirrored)
            if (stackIndex !== undefined && !remoteDrags[token.id]) view = stackedTokenView(view, stackIndex)
            if (isDragging) view = { ...view, ...tokenDrag.view, scale: tokenDrag.scale }
            return (
              <RadioTokenView
                key={token.id}
                tokenId={token.id}
                viewX={view.x}
                viewY={view.y}
                scale={view.scale}
                zIndex={(isDragging ? TOKEN_Z_BASE : 0) + TOKEN_Z_BASE + token.z}
                dragging={isDragging}
                remote={!isDragging && token.id in remoteDrags}
                stackCount={stackIndex === stackTop ? stackOrder.size : 0}
                onPointerDown={handleTokenPointerDown}
                onPointerMove={handleTokenPointerMove}
                onPointerEnd={handleTokenPointerEnd}
              />
            )
          })}
        </div>
      </div>

      <div className="board-controls" role="toolbar" aria-label="Zoom de la table">
        <button type="button" onClick={zoomOut} disabled={zoom <= MIN_ZOOM} aria-label="Dézoomer" title="Dézoomer (−)">−</button>
        <button type="button" className="zoom-value" onClick={fitZoom} title="Ajuster à l'écran (0)">{Math.round(zoom * 100)} %</button>
        <button type="button" onClick={zoomIn} disabled={zoom >= MAX_ZOOM} aria-label="Zoomer" title="Zoomer (+)">+</button>
      </div>
      <p className="board-hint">Molette ou pincement : zoom · Glisser le fond : déplacer la vue</p>
      {children}
    </div>
  )
}
