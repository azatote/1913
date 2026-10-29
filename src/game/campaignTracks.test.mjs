import assert from 'node:assert/strict'
import test from 'node:test'
import { advanceResourceTrack, nearestTrackCell, TRACK_CELL_X, TRACK_LENGTH } from './campaignTracks.ts'
import { CAMPAIGN_PAWN_STARTS, createInitialState } from './logic.ts'

test('pawns start on the first cell of their track', () => {
  for (const pawnId of ['money', 'population', 'industry', 'factory']) {
    assert.equal(nearestTrackCell(CAMPAIGN_PAWN_STARTS[pawnId].x), 1)
  }
  assert.equal(TRACK_LENGTH, 20)
})

test('a resource advances its pawn by the selected number of cells on the right track', () => {
  const state = createInitialState()
  const result = advanceResourceTrack(state, 'bottom', 'transport', 2)

  assert.equal(result.ok, true)
  assert.deepEqual(state.campaignPawns.bottom.industry, { x: TRACK_CELL_X[2], y: CAMPAIGN_PAWN_STARTS.industry.y })
  assert.equal(nearestTrackCell(state.campaignPawns.bottom.industry.x), 3)
  assert.deepEqual(state.campaignPawns.top.industry, CAMPAIGN_PAWN_STARTS.industry)
  assert.deepEqual(state.campaignPawns.bottom.factory, CAMPAIGN_PAWN_STARTS.factory)

  advanceResourceTrack(state, 'bottom', 'logistics', 1)
  assert.equal(nearestTrackCell(state.campaignPawns.bottom.factory.x), 2)
})

test('a pawn moved by hand advances from the closest cell and returns to its track', () => {
  const state = createInitialState()
  state.campaignPawns.top.money = { x: TRACK_CELL_X[9] + 0.004, y: 0.6 }

  assert.equal(advanceResourceTrack(state, 'top', 'money', 3).ok, true)
  assert.deepEqual(state.campaignPawns.top.money, { x: TRACK_CELL_X[12], y: CAMPAIGN_PAWN_STARTS.money.y })
})

test('the pawn stops on the last cell and refuses to go further', () => {
  const state = createInitialState()

  assert.match(advanceResourceTrack(state, 'bottom', 'population', 50).message, /19 cases/)
  assert.equal(nearestTrackCell(state.campaignPawns.bottom.population.x), TRACK_LENGTH)
  assert.equal(advanceResourceTrack(state, 'bottom', 'population', 1).ok, false)
  assert.equal(advanceResourceTrack(state, 'bottom', 'money', 0).ok, false)
})
