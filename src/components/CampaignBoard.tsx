import { useRef, useState, type PointerEvent } from 'react'
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

function getPointerPosition(event: PointerEvent<HTMLButtonElement>, image: HTMLImageElement): Point {
  const bounds = image.getBoundingClientRect()
  return {
    x: (event.clientX - bounds.left) / bounds.width,
    y: (event.clientY - bounds.top) / bounds.height,
  }
}

export function CampaignBoard({ playerId, positions, rotated, readOnly, onMovePawn }: CampaignBoardProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [drag, setDrag] = useState<PawnDrag | null>(null)

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
      <div className={`campaign-board-art${rotated ? ' is-rotated' : ''}`}>
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
    </section>
  )
}