import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RADIO_STACK_HOME,
  RADIO_TOKEN_COUNT,
  RADIO_TOKEN_HEIGHT,
  CARD_HEIGHT,
  CARD_WIDTH,
  PLAYERS,
  ROW_Y,
  createInitialState,
  movePile,
  movePileToHand,
  parseGameState,
  playerRowSlotX,
} from './logic.ts'
import { placeRadioToken } from './radios.ts'

function stateWithRowCard() {
  const state = createInitialState()
  const pile = { id: 'row-card', x: playerRowSlotX(2), y: ROW_Y[PLAYERS.bottom.rowIndex], z: 1, cards: [{ id: 'c-1', code: 1, faceUp: true }] }
  state.piles.push(pile)
  return { state, pile }
}

test('ten radio tokens start stacked, a fifth of a card high plus 20%', () => {
  const state = createInitialState()

  assert.equal(state.radioTokens.length, RADIO_TOKEN_COUNT)
  assert.ok(Math.abs(RADIO_TOKEN_HEIGHT - (CARD_HEIGHT / 5) * 1.2) < 1e-9)
  assert.ok(state.radioTokens.every((token) => token.x === RADIO_STACK_HOME.x && token.y === RADIO_STACK_HOME.y && !token.attachedTo))
  assert.equal(new Set(state.radioTokens.map((token) => token.z)).size, RADIO_TOKEN_COUNT)
  assert.ok(state.topZ >= Math.max(...state.radioTokens.map((token) => token.z)))
})

test('a token dropped on a player row card sticks to it inside the card', () => {
  const { state, pile } = stateWithRowCard()
  const token = state.radioTokens[0]

  assert.equal(placeRadioToken(state, token.id, { pileId: pile.id, dx: 500, dy: -30 }).ok, true)
  assert.equal(token.attachedTo.pileId, pile.id)
  assert.ok(token.attachedTo.dx > 0 && token.attachedTo.dx < CARD_WIDTH)
  assert.equal(token.attachedTo.dy, 0)

  movePile(state, pile.id, { x: playerRowSlotX(5), y: pile.y })
  assert.equal(token.attachedTo.pileId, pile.id)
})

test('a token cannot stick to a card outside the player rows', () => {
  const state = createInitialState()
  const centralPile = state.piles[0]
  const token = state.radioTokens[0]

  assert.equal(placeRadioToken(state, token.id, { pileId: centralPile.id, dx: 10, dy: 10 }).ok, false)
  assert.equal(token.attachedTo, null)
})

test('a free token stays on the table and returns to the stack when dropped close to it', () => {
  const state = createInitialState()
  const token = state.radioTokens[0]

  placeRadioToken(state, token.id, { x: 1000, y: 40 })
  assert.deepEqual([token.x, token.y, token.attachedTo], [1000, 40, null])

  placeRadioToken(state, token.id, { x: RADIO_STACK_HOME.x + 30, y: RADIO_STACK_HOME.y - 20 })
  assert.deepEqual([token.x, token.y], [RADIO_STACK_HOME.x, RADIO_STACK_HOME.y])
})

test('tokens stay on the table where the card was when the card leaves it', () => {
  const { state, pile } = stateWithRowCard()
  const token = state.radioTokens[0]
  placeRadioToken(state, token.id, { pileId: pile.id, dx: 40, dy: 60 })

  assert.equal(movePileToHand(state, pile.id, 'bottom').ok, true)
  assert.equal(token.attachedTo, null)
  assert.deepEqual([token.x, token.y], [pile.x + 40, pile.y + 60])
})

test('old games without tokens get a fresh stack and dangling attachments are released', () => {
  const state = createInitialState()
  delete state.radioTokens
  assert.equal(parseGameState(state, 'game-1').radioTokens.length, RADIO_TOKEN_COUNT)
  assert.deepEqual(parseGameState(state, 'game-1').radioTokens, parseGameState(state, 'game-1').radioTokens)

  state.radioTokens = [{ id: 't', x: 10, y: 20, z: 3, attachedTo: { pileId: 'missing', dx: 1, dy: 2 } }]
  const [parsed] = parseGameState(state, 'game-1').radioTokens
  assert.deepEqual([parsed.x, parsed.y, parsed.attachedTo], [10, 20, null])
})
