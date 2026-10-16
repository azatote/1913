import type { ActionResult, Card, GameState, Pile, PlayerId, Point } from './types'

// Model coordinates, shared by every client whatever its screen size.
export const BOARD_WIDTH = 2200
export const BOARD_HEIGHT = 1400
export const CARD_WIDTH = 148
export const CARD_HEIGHT = 220
export const CARD_TOTAL = 56
export const MAX_HAND_SIZE = 3
export const PLAYER_ROW_SLOTS = 7
// Visual enlargement of the viewer's own row (display only, the model is unchanged).
export const OWN_ROW_SCALE = 1.35

const STARTING_HAND_SIZE = 2
const STARTING_MARKET_SIZE = 5
const STARTING_GAP = 60

const ROW_MARGIN = 28
const MERGE_DISTANCE = 120
const SNAP_DISTANCE = 28
const DRAW_OFFSET = { x: 190, y: 20 }
const PLAY_STEP_X = 42

export const ROW_Y = [
  ROW_MARGIN,
  Math.round((BOARD_HEIGHT - CARD_HEIGHT) / 2),
  BOARD_HEIGHT - CARD_HEIGHT - ROW_MARGIN,
] as const

export const PLAYERS: Record<PlayerId, { label: string; rowIndex: number }> = {
  bottom: { label: 'Joueur 1', rowIndex: 2 },
  top: { label: 'Joueur 2', rowIndex: 0 },
}

export const PLAYER_IDS: PlayerId[] = ['bottom', 'top']

const PLAYER_ROW_START = Math.round((BOARD_WIDTH - PLAYER_ROW_SLOTS * CARD_WIDTH) / 2)

export function isPlayerRow(rowIndex: number) {
  return PLAYER_IDS.some((playerId) => PLAYERS[playerId].rowIndex === rowIndex)
}

export function playerRowSlotX(slot: number) {
  return PLAYER_ROW_START + slot * CARD_WIDTH
}

function rowOwnerLabel(rowIndex: number) {
  const owner = PLAYER_IDS.find((playerId) => PLAYERS[playerId].rowIndex === rowIndex)
  return owner ? PLAYERS[owner].label : ''
}

export function createId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function isPlayerId(value: unknown): value is PlayerId {
  return value === 'top' || value === 'bottom'
}

export function opponentOf(playerId: PlayerId): PlayerId {
  return playerId === 'top' ? 'bottom' : 'top'
}

export function formatCardCount(count: number) {
  return `${count} carte${count > 1 ? 's' : ''}`
}

function shuffleCards(cards: Card[]) {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[cards[index], cards[target]] = [cards[target], cards[index]]
  }
}

// Opening layout: shuffled deck, 2 cards per hand, 5 face-up cards in the middle row with the deck at the end.
export function createInitialState(): GameState {
  const deck: Card[] = Array.from({ length: CARD_TOTAL }, (_, index) => ({
    id: createId(),
    code: index + 1,
    faceUp: false,
  }))
  shuffleCards(deck)

  const hands = {
    bottom: deck.splice(0, STARTING_HAND_SIZE),
    top: deck.splice(0, STARTING_HAND_SIZE),
  }

  const slotCount = STARTING_MARKET_SIZE + 1
  const rowWidth = slotCount * CARD_WIDTH + (slotCount - 1) * STARTING_GAP
  const startX = Math.round((BOARD_WIDTH - rowWidth) / 2)
  const slotX = (slot: number) => startX + slot * (CARD_WIDTH + STARTING_GAP)

  const market: Pile[] = deck.splice(0, STARTING_MARKET_SIZE).map((card, slot) => ({
    id: createId(),
    x: slotX(slot),
    y: ROW_Y[1],
    z: slot + 1,
    cards: [{ ...card, faceUp: true }],
  }))
  const drawPile: Pile = { id: createId(), x: slotX(STARTING_MARKET_SIZE), y: ROW_Y[1], z: slotCount, cards: deck }

  return {
    piles: [...market, drawPile],
    hands,
    topZ: slotCount,
    drawPileId: drawPile.id,
  }
}

export function parseGameState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<GameState>
  if (!Array.isArray(value.piles) || !value.hands || !Array.isArray(value.hands.top) || !Array.isArray(value.hands.bottom)) {
    return null
  }

  const drawPile = typeof value.drawPileId === 'string'
    ? value.piles.find((pile) => pile.id === value.drawPileId)
    : undefined
  const legacyDrawPile = value.piles
    .filter((pile) => (
      nearestRowIndex(pile.y) === 1
      && Array.isArray(pile.cards)
      && pile.cards.length > 0
      && !isPileFaceUp(pile)
    ))
    .sort((left, right) => right.cards.length - left.cards.length || left.z - right.z)[0]

  return {
    piles: value.piles,
    hands: { top: value.hands.top, bottom: value.hands.bottom },
    topZ: typeof value.topZ === 'number' ? value.topZ : 1,
    drawPileId: drawPile?.id ?? legacyDrawPile?.id ?? null,
  }
}

export function getTopCard(pile: Pile): Card | undefined {
  return pile.cards.at(-1)
}

export function isPileFaceUp(pile: Pile) {
  return Boolean(getTopCard(pile)?.faceUp)
}

export function findPile(state: GameState, pileId: string | null) {
  return state.piles.find((pile) => pile.id === pileId)
}

export function nearestRowIndex(y: number) {
  let nearest = 0
  ROW_Y.forEach((rowY, index) => {
    if (Math.abs(rowY - y) < Math.abs(ROW_Y[nearest] - y)) nearest = index
  })
  return nearest
}

// The mirror is its own inverse: it converts model <-> view for the top player.
export function mirrorTopLeft(point: Point, mirrored: boolean): Point {
  return mirrored
    ? { x: BOARD_WIDTH - CARD_WIDTH - point.x, y: BOARD_HEIGHT - CARD_HEIGHT - point.y }
    : { x: point.x, y: point.y }
}

export function viewedRowIndex(rowIndex: number, mirrored: boolean) {
  return mirrored ? ROW_Y.length - 1 - rowIndex : rowIndex
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function slotOf(x: number) {
  return clamp(Math.round((x - PLAYER_ROW_START) / CARD_WIDTH), 0, PLAYER_ROW_SLOTS - 1)
}

export function playerRowSlotIndex(x: number) {
  return slotOf(x)
}

// Player rows: single cards magnetized edge to edge on 7 fixed slots; null when no slot is available.
function snapToPlayerRow(state: GameState, pile: Pile, rowIndex: number, x: number): Point | null {
  if (pile.cards.length > 1) return null
  const taken = new Set(
    state.piles
      .filter((other) => other.id !== pile.id && nearestRowIndex(other.y) === rowIndex)
      .map((other) => slotOf(other.x)),
  )
  const wanted = slotOf(x)
  const [slot] = Array.from({ length: PLAYER_ROW_SLOTS }, (_, index) => index)
    .filter((index) => !taken.has(index))
    .sort((left, right) => Math.abs(left - wanted) - Math.abs(right - wanted))
  return slot === undefined ? null : { x: playerRowSlotX(slot), y: ROW_Y[rowIndex] }
}

function rowRefusal(pile: Pile, target: Point) {
  const rowIndex = nearestRowIndex(target.y)
  return pile.cards.length > 1
    ? `Une seule carte par emplacement dans la ligne de ${rowOwnerLabel(rowIndex)}.`
    : `Ligne de ${rowOwnerLabel(rowIndex)} pleine : ${PLAYER_ROW_SLOTS} cartes maximum.`
}

// Snaps to the nearest row: fixed slots in player rows, alignment on a face-up pile elsewhere.
export function snapPosition(state: GameState, pile: Pile, target: Point): Point | null {
  const rowIndex = nearestRowIndex(clamp(target.y, 0, BOARD_HEIGHT - CARD_HEIGHT))
  const position = { x: clamp(target.x, 0, BOARD_WIDTH - CARD_WIDTH), y: ROW_Y[rowIndex] }

  if (isPlayerRow(rowIndex)) return snapToPlayerRow(state, pile, rowIndex, position.x)
  if (!isPileFaceUp(pile)) return position

  const neighbour = state.piles.find((candidate) => (
    candidate.id !== pile.id
    && isPileFaceUp(candidate)
    && nearestRowIndex(candidate.y) === rowIndex
    && Math.abs(candidate.x - position.x) <= SNAP_DISTANCE
  ))

  return neighbour ? { ...position, x: neighbour.x } : position
}

function bringToFront(state: GameState, pile: Pile) {
  state.topZ += 1
  pile.z = state.topZ
}

function removePile(state: GameState, pileId: string) {
  state.piles = state.piles.filter((pile) => pile.id !== pileId)
  if (state.drawPileId === pileId) state.drawPileId = null
}

function replenishCentralSlot(state: GameState, position: Point) {
  const drawPile = state.drawPileId ? findPile(state, state.drawPileId) : undefined
  const card = drawPile?.cards.pop()
  if (!drawPile || !card) return false

  card.faceUp = true
  if (drawPile.cards.length === 0) removePile(state, drawPile.id)

  state.topZ += 1
  state.piles.push({
    id: createId(),
    x: position.x,
    y: ROW_Y[1],
    z: state.topZ,
    cards: [card],
  })
  return true
}

function addPile(state: GameState, cards: Card[], target: Point): Pile | null {
  const pile: Pile = { id: createId(), x: 0, y: 0, z: state.topZ + 1, cards }
  const position = snapPosition(state, pile, target)
  if (!position) return null
  Object.assign(pile, position)
  state.topZ += 1
  state.piles.push(pile)
  return pile
}

export function resetGame(state: GameState): ActionResult {
  Object.assign(state, createInitialState())
  const drawPile = state.piles[state.piles.length - 1]
  return {
    ok: true,
    message: `Nouvelle partie : ${STARTING_HAND_SIZE} cartes par joueur, ${STARTING_MARKET_SIZE} cartes visibles, ${formatCardCount(drawPile.cards.length)} dans le talon.`,
    selectedPileId: drawPile.id,
  }
}

export function drawCard(state: GameState, pileId: string): ActionResult {
  const source = findPile(state, pileId)
  const card = source?.cards.pop()
  if (!source || !card) return { ok: false, message: 'Aucune carte disponible à piocher.' }

  card.faceUp = true
  const target = { x: source.x + DRAW_OFFSET.x, y: source.y + DRAW_OFFSET.y }
  const pile = addPile(state, [card], target)
  if (!pile) return { ok: false, message: rowRefusal({ ...source, cards: [card] }, target) }
  // Fans successive draws out instead of stacking them exactly on the same spot.
  while (
    pile.x + PLAY_STEP_X <= BOARD_WIDTH - CARD_WIDTH
    && state.piles.some((other) => other.id !== pile.id && other.y === pile.y && Math.abs(other.x - pile.x) < PLAY_STEP_X / 2)
  ) {
    pile.x += PLAY_STEP_X
  }
  if (source.cards.length === 0) {
    removePile(state, source.id)
    return { ok: true, message: `Carte ${card.code} piochée : le talon est vide.`, selectedPileId: pile.id }
  }
  // The draw pile stays selected so D can be pressed repeatedly.
  const remaining = source.cards.length
  return { ok: true, message: `Carte ${card.code} piochée (${formatCardCount(remaining)} restante${remaining > 1 ? 's' : ''}).`, selectedPileId: source.id }
}

export function flipTopCard(state: GameState, pileId: string | null): ActionResult {
  const pile = findPile(state, pileId)
  const topCard = pile && getTopCard(pile)
  if (!pile || !topCard) return { ok: false, message: 'Sélectionnez un paquet avec au moins une carte.' }

  topCard.faceUp = !topCard.faceUp
  Object.assign(pile, snapPosition(state, pile, pile) ?? {})
  bringToFront(state, pile)
  return {
    ok: true,
    message: `Carte ${topCard.code} retournée face ${topCard.faceUp ? 'visible' : 'cachée'}.`,
    selectedPileId: pile.id,
  }
}

export function shufflePile(state: GameState, pileId: string | null): ActionResult {
  const pile = findPile(state, pileId)
  if (!pile || pile.cards.length < 2) {
    return { ok: false, message: 'Le paquet sélectionné doit contenir au moins 2 cartes pour être mélangé.' }
  }

  shuffleCards(pile.cards)
  return { ok: true, message: `Paquet mélangé (${formatCardCount(pile.cards.length)}).`, selectedPileId: pile.id }
}

export function movePile(state: GameState, pileId: string, target: Point): ActionResult {
  const pile = findPile(state, pileId)
  if (!pile) return { ok: false, message: '' }

  const centralPosition = pile.id !== state.drawPileId
    && pile.cards.length === 1
    && nearestRowIndex(pile.y) === 1
    ? { x: pile.x, y: ROW_Y[1] }
    : null
  const movedDrawPile = pile.id === state.drawPileId
  const position = snapPosition(state, pile, target)
  if (!position) return { ok: false, message: rowRefusal(pile, target) }
  Object.assign(pile, position)
  bringToFront(state, pile)

  const mergeTarget = state.piles.find((candidate) => (
    candidate.id !== pile.id && Math.hypot(candidate.x - pile.x, candidate.y - pile.y) < MERGE_DISTANCE
  ))
  if (!mergeTarget) {
    const replenished = centralPosition && isPlayerRow(nearestRowIndex(position.y))
      ? replenishCentralSlot(state, centralPosition)
      : false
    return {
      ok: true,
      message: `Paquet déplacé (${formatCardCount(pile.cards.length)}).${replenished ? ' Une carte remplace celle prise au centre.' : ''}`,
      selectedPileId: pile.id,
    }
  }

  mergeTarget.cards.push(...pile.cards)
  removePile(state, pile.id)
  if (movedDrawPile) state.drawPileId = mergeTarget.id
  bringToFront(state, mergeTarget)
  Object.assign(mergeTarget, snapPosition(state, mergeTarget, mergeTarget) ?? {})
  const replenished = centralPosition && isPlayerRow(nearestRowIndex(position.y))
    ? replenishCentralSlot(state, centralPosition)
    : false
  return {
    ok: true,
    message: `Paquets fusionnés : ${formatCardCount(mergeTarget.cards.length)}.${replenished ? ' Une carte remplace celle prise au centre.' : ''}`,
    selectedPileId: mergeTarget.id,
  }
}

export function playerRowPiles(state: GameState, playerId: PlayerId) {
  const rowIndex = PLAYERS[playerId].rowIndex
  return state.piles.filter((pile) => nearestRowIndex(pile.y) === rowIndex)
}

export function clampPlayerRowShift(state: GameState, playerId: PlayerId, requestedSlots: number) {
  const piles = playerRowPiles(state, playerId)
  if (piles.length === 0) return 0

  const slots = piles.map((pile) => slotOf(pile.x))
  const minShift = -Math.min(...slots)
  const maxShift = PLAYER_ROW_SLOTS - 1 - Math.max(...slots)
  return clamp(Math.round(requestedSlots), minShift, maxShift)
}

export function movePlayerRowGroup(state: GameState, playerId: PlayerId, requestedSlots: number): ActionResult {
  const piles = playerRowPiles(state, playerId)
  const shift = clampPlayerRowShift(state, playerId, requestedSlots)
  if (shift === 0) {
    return { ok: false, message: 'La ligne ne peut pas être déplacée davantage dans cette direction.' }
  }

  piles
    .slice()
    .sort((left, right) => left.z - right.z)
    .forEach((pile, index) => {
      pile.x = playerRowSlotX(slotOf(pile.x) + shift)
      pile.y = ROW_Y[PLAYERS[playerId].rowIndex]
      pile.z = state.topZ + index + 1
    })
  state.topZ += piles.length

  return {
    ok: true,
    message: `Ligne de ${PLAYERS[playerId].label} déplacée de ${Math.abs(shift)} emplacement${Math.abs(shift) > 1 ? 's' : ''}.`,
  }
}

export function movePileToHand(state: GameState, pileId: string | null, playerId: PlayerId): ActionResult {
  const pile = findPile(state, pileId)
  if (!pile) return { ok: false, message: 'Sélectionnez un paquet à envoyer dans une main.' }
  if (pile.cards.length > 1) {
    return { ok: false, message: "Impossible d'envoyer plusieurs cartes dans une main en une seule fois." }
  }
  if (state.hands[playerId].length >= MAX_HAND_SIZE) {
    return { ok: false, message: `Main de ${PLAYERS[playerId].label} pleine : ${MAX_HAND_SIZE} cartes maximum.` }
  }

  const centralPosition = pile.id !== state.drawPileId && nearestRowIndex(pile.y) === 1
    ? { x: pile.x, y: ROW_Y[1] }
    : null
  state.hands[playerId].push(...pile.cards)
  removePile(state, pile.id)
  const replenished = centralPosition ? replenishCentralSlot(state, centralPosition) : false
  return {
    ok: true,
    message: `Carte envoyée dans la main de ${PLAYERS[playerId].label}.${replenished ? ' Une carte remplace celle prise au centre.' : ''}`,
    selectedPileId: null,
  }
}

export function playFromHand(state: GameState, playerId: PlayerId, index: number, target?: Point): ActionResult {
  const card = state.hands[playerId][index]
  if (!card) return { ok: false, message: '' }

  // Without a drop point the card goes to the first free slot of the player's row.
  const position = target ?? { x: playerRowSlotX(0), y: ROW_Y[PLAYERS[playerId].rowIndex] }
  const pile = addPile(state, [{ ...card, faceUp: true }], position)
  if (!pile) return { ok: false, message: rowRefusal({ id: '', x: 0, y: 0, z: 0, cards: [card] }, position) }

  state.hands[playerId].splice(index, 1)
  return { ok: true, message: `Carte ${card.code} jouée depuis la main de ${PLAYERS[playerId].label}.`, selectedPileId: pile.id }
}

export function reorderHand(state: GameState, playerId: PlayerId, from: number, to: number): ActionResult {
  const hand = state.hands[playerId]
  if (from === to || from < 0 || to < 0 || from >= hand.length || to >= hand.length) return { ok: false, message: '' }

  const [card] = hand.splice(from, 1)
  hand.splice(to, 0, card)
  return { ok: true, message: `Main de ${PLAYERS[playerId].label} réorganisée.` }
}
