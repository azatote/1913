import assert from 'node:assert/strict'
import test from 'node:test'
import { CARD_DATA, cardCodeFromCsvId } from './cardData.ts'
import { CARD_HEIGHT, CARD_WIDTH, createInitialState, PLAYERS, playerRowSlotX, ROW_Y } from './logic.ts'
import { placeRadioToken } from './radios.ts'
import { scorePlayerRow } from './scoring.ts'

// Les cartes sont désignées par leur ID du CSV; Card.code est le numéro du fichier image.
function rowState(playerId, csvIdsBySlot) {
  const state = createInitialState()
  state.piles = []
  for (const [slot, csvId] of Object.entries(csvIdsBySlot)) {
    const code = cardCodeFromCsvId(csvId)
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

test('card data follows the image numbering of the cards on the table', () => {
  // carte (31).jpg est le QUARTIER GÉNÉRAL BRITANNIQUE (ID 25), carte (6).jpg le PONT STRATÉGIQUE (ID 56).
  assert.equal(CARD_DATA.get(31).title, 'QUARTIER GÉNÉRAL BRITANNIQUE')
  assert.equal(CARD_DATA.get(6).title, 'PONT STRATÉGIQUE')
  assert.deepEqual(CARD_DATA.get(6).resources, { money: false, population: true, logistics: false, transport: true })
  assert.deepEqual([...CARD_DATA.keys()].sort((a, b) => a - b), Array.from({ length: 56 }, (_, index) => index + 1))
})

test('face-down cards and the other player row are ignored', () => {
  const state = rowState('bottom', { 0: 1, 1: 2 })
  state.piles[1].cards[0].faceUp = false

  assert.deepEqual(scorePlayerRow(state, 'bottom').groups, [])
  assert.deepEqual(scorePlayerRow(rowState('bottom', { 0: 1, 1: 2 }), 'top').groups, [])
})

function addRimToken(state, slot, side, height) {
  const token = state.radioTokens.find((entry) => !entry.attachedTo)
  const dx = side === 'left' ? 0 : CARD_WIDTH
  const dy = height === 'top' ? 0 : CARD_HEIGHT
  assert.equal(placeRadioToken(state, token.id, { pileId: `pile-${slot}`, dx, dy }).ok, true)
}

test('a radio token on the rim between two cards makes the radio complete', () => {
  // 5 et 7 ne se relient pas (demi-radios à des hauteurs différentes).
  const state = rowState('bottom', { 0: 5, 1: 7 })
  assert.deepEqual(scorePlayerRow(state, 'bottom').groups, [])

  addRimToken(state, 0, 'right', 'top')
  const { groups } = scorePlayerRow(state, 'bottom')
  assert.equal(groups.length, 1)
  assert.equal(groups[0].completeRadios, 1)
  assert.equal(groups[0].tokenRadios, 1)

  // Le même rebord vu depuis l'autre carte, à l'autre hauteur : une seconde radio.
  addRimToken(state, 1, 'left', 'bottom')
  assert.equal(scorePlayerRow(state, 'bottom').groups[0].completeRadios, 2)

  // Un deuxième jeton au même endroit ne compte pas deux fois.
  addRimToken(state, 0, 'right', 'top')
  assert.equal(scorePlayerRow(state, 'bottom').groups[0].completeRadios, 2)
})

test('a token on a rim already completed by the cards adds nothing, and a token on an outer rim is ignored', () => {
  const state = rowState('bottom', { 0: 17, 1: 9 })
  const before = scorePlayerRow(state, 'bottom').groups[0].completeRadios

  addRimToken(state, 0, 'right', 'top')
  addRimToken(state, 0, 'left', 'bottom')
  const [group] = scorePlayerRow(state, 'bottom').groups
  assert.equal(group.completeRadios, before)
  assert.equal(group.tokenRadios, 0)
})

test('rim tokens are read from the top player point of view too', () => {
  const state = rowState('top', { 0: 5, 1: 7 })
  assert.deepEqual(scorePlayerRow(state, 'top').groups, [])

  addRimToken(state, 0, 'right', 'bottom')
  assert.equal(scorePlayerRow(state, 'top').groups[0].completeRadios, 1)

  // Un jeton sur un autre rebord de la ligne ne relie pas ces deux cartes.
  const other = rowState('top', { 0: 5, 1: 7, 3: 17 })
  addRimToken(other, 3, 'right', 'top')
  assert.deepEqual(scorePlayerRow(other, 'top').groups, [])
})
