import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { RADIO_TOKEN_HEIGHT, RADIO_TOKEN_WIDTH } from '../../game/logic'
import type { GameState, Point, RadioPlacement } from '../../game/types'
import { mirrorBox } from './boardGeometry'
import { placementFromView, tokenViewRect } from './radioGeometry'

const DRAG_THRESHOLD_PX = 4

type TokenDragSession = {
  tokenId: string
  pointerId: number
  startX: number
  startY: number
  grab: Point
  moved: boolean
  view: Point
}

export type TokenDragPreview = { tokenId: string; view: Point }

type RadioTokenDragOptions = {
  state: GameState
  mirrored: boolean
  remoteDrags: Record<string, Point>
  pointerToView: (clientX: number, clientY: number) => Point
  scrollNearEdge: (clientX: number, clientY: number) => void
  onTokenDrop: (tokenId: string, placement: RadioPlacement) => void
  onDragMove: (id: string, position: Point) => void
  onDragEnd: (id: string) => void
}

// The token follows the pointer in view coordinates; the drop decides between a card and the table.
export function useRadioTokenDrag({ state, mirrored, remoteDrags, pointerToView, scrollNearEdge, onTokenDrop, onDragMove, onDragEnd }: RadioTokenDragOptions) {
  const dragRef = useRef<TokenDragSession | null>(null)
  const [tokenDrag, setTokenDrag] = useState<TokenDragPreview | null>(null)

  const latestRef = useRef({ state, mirrored, remoteDrags, onTokenDrop, onDragMove, onDragEnd })
  useLayoutEffect(() => {
    latestRef.current = { state, mirrored, remoteDrags, onTokenDrop, onDragMove, onDragEnd }
  })

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>, tokenId: string) => {
    if (event.button !== 0) return
    const { state: current, mirrored: isMirrored, remoteDrags: remote } = latestRef.current
    const token = current.radioTokens.find((entry) => entry.id === tokenId)
    if (!token) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)

    const host = token.attachedTo ? current.piles.find((pile) => pile.id === token.attachedTo?.pileId) : undefined
    const rect = tokenViewRect(token, host && (remote[host.id] ?? host), remote[token.id], isMirrored)
    const pointer = pointerToView(event.clientX, event.clientY)
    dragRef.current = {
      tokenId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      // Grab point as a fraction of the token, so it stays under the pointer whatever its scale.
      grab: {
        x: (pointer.x - rect.x) / (RADIO_TOKEN_WIDTH * rect.scale),
        y: (pointer.y - rect.y) / (RADIO_TOKEN_HEIGHT * rect.scale),
      },
      moved: false,
      view: { x: rect.x, y: rect.y },
    }
  }, [pointerToView])

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>, tokenId: string) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId || drag.tokenId !== tokenId) return
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD_PX) return

    drag.moved = true
    scrollNearEdge(event.clientX, event.clientY)
    const pointer = pointerToView(event.clientX, event.clientY)
    drag.view = { x: pointer.x - drag.grab.x * RADIO_TOKEN_WIDTH, y: pointer.y - drag.grab.y * RADIO_TOKEN_HEIGHT }
    setTokenDrag({ tokenId, view: drag.view })
    const { mirrored: isMirrored, onDragMove: notify } = latestRef.current
    notify(tokenId, mirrorBox(drag.view, RADIO_TOKEN_WIDTH, RADIO_TOKEN_HEIGHT, isMirrored))
  }, [pointerToView, scrollNearEdge])

  const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setTokenDrag(null)
    if (!drag.moved) return

    const { state: current, mirrored: isMirrored, onTokenDrop: drop, onDragEnd: end } = latestRef.current
    end(drag.tokenId)
    if (!cancelled) drop(drag.tokenId, placementFromView(drag.view, current.piles, isMirrored))
  }, [])

  return { tokenDrag, handleTokenPointerDown: handlePointerDown, handleTokenPointerMove: handlePointerMove, handleTokenPointerEnd: handlePointerEnd }
}
