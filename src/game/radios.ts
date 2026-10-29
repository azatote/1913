import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  CARD_HEIGHT,
  CARD_WIDTH,
  RADIO_STACK_HOME,
  RADIO_TOKEN_HEIGHT,
  RADIO_TOKEN_WIDTH,
  findPile,
  isPlayerRow,
  nearestRowIndex,
} from './logic.ts'
import type { ActionResult, GameState, Point, RadioPlacement } from './types'

// A token dropped this close to the stack goes back into it.
const STACK_SNAP_DISTANCE = 90
// Heights of the radios printed on the card rims, as fractions of the card height (nanDECK layout).
const RADIO_SLOT_HEIGHTS = [2.76 / 8.8, 6.06 / 8.8]

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

// Closest of the four radio spots of a card (left or right rim, upper or lower radio); points are relative to the card's top-left.
export function nearestRadioSlot(point: Point): Point {
  const y = RADIO_SLOT_HEIGHTS
    .map((fraction) => fraction * CARD_HEIGHT)
    .reduce((best, candidate) => (Math.abs(candidate - point.y) < Math.abs(best - point.y) ? candidate : best))
  return { x: point.x < CARD_WIDTH / 2 ? 0 : CARD_WIDTH, y }
}

export function isRadioStackPosition(x: number, y: number) {
  return x === RADIO_STACK_HOME.x && y === RADIO_STACK_HOME.y
}

export function placeRadioToken(state: GameState, tokenId: string, placement: RadioPlacement): ActionResult {
  const token = state.radioTokens.find((entry) => entry.id === tokenId)
  if (!token) return { ok: false, message: '' }

  if ('pileId' in placement) {
    const pile = findPile(state, placement.pileId)
    if (!pile || !isPlayerRow(nearestRowIndex(pile.y))) {
      return { ok: false, message: 'Un jeton radio se pose sur une carte de la ligne d\u2019un joueur.' }
    }
    // Straddles the rim, half on the card, like two half radios made whole.
    const slot = nearestRadioSlot({ x: placement.dx + RADIO_TOKEN_WIDTH / 2, y: placement.dy + RADIO_TOKEN_HEIGHT / 2 })
    token.attachedTo = {
      pileId: pile.id,
      dx: slot.x - RADIO_TOKEN_WIDTH / 2,
      dy: slot.y - RADIO_TOKEN_HEIGHT / 2,
    }
    state.topZ += 1
    token.z = state.topZ
    return { ok: true, message: `Jeton radio pos\u00e9 sur la carte ${pile.cards.at(-1)?.code ?? ''}.` }
  }

  const nearStack = Math.hypot(placement.x - RADIO_STACK_HOME.x, placement.y - RADIO_STACK_HOME.y) < STACK_SNAP_DISTANCE
  token.attachedTo = null
  token.x = nearStack ? RADIO_STACK_HOME.x : clamp(placement.x, 0, BOARD_WIDTH - RADIO_TOKEN_WIDTH)
  token.y = nearStack ? RADIO_STACK_HOME.y : clamp(placement.y, 0, BOARD_HEIGHT - RADIO_TOKEN_HEIGHT)
  state.topZ += 1
  token.z = state.topZ
  return { ok: true, message: nearStack ? 'Jeton radio remis dans la pile.' : 'Jeton radio d\u00e9pos\u00e9 sur la table.' }
}
