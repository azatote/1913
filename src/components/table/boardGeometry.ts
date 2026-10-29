import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CARD_HEIGHT,
  OWN_ROW_SCALE,
  PLAYERS,
  ROW_INDEX,
  ROW_Y,
  mirrorTopLeft,
  nearestRowIndex,
  viewedRowIndex,
} from '../../game/logic'
import type { Point } from '../../game/types'

// 1cqw = 1% of the board width: model units are converted once, zoom only resizes the container.
export function toCqw(value: number) {
  return `${(value / BOARD_WIDTH) * 100}cqw`
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

// Top-left corner of a width x height box seen from the other side of the table.
export function mirrorBox(point: Point, width: number, height: number, mirrored: boolean): Point {
  return mirrored ? { x: BOARD_WIDTH - width - point.x, y: BOARD_HEIGHT - height - point.y } : { x: point.x, y: point.y }
}

const OWN_ROW_BOTTOM = ROW_Y[PLAYERS.bottom.rowIndex] + CARD_HEIGHT
const OWN_ROW_TOP = OWN_ROW_BOTTOM - CARD_HEIGHT * OWN_ROW_SCALE

export type ViewRect = Point & { scale: number }

// The row viewed at the bottom (the viewer's own row) is enlarged around the board center and its bottom edge.
export function toViewRect(model: Point, mirrored: boolean): ViewRect {
  const view = mirrorTopLeft(model, mirrored)
  if (viewedRowIndex(nearestRowIndex(model.y), mirrored) !== ROW_INDEX.bottomPlayer) return { ...view, scale: 1 }
  const centerX = BOARD_WIDTH / 2
  return {
    x: centerX + (view.x - centerX) * OWN_ROW_SCALE,
    y: OWN_ROW_BOTTOM - (OWN_ROW_BOTTOM - view.y) * OWN_ROW_SCALE,
    scale: OWN_ROW_SCALE,
  }
}

// Inverse of the enlargement for a point (not a top-left corner) in view coordinates.
export function unscaleViewPoint(point: Point): Point {
  if (point.y < OWN_ROW_TOP) return point
  const centerX = BOARD_WIDTH / 2
  return {
    x: centerX + (point.x - centerX) / OWN_ROW_SCALE,
    y: OWN_ROW_BOTTOM - (OWN_ROW_BOTTOM - point.y) / OWN_ROW_SCALE,
  }
}
