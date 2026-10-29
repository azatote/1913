import assert from 'node:assert/strict'
import test from 'node:test'
import { advanceResourceTrack, nearestTrackCell } from './campaignTracks.ts'
import { createInitialState } from './logic.ts'
import { objectiveCost } from './objectiveData.ts'
import { missingObjectiveResources, takeObjectiveToHand } from './objectives.ts'

function riverWith(code) {
  const state = createInitialState()
  const pile = state.objectivePiles.find((entry) => entry.slot === 1)
  pile.cards[0].code = code
  return { state, pile }
}

test('objective costs follow the plans CSV by card number', () => {
  assert.deepEqual(objectiveCost(1), { money: 1, population: 1, logistics: 2, transport: 1 })
  assert.deepEqual(objectiveCost(18), { money: 8, population: 0, logistics: 0, transport: 0 })
  assert.deepEqual(objectiveCost(24), { money: 0, population: 4, logistics: 0, transport: 0 })
  assert.equal(objectiveCost(37), null)
  for (let code = 1; code <= 36; code += 1) assert.ok(objectiveCost(code), `cost of objective ${code}`)
})

test('an objective stays in the river while the player lacks resources', () => {
  const { state, pile } = riverWith(18)
  const before = structuredClone(state)

  const result = takeObjectiveToHand(state, pile.id, 'bottom')
  assert.equal(result.ok, false)
  assert.match(result.message, /Argent 1\/8/)
  assert.deepEqual(state, before)
})

test('the objective goes to the hand once the board holds enough of each resource', () => {
  const { state, pile } = riverWith(18)

  advanceResourceTrack(state, 'bottom', 'money', 6)
  assert.equal(takeObjectiveToHand(state, pile.id, 'bottom').ok, false)

  advanceResourceTrack(state, 'bottom', 'money', 1)
  assert.deepEqual(missingObjectiveResources(state, 'bottom', 18), [])
  assert.equal(takeObjectiveToHand(state, pile.id, 'bottom').ok, true)
  assert.equal(state.objectiveHands.bottom.length, 1)
})

test('the resources are spent: pawns go back by the cost, never below the first cell', () => {
  const { state, pile } = riverWith(24)
  const before = structuredClone(state.campaignPawns)
  advanceResourceTrack(state, 'bottom', 'population', 11)
  assert.equal(nearestTrackCell(state.campaignPawns.bottom.population.x), 12)

  const result = takeObjectiveToHand(state, pile.id, 'bottom')
  assert.equal(result.ok, true)
  assert.match(result.message, /Population −4/)
  assert.equal(nearestTrackCell(state.campaignPawns.bottom.population.x), 8)
  assert.deepEqual(state.campaignPawns.bottom.money, before.bottom.money)
  assert.deepEqual(state.campaignPawns.top, before.top)

  const full = riverWith(18)
  advanceResourceTrack(full.state, 'top', 'money', 7)
  assert.equal(takeObjectiveToHand(full.state, full.pile.id, 'top').ok, true)
  assert.equal(nearestTrackCell(full.state.campaignPawns.top.money.x), 1)
})

test('the resources checked are those of the player receiving the card', () => {
  const { state, pile } = riverWith(24)
  advanceResourceTrack(state, 'bottom', 'population', 3)

  assert.equal(takeObjectiveToHand(state, pile.id, 'top').ok, false)
  assert.equal(takeObjectiveToHand(state, pile.id, 'bottom').ok, true)
})
