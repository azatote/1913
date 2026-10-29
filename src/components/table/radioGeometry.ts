import { CARD_HEIGHT, CARD_WIDTH, RADIO_STACK_HOME, RADIO_TOKEN_HEIGHT, RADIO_TOKEN_WIDTH, isPlayerRow, nearestRowIndex } from '../../game/logic'
import type { Pile, Point, RadioPlacement, RadioToken } from '../../game/types'
import { clamp, mirrorBox, toViewRect, type ViewRect } from './boardGeometry'

// Tokens of the stack are fanned out by a few units so it reads as a pile.
const STACK_STEP = 1.2

export function isAtStack(token: RadioToken) {
  return !token.attachedTo && token.x === RADIO_STACK_HOME.x && token.y === RADIO_STACK_HOME.y
}

// Where a token is drawn: on its card (following it, at the same scale) or free on the table.
export function tokenViewRect(token: RadioToken, hostModel: Point | undefined, freeModel: Point | undefined, mirrored: boolean): ViewRect {
  if (token.attachedTo && hostModel) {
    const host = toViewRect(hostModel, mirrored)
    const { dx, dy } = token.attachedTo
    const offsetX = mirrored ? CARD_WIDTH - RADIO_TOKEN_WIDTH - dx : dx
    const offsetY = mirrored ? CARD_HEIGHT - RADIO_TOKEN_HEIGHT - dy : dy
    return { x: host.x + offsetX * host.scale, y: host.y + offsetY * host.scale, scale: host.scale }
  }
  const view = mirrorBox(freeModel ?? token, RADIO_TOKEN_WIDTH, RADIO_TOKEN_HEIGHT, mirrored)
  return { ...view, scale: 1 }
}

export function stackedTokenView(view: ViewRect, stackIndex: number): ViewRect {
  return { ...view, y: view.y - stackIndex * STACK_STEP }
}

// A token dropped with its center over a player row card sticks to it; otherwise it stays free on the table.
export function placementFromView(view: Point, piles: Pile[], mirrored: boolean): RadioPlacement {
  const center = { x: view.x + RADIO_TOKEN_WIDTH / 2, y: view.y + RADIO_TOKEN_HEIGHT / 2 }
  const hosts = piles.filter((pile) => isPlayerRow(nearestRowIndex(pile.y))).sort((left, right) => right.z - left.z)
  for (const pile of hosts) {
    const rect = toViewRect(pile, mirrored)
    const inside = center.x >= rect.x && center.x <= rect.x + CARD_WIDTH * rect.scale
      && center.y >= rect.y && center.y <= rect.y + CARD_HEIGHT * rect.scale
    if (!inside) continue

    const offsetX = clamp((view.x - rect.x) / rect.scale, 0, CARD_WIDTH - RADIO_TOKEN_WIDTH)
    const offsetY = clamp((view.y - rect.y) / rect.scale, 0, CARD_HEIGHT - RADIO_TOKEN_HEIGHT)
    return {
      pileId: pile.id,
      dx: mirrored ? CARD_WIDTH - RADIO_TOKEN_WIDTH - offsetX : offsetX,
      dy: mirrored ? CARD_HEIGHT - RADIO_TOKEN_HEIGHT - offsetY : offsetY,
    }
  }
  const model = mirrorBox(view, RADIO_TOKEN_WIDTH, RADIO_TOKEN_HEIGHT, mirrored)
  return { x: model.x, y: model.y }
}
