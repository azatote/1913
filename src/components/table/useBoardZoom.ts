import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../game/logic'
import type { Point } from '../../game/types'
import { clamp } from './boardGeometry'

export const MIN_ZOOM = 1
export const MAX_ZOOM = 4
const ZOOM_STEP = 1.25
const WHEEL_ZOOM_SPEED = 0.0015
const EDGE_SCROLL_MARGIN_PX = 40
const EDGE_SCROLL_STEP_PX = 16

type ZoomAnchor = { fx: number; fy: number; clientX: number; clientY: number }

// Zoom (wheel, keys, buttons, pinch), background panning and pointer -> board coordinates.
export function useBoardZoom() {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(MIN_ZOOM)
  const anchorRef = useRef<ZoomAnchor | null>(null)
  const pointersRef = useRef(new Map<number, Point>())
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null)
  const [zoom, setZoom] = useState(MIN_ZOOM)

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

  const zoomIn = useCallback(() => zoomAt(zoomRef.current * ZOOM_STEP), [zoomAt])
  const zoomOut = useCallback(() => zoomAt(zoomRef.current / ZOOM_STEP), [zoomAt])
  const fitZoom = useCallback(() => zoomAt(MIN_ZOOM), [zoomAt])

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
      if (event.key === '+' || event.key === '=') zoomIn()
      else if (event.key === '-') zoomOut()
      else if (event.key === '0') fitZoom()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fitZoom, zoomIn, zoomOut])

  // While dragging a pile, nudges the scroll when the pointer reaches the edge of the stage.
  const scrollNearEdge = useCallback((clientX: number, clientY: number) => {
    const scroller = scrollerRef.current
    if (!scroller || zoomRef.current <= MIN_ZOOM) return
    const rect = scroller.getBoundingClientRect()
    const dx = clientX < rect.left + EDGE_SCROLL_MARGIN_PX ? -EDGE_SCROLL_STEP_PX : clientX > rect.right - EDGE_SCROLL_MARGIN_PX ? EDGE_SCROLL_STEP_PX : 0
    const dy = clientY < rect.top + EDGE_SCROLL_MARGIN_PX ? -EDGE_SCROLL_STEP_PX : clientY > rect.bottom - EDGE_SCROLL_MARGIN_PX ? EDGE_SCROLL_STEP_PX : 0
    if (dx || dy) scroller.scrollBy(dx, dy)
  }, [])

  // Background gestures: one pointer pans, two pointers pinch-zoom.
  const stageHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (event.target instanceof HTMLElement && event.target.closest('.pile')) return
      event.currentTarget.setPointerCapture(event.pointerId)
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointersRef.current.size === 2) {
        const [first, second] = [...pointersRef.current.values()]
        pinchRef.current = { distance: Math.hypot(first.x - second.x, first.y - second.y) || 1, zoom: zoomRef.current }
      }
      event.currentTarget.classList.add('is-panning')
    },

    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
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
    },

    onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => {
      pointersRef.current.delete(event.pointerId)
      if (pointersRef.current.size < 2) pinchRef.current = null
      if (pointersRef.current.size === 0) event.currentTarget.classList.remove('is-panning')
    },
  }

  return { scrollerRef, boardRef, zoom, zoomIn, zoomOut, fitZoom, pointerToView, scrollNearEdge, stageHandlers }
}
