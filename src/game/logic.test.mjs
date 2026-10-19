import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createInitialState,
  moveObjectiveCardToHand,
  moveCampaignPawn,
  moveObjectiveToHand,
  movePileToHand,
  OBJECTIVE_ROW_INDEX,
  objectiveRowY,
  parseGameState,
  playObjectiveFromHand,
  ROW_Y,
  playerRowSlotX,
} from './logic.ts'

test('campaign boards keep independent pawns and migrate old shared positions', () => {
  const state = createInitialState()
  const defaults = structuredClone(state.campaignPawns)

  assert.deepEqual(state.campaignPawns.bottom.france, { x: 0.341713, y: 0.434747 })
  assert.deepEqual(state.campaignPawns.bottom.unitedKingdom, { x: 0.596808, y: 0.444955 })
  assert.deepEqual(state.campaignPawns.bottom.russia, { x: 0.836617, y: 0.452611 })
  assert.deepEqual(moveCampaignPawn(state, 'bottom', 'money', { x: 2, y: -1 }), { ok: true, message: '' })
  assert.deepEqual(state.campaignPawns.bottom.money, { x: 1, y: 0 })
  assert.deepEqual(state.campaignPawns.top, defaults.top)
  assert.deepEqual(parseGameState({ ...state, campaignPawns: undefined }).campaignPawns, defaults)
  assert.deepEqual(parseGameState(state).campaignPawns, state.campaignPawns)

  const legacyPositions = structuredClone(defaults.bottom)
  legacyPositions.industry = { x: 0.75, y: 0.4 }
  assert.deepEqual(parseGameState({ ...state, campaignPawns: legacyPositions }).campaignPawns, {
    top: legacyPositions,
    bottom: legacyPositions,
  })
})

test('objective hands accept all 36 cards without consuming the standard hand', () => {
  const state = createInitialState()
  const standardHand = structuredClone(state.hands.bottom)
  while (state.objectivePiles.some((pile) => pile.slot > 0)) {
    const source = state.objectivePiles.find((pile) => pile.slot > 0)
    assert.equal(moveObjectiveToHand(state, source.id, 'bottom').ok, true)
  }
  assert.equal(state.objectiveHands.bottom.length, 36)
  assert.deepEqual(state.hands.bottom, standardHand)
  assert.equal(state.objectiveDrawPileId, null)

  const cardId = state.objectiveHands.bottom[0].id
  const played = playObjectiveFromHand(state, 'bottom', cardId)
  assert.equal(played.ok, true)
  assert.equal(state.piles.find((pile) => pile.id === played.selectedPileId).y, ROW_Y[OBJECTIVE_ROW_INDEX.bottom])
  assert.equal(state.objectiveHands.bottom.length, 35)
  assert.equal(movePileToHand(state, played.selectedPileId, 'bottom').ok, true)
  assert.equal(state.objectiveHands.bottom.length, 36)
  assert.deepEqual(state.hands.bottom, standardHand)
  assert.equal(new Set(state.objectiveHands.bottom.map((card) => card.id)).size, 36)
})

test('a rejected objective play leaves the hand untouched', () => {
  const state = createInitialState()
  const source = state.objectivePiles.find((pile) => pile.slot === 1)
  moveObjectiveToHand(state, source.id, 'top')
  for (let slot = 0; slot < 7; slot += 1) {
    state.piles.push({ id: `occupied-${slot}`, x: playerRowSlotX(slot), y: ROW_Y[1], z: 1, cards: [{ id: `card-${slot}`, code: slot + 1, faceUp: true }] })
  }
  const before = structuredClone(state)
  assert.equal(playObjectiveFromHand(state, 'top', state.objectiveHands.top[0].id, { x: playerRowSlotX(0), y: ROW_Y[1] }).ok, false)
  assert.deepEqual(state, before)
})

test('each player can play an objective on their dedicated row', () => {
  for (const playerId of ['top', 'bottom']) {
    const state = createInitialState()
    const source = state.objectivePiles.find((pile) => pile.slot === 1)
    assert.equal(moveObjectiveToHand(state, source.id, playerId).ok, true)

    const cardId = state.objectiveHands[playerId][0].id
    const result = playObjectiveFromHand(state, playerId, cardId, { x: playerRowSlotX(3), y: objectiveRowY(playerId) })
    assert.equal(result.ok, true)
    assert.equal(state.piles.find((pile) => pile.id === result.selectedPileId).y, objectiveRowY(playerId))
  }
})

test('objective rows accept more than seven cards', () => {
  const state = createInitialState()
  while (state.objectiveHands.bottom.length < 8) {
    const source = state.objectivePiles.find((pile) => pile.slot > 0)
    assert.ok(source)
    assert.equal(moveObjectiveToHand(state, source.id, 'bottom').ok, true)
  }

  for (const [index, card] of state.objectiveHands.bottom.slice(0, 8).entries()) {
    const result = playObjectiveFromHand(state, 'bottom', card.id, {
      x: 200 + index * 240,
      y: objectiveRowY('bottom'),
    })
    assert.equal(result.ok, true)
  }

  assert.equal(state.piles.filter((pile) => pile.y === objectiveRowY('bottom')).length, 8)
})

test('legacy objectives migrate once into the dedicated hand', () => {
  const state = createInitialState()
  const source = state.objectivePiles.find((pile) => pile.slot === 1)
  const card = source.cards[0]
  state.objectivePiles = state.objectivePiles.filter((pile) => pile.id !== source.id)
  state.hands.bottom.push(card)
  delete state.objectiveHands
  const migrated = parseGameState(state, 'test-game')
  assert.equal(migrated.objectiveHands.bottom[0].id, card.id)
  assert.equal(migrated.hands.bottom.some((entry) => entry.kind === 'objective'), false)
  assert.deepEqual(parseGameState(migrated, 'test-game'), migrated)
})

test('legacy board rows migrate into the five-row layout without losing cards', () => {
  const state = createInitialState()
  state.piles[0].y = 28
  state.piles[1].y = 590
  state.piles[2].y = 1152
  delete state.boardLayoutVersion

  const migrated = parseGameState(state, 'legacy-layout')
  assert.equal(migrated.boardLayoutVersion, 2)
  assert.equal(migrated.piles[0].y, ROW_Y[1])
  assert.equal(migrated.piles[1].y, ROW_Y[2])
  assert.equal(migrated.piles[2].y, ROW_Y[3])
  const standardCards = [
    ...migrated.piles.flatMap((pile) => pile.cards),
    ...migrated.hands.top,
    ...migrated.hands.bottom,
  ].filter((card) => card.kind !== 'objective')
  assert.equal(standardCards.length, 56)
  assert.deepEqual(parseGameState(migrated, 'legacy-layout'), migrated)
})

test('an objective can be returned from a board stack without moving its other cards', () => {
  const state = createInitialState()
  const objective = { id: 'objective-on-board', code: 7, faceUp: true, kind: 'objective' }
  const standard = { id: 'standard-on-board', code: 12, faceUp: true }
  state.piles.push({ id: 'objective-stack', x: 500, y: ROW_Y[OBJECTIVE_ROW_INDEX.bottom], z: 1, cards: [standard, objective] })

  const result = moveObjectiveCardToHand(state, 'objective-stack', objective.id, 'bottom')

  assert.equal(result.ok, true)
  assert.deepEqual(state.objectiveHands.bottom.at(-1), objective)
  assert.deepEqual(state.piles.find((pile) => pile.id === 'objective-stack').cards, [standard])
})