import { memo, type PointerEvent as ReactPointerEvent } from 'react'
import radiosUrl from '../../assets/plateau/radios.png'
import { toCqw } from './boardGeometry'

type RadioTokenViewProps = {
  tokenId: string
  viewX: number
  viewY: number
  scale: number
  zIndex: number
  dragging: boolean
  remote: boolean
  stackCount: number
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, tokenId: string) => void
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>, tokenId: string) => void
  onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => void
}

export const RadioTokenView = memo(function RadioTokenView({
  tokenId,
  viewX,
  viewY,
  scale,
  zIndex,
  dragging,
  remote,
  stackCount,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: RadioTokenViewProps) {
  const className = ['radio-token', dragging && 'is-dragging', remote && 'is-remote-drag'].filter(Boolean).join(' ')
  return (
    <div
      className={className}
      style={{ transform: `translate(${toCqw(viewX)}, ${toCqw(viewY)}) scale(${scale})`, zIndex }}
      role="button"
      aria-label={stackCount > 1 ? `Pile de ${stackCount} jetons radio` : 'Jeton radio'}
      onPointerDown={(event) => onPointerDown(event, tokenId)}
      onPointerMove={(event) => onPointerMove(event, tokenId)}
      onPointerUp={(event) => onPointerEnd(event, false)}
      onPointerCancel={(event) => onPointerEnd(event, true)}
    >
      <img src={radiosUrl} alt="" draggable={false} decoding="async" />
      {stackCount > 1 && <span className="radio-token-count">{stackCount}</span>}
    </div>
  )
})
