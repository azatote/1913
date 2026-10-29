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
import type { ActionResult, GameState, RadioPlacement } from './types'

// A token dropped this close to the stack goes back into it.
const STACK_SNAP_DISTANCE = 90

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
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
    token.attachedTo = {
      pileId: pile.id,
      dx: clamp(placement.dx, 0, CARD_WIDTH - RADIO_TOKEN_WIDTH),
      dy: clamp(placement.dy, 0, CARD_HEIGHT - RADIO_TOKEN_HEIGHT),
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
