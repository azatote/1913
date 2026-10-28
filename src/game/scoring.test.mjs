import assert from 'node:assert/strict'
import test from 'node:test'
import { createInitialState, PLAYERS, playerRowSlotX, ROW_Y } from './logic.ts'
import { scorePlayerRow } from './scoring.ts'

function rowState(playerId, codesBySlot) {
  const state = createInitialState()
  state.piles = []
  for (const [slot, code] of Object.entries(codesBySlot)) {
    state.piles.push({
      id: `pile-${slot}`,
      x: playerRowSlotX(Number(slot)),
      y: ROW_Y[PLAYERS[playerId].rowIndex],
      z: 1,
      cards: [{ id: `card-${code}`, code, faceUp: true }],
    })
  }
  return state
}

test('a group multiplies its complete radios by each shared resource count', () => {
  // 17 (transport) -> 9 (argent): 2 radios; 9 -> 1 (argent): 1 radio en bas.
  const { groups, totals } = scorePlayerRow(rowState('bottom', { 0: 17, 1: 9, 2: 1 }), 'bottom')

  assert.equal(groups.length, 1)
  assert.equal(groups[0].country, 'France')
  assert.equal(groups[0].completeRadios, 3)
  assert.deepEqual(groups[0].resourceCounts, { money: 2, population: 0, logistics: 0, transport: 1 })
  assert.deepEqual(totals, { money: 6, population: 0, logistics: 0, transport: 3 })
})

test('an empty slot splits the row into separate groups', () => {
  const { groups, totals } = scorePlayerRow(rowState('bottom', { 0: 1, 1: 2, 3: 17, 4: 9 }), 'bottom')

  assert.deepEqual(groups.map((group) => group.completeRadios), [2, 2])
  assert.deepEqual(totals, { money: 4 + 2, population: 0, logistics: 0, transport: 2 })
})

test('half radios at different heights do not connect two cards', () => {
  // 5 n'a qu'une demi-radio en bas à droite, 7 qu'une demi-radio en haut à gauche.
  const { groups, totals } = scorePlayerRow(rowState('bottom', { 0: 5, 1: 7 }), 'bottom')

  assert.deepEqual(groups, [])
  assert.deepEqual(totals, { money: 0, population: 0, logistics: 0, transport: 0 })
})

test('a radio between different countries is impossible and does not score', () => {
  const { groups, impossibleConnections, totals } = scorePlayerRow(rowState('bottom', { 0: 1, 1: 23 }), 'bottom')

  assert.deepEqual(groups.map(({ country, invalidated, scores }) => ({ country, invalidated, scores })), [
    { country: 'France', invalidated: true, scores: { money: 0, population: 0, logistics: 0, transport: 0 } },
    { country: 'Royaume-Uni', invalidated: true, scores: { money: 0, population: 0, logistics: 0, transport: 0 } },
  ])
  assert.deepEqual(impossibleConnections.map(({ leftCard, rightCard, radios }) => [leftCard.country, rightCard.country, radios]), [
    ['France', 'Royaume-Uni', 1],
  ])
  assert.deepEqual(totals, { money: 0, population: 0, logistics: 0, transport: 0 })
})

test('a forbidden country link cancels both adjacent camps but not an unrelated camp', () => {
  const { groups, totals } = scorePlayerRow(rowState('bottom', { 0: 1, 1: 2, 2: 23, 4: 27, 5: 28 }), 'bottom')

  assert.deepEqual(groups.map(({ country, invalidated, completeRadios }) => ({ country, invalidated, completeRadios })), [
    { country: 'France', invalidated: true, completeRadios: 2 },
    { country: 'Royaume-Uni', invalidated: true, completeRadios: 0 },
    { country: 'Royaume-Uni', invalidated: false, completeRadios: 2 },
  ])
  assert.deepEqual(totals, { money: 4, population: 0, logistics: 0, transport: 0 })
})

test('the top player row is read from left to right as that player sees it', () => {
  // Joueur 2 voit sa ligne en miroir : le slot 1 du modèle est à sa gauche.
  assert.equal(scorePlayerRow(rowState('top', { 0: 9, 1: 17 }), 'top').groups[0]?.completeRadios, 2)
  assert.deepEqual(scorePlayerRow(rowState('top', { 0: 17, 1: 9 }), 'top').groups, [])
})

test('face-down cards and the other player row are ignored', () => {
  const state = rowState('bottom', { 0: 1, 1: 2 })
  state.piles[1].cards[0].faceUp = false

  assert.deepEqual(scorePlayerRow(state, 'bottom').groups, [])
  assert.deepEqual(scorePlayerRow(rowState('bottom', { 0: 1, 1: 2 }), 'top').groups, [])
})
