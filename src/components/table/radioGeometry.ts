import { CARD_HEIGHT, CARD_WIDTH, RADIO_STACK_HOME, RADIO_TOKEN_HEIGHT, RADIO_TOKEN_WIDTH, isPlayerRow, nearestRowIndex } from '../../game/logic'
import { nearestRadioSlot } from '../../game/radios'
import type { Pile, Point, RadioPlacement, RadioToken } from '../../game/types'
import { mirrorBox, toViewRect, type ViewRect } from './boardGeometry'

// Tokens of the stack are fanned out by a few units so it reads as a pile.
const STACK_STEP = 1.2

export function isAtStack(token: RadioToken) {
  return !token.attachedTo && token.x === RADIO_STACK_HOME.x && token.y === RADIO_STACK_HOME.y
}

// Where a token stuck to a card is drawn: offset from the card's view corner, at the card's scale.
export function attachedViewRect(hostModel: Point, dx: number, dy: number, mirrored: boolean): ViewRect {
  const host = toViewRect(hostModel, mirrored)
  const offsetX = mirrored ? CARD_WIDTH - RADIO_TOKEN_WIDTH - dx : dx
  const offsetY = mirrored ? CARD_HEIGHT - RADIO_TOKEN_HEIGHT - dy : dy
  return { x: host.x + offsetX * host.scale, y: host.y + offsetY * host.scale, scale: host.scale }
}

// Where a token is drawn: on its card (following it, at the same scale) or free on the table.
export function tokenViewRect(token: RadioToken, hostModel: Point | undefined, freeModel: Point | undefined, mirrored: boolean): ViewRect {
  if (token.attachedTo && hostModel) return attachedViewRect(hostModel, token.attachedTo.dx, token.attachedTo.dy, mirrored)
  const view = mirrorBox(freeModel ?? token, RADIO_TOKEN_WIDTH, RADIO_TOKEN_HEIGHT, mirrored)
  return { ...view, scale: 1 }
}

export function stackedTokenView(view: ViewRect, stackIndex: number): ViewRect {
  return { ...view, y: view.y - stackIndex * STACK_STEP }
}

// A token whose center is over a player row card (rims included) snaps to the closest radio spot of the closest card;
// otherwise it stays free on the table.
export function placementFromView(view: Point, piles: Pile[], mirrored: boolean): RadioPlacement {
  const center = { x: view.x + RADIO_TOKEN_WIDTH / 2, y: view.y + RADIO_TOKEN_HEIGHT / 2 }
  let best: { pile: Pile; distance: number; slot: Point } | null = null
  for (const pile of piles) {
    if (!isPlayerRow(nearestRowIndex(pile.y))) continue
    const rect = toViewRect(pile, mirrored)
    const viewX = (center.x - rect.x) / rect.scale
    const viewY = (center.y - rect.y) / rect.scale
    if (viewX < -RADIO_TOKEN_WIDTH / 2 || viewX > CARD_WIDTH + RADIO_TOKEN_WIDTH / 2 || viewY < 0 || viewY > CARD_HEIGHT) continue

    const modelCenter = mirrored ? { x: CARD_WIDTH - viewX, y: CARD_HEIGHT - viewY } : { x: viewX, y: viewY }
    const slot = nearestRadioSlot(modelCenter)
    const distance = Math.hypot(slot.x - modelCenter.x, slot.y - modelCenter.y)
    if (!best || distance < best.distance || (distance === best.distance && pile.z > best.pile.z)) best = { pile, distance, slot }
  }
  if (best) return { pileId: best.pile.id, dx: best.slot.x - RADIO_TOKEN_WIDTH / 2, dy: best.slot.y - RADIO_TOKEN_HEIGHT / 2 }

  const model = mirrorBox(view, RADIO_TOKEN_WIDTH, RADIO_TOKEN_HEIGHT, mirrored)
  return { x: model.x, y: model.y }
}
