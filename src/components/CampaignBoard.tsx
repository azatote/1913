import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { PLAYERS } from '../game/logic'
import type { CampaignPawnId, PlayerId, Point } from '../game/types'
import boardImageUrl from '../assets/plateau/Mobilisation européenne, 1914.png'
import factoryPawnUrl from '../assets/plateau/pion_piste_bleu_usine.png'
import moneyPawnUrl from '../assets/plateau/pion_piste_jaune_monnaie.png'
import industryPawnUrl from '../assets/plateau/pion_piste_rouge_industrie.png'
import populationPawnUrl from '../assets/plateau/pion_piste_violet_population.png'
import francePawnUrl from '../assets/plateau/pion_france.png'
import unitedKingdomPawnUrl from '../assets/plateau/pion_royaumeuni.png'
import russiaPawnUrl from '../assets/plateau/pion_russe.png'

type CampaignBoardProps = {
  playerId: PlayerId
  positions: Record<CampaignPawnId, Point>
  rotated: boolean
  readOnly: boolean
  onMovePawn: (pawnId: CampaignPawnId, position: Point) => void
}

type PawnDrag = {
  pawnId: CampaignPawnId
  pointerId: number
  offset: Point
  position: Point
}

const CAMPAIGN_PAWNS: { id: CampaignPawnId; label: string; image: string; enlarged?: boolean }[] = [
  { id: 'money', label: 'Monnaie', image: moneyPawnUrl },
  { id: 'population', label: 'Population', image: populationPawnUrl },
  { id: 'industry', label: 'Industrie', image: industryPawnUrl },
  { id: 'factory', label: 'Usine', image: factoryPawnUrl },
  { id: 'france', label: 'France', image: francePawnUrl, enlarged: true },
  { id: 'unitedKingdom', label: 'Royaume-Uni', image: unitedKingdomPawnUrl, enlarged: true },
  { id: 'russia', label: 'Russie', image: russiaPawnUrl, enlarged: true },
]

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const MIN_ZOOM = 1
const MAX_ZOOM = 3
const WHEEL_ZOOM_SPEED = 0.0015

type ZoomAnchor = { contentX: number; contentY: number; offsetX: number; offsetY: number }
type PanDrag = { pointerId: number; clientX: number; clientY: number; scrollLeft: number; scrollTop: number }

function getPointerPosition(event: PointerEvent<HTMLButtonElement>, image: HTMLImageElement): Point {
  const bounds = image.getBoundingClientRect()
  return {
    x: (event.clientX - bounds.left) / bounds.width,
    y: (event.clientY - bounds.top) / bounds.height,
  }
}

export function CampaignBoard({ playerId, positions, rotated, readOnly, onMovePawn }: CampaignBoardProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(MIN_ZOOM)
  const zoomAnchorRef = useRef<ZoomAnchor | null>(null)
  const panRef = useRef<PanDrag | null>(null)
  const [drag, setDrag] = useState<PawnDrag | null>(null)
  const [zoom, setZoom] = useState(MIN_ZOOM)

  zoomRef.current = zoom

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = viewport.getBoundingClientRect()
      const offsetX = event.clientX - rect.left
      const offsetY = event.clientY - rect.top
      const contentX = (viewport.scrollLeft + offsetX) / zoomRef.current
      const contentY = (viewport.scrollTop + offsetY) / zoomRef.current
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY
      const nextZoom = clamp(zoomRef.current * Math.exp(-delta * WHEEL_ZOOM_SPEED), MIN_ZOOM, MAX_ZOOM)
      if (nextZoom === zoomRef.current) return

      zoomAnchorRef.current = { contentX, contentY, offsetX, offsetY }
      zoomRef.current = nextZoom
      setZoom(nextZoom)
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const anchor = zoomAnchorRef.current
    if (!viewport || !anchor) return

    viewport.scrollLeft = anchor.contentX * zoom - anchor.offsetX
    viewport.scrollTop = anchor.contentY * zoom - anchor.offsetY
    zoomAnchorRef.current = null
  }, [zoom])

  const startPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('.campaign-pawn'))) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    panRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
    }
    event.currentTarget.classList.add('is-panning')
  }

  const movePan = (event: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) return

    event.currentTarget.scrollLeft = pan.scrollLeft - (event.clientX - pan.clientX)
    event.currentTarget.scrollTop = pan.scrollTop - (event.clientY - pan.clientY)
  }

  const finishPan = (event: PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return
    panRef.current = null
    event.currentTarget.classList.remove('is-panning')
  }

  const startDrag = (event: PointerEvent<HTMLButtonElement>, pawnId: CampaignPawnId) => {
    const image = imageRef.current
    if (readOnly || !image || image.clientWidth === 0 || image.clientHeight === 0 || event.button !== 0) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const pointer = getPointerPosition(event, image)
    const position = positions[pawnId]
    setDrag({
      pawnId,
      pointerId: event.pointerId,
      offset: { x: position.x - pointer.x, y: position.y - pointer.y },
      position,
    })
  }

  const moveDrag = (event: PointerEvent<HTMLButtonElement>, pawnId: CampaignPawnId) => {
    const image = imageRef.current
    if (!image || !drag || drag.pawnId !== pawnId || drag.pointerId !== event.pointerId) return

    const pointer = getPointerPosition(event, image)
    setDrag({
      ...drag,
      position: {
        x: clamp(pointer.x + drag.offset.x, 0.02, 0.98),
        y: clamp(pointer.y + drag.offset.y, 0.025, 0.975),
      },
    })
  }

  const finishDrag = (event: PointerEvent<HTMLButtonElement>, pawnId: CampaignPawnId) => {
    if (!drag || drag.pawnId !== pawnId || drag.pointerId !== event.pointerId) return
    const image = imageRef.current
    const pointer = image ? getPointerPosition(event, image) : null
    const position = pointer ? {
      x: clamp(pointer.x + drag.offset.x, 0.02, 0.98),
      y: clamp(pointer.y + drag.offset.y, 0.025, 0.975),
    } : drag.position

    setDrag(null)
    onMovePawn(pawnId, position)
  }

  return (
    <section className="campaign-board-surface" aria-label={`Plateau de mobilisation de ${PLAYERS[playerId].label}`}>
      <div
        ref={viewportRef}
        className="campaign-board-viewport"
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={finishPan}
        onPointerCancel={finishPan}
      >
        <div
          className={`campaign-board-art${rotated ? ' is-rotated' : ''}`}
          style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
        >
          <img ref={imageRef} className="campaign-board-image" src={boardImageUrl} alt="Plateau de Mobilisation européenne, 1914" draggable={false} />
          {CAMPAIGN_PAWNS.map((pawn) => {
            const isDragging = drag?.pawnId === pawn.id
            const position = isDragging ? drag.position : positions[pawn.id]
            return (
              <button
                key={pawn.id}
                type="button"
                className={`campaign-pawn${pawn.enlarged ? ' is-enlarged' : ''}${isDragging ? ' is-dragging' : ''}`}
                style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
                aria-label={`Pion ${pawn.label}${readOnly ? ', non déplaçable' : ', déplacer sur le plateau'}`}
                title={`Pion ${pawn.label}`}
                disabled={readOnly}
                onPointerDown={(event) => startDrag(event, pawn.id)}
                onPointerMove={(event) => moveDrag(event, pawn.id)}
                onPointerUp={(event) => finishDrag(event, pawn.id)}
                onPointerCancel={() => setDrag(null)}
              >
                <img src={pawn.image} alt="" draggable={false} />
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}