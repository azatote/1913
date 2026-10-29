import type { ActionResult, CampaignPawnId, Card, GameState, ObjectivePile, Pile, PlayerId, Point, RadioToken } from './types'

// Model coordinates, shared by every client whatever its screen size.
export const BOARD_WIDTH = 2200
export const BOARD_HEIGHT = 1720
export const CARD_WIDTH = 148
export const CARD_HEIGHT = 220
export const BOARD_LAYOUT_VERSION = 2
export const CARD_TOTAL = 56
export const OBJECTIVE_CARD_TOTAL = 36
export const OBJECTIVE_MARKET_SIZE = 4
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
  350,
  Math.round((BOARD_HEIGHT - CARD_HEIGHT) / 2),
  1152,
  BOARD_HEIGHT - CARD_HEIGHT - ROW_MARGIN,
] as const

export const ROW_INDEX = {
  topObjectives: 0,
  topPlayer: 1,
  center: 2,
  bottomPlayer: 3,
  bottomObjectives: 4,
} as const

export const OBJECTIVE_ROW_INDEX: Record<PlayerId, number> = {
  top: ROW_INDEX.topObjectives,
  bottom: ROW_INDEX.bottomObjectives,
}

export const PLAYERS: Record<PlayerId, { label: string; rowIndex: number }> = {
  bottom: { label: 'Joueur 1', rowIndex: ROW_INDEX.bottomPlayer },
  top: { label: 'Joueur 2', rowIndex: ROW_INDEX.topPlayer },
}

export const PLAYER_IDS: PlayerId[] = ['bottom', 'top']

export const RADIO_TOKEN_COUNT = 10
// A token is a fifth of a card high; its width keeps the ratio of radios.png (168 x 235).
export const RADIO_TOKEN_HEIGHT = CARD_HEIGHT / 5
export const RADIO_TOKEN_WIDTH = (RADIO_TOKEN_HEIGHT * 168) / 235
export const RADIO_STACK_HOME: Point = { x: 220, y: Math.round(ROW_Y[ROW_INDEX.center] + (CARD_HEIGHT - RADIO_TOKEN_HEIGHT) / 2) }

function createRadioTokens(seed?: string): RadioToken[] {
  return Array.from({ length: RADIO_TOKEN_COUNT }, (_, index) => ({
    id: seed ? `${seed}-radio-${index + 1}` : createId(),
    x: RADIO_STACK_HOME.x,
    y: RADIO_STACK_HOME.y,
    z: index + 1,
    attachedTo: null,
  }))
}

function finiteOr(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeRadioTokens(raw: unknown, piles: Pile[], seed: string): RadioToken[] {
  if (!Array.isArray(raw)) return createRadioTokens(seed || undefined)
  const pileIds = new Set(piles.map((pile) => pile.id))
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string')
    .map((entry) => {
      const attached = entry.attachedTo as { pileId?: unknown; dx?: unknown; dy?: unknown } | null | undefined
      const attachedTo = attached && typeof attached.pileId === 'string' && pileIds.has(attached.pileId)
        ? { pileId: attached.pileId, dx: finiteOr(attached.dx, 0), dy: finiteOr(attached.dy, 0) }
        : null
      return {
        id: entry.id as string,
        x: finiteOr(entry.x, RADIO_STACK_HOME.x),
        y: finiteOr(entry.y, RADIO_STACK_HOME.y),
        z: finiteOr(entry.z, 0),
        attachedTo,
      }
    })
}

export const CAMPAIGN_PAWN_IDS: CampaignPawnId[] = ['money', 'population', 'industry', 'factory', 'france', 'unitedKingdom', 'russia']
export const CAMPAIGN_PAWN_STARTS: Record<CampaignPawnId, Point> = {
  money: { x: 0.222, y: 0.056 },
  population: { x: 0.222, y: 0.113 },
  industry: { x: 0.222, y: 0.17 },
  factory: { x: 0.222, y: 0.227 },
  france: { x: 0.341713, y: 0.434747 },
  unitedKingdom: { x: 0.596808, y: 0.444955 },
  russia: { x: 0.836617, y: 0.452611 },
}

function createCampaignPawnSet() {
  return Object.fromEntries(CAMPAIGN_PAWN_IDS.map((id) => [id, { ...CAMPAIGN_PAWN_STARTS[id] }])) as Record<CampaignPawnId, Point>
}

function createCampaignPawnPositions() {
  return { top: createCampaignPawnSet(), bottom: createCampaignPawnSet() }
}

function normalizeCampaignPawnSet(value: unknown) {
  const positions = value && typeof value === 'object' ? value as Partial<Record<CampaignPawnId, Point>> : {}
  return Object.fromEntries(CAMPAIGN_PAWN_IDS.map((id) => {
    const position = positions[id]
    const isValid = position
      && typeof position.x === 'number'
      && Number.isFinite(position.x)
      && typeof position.y === 'number'
      && Number.isFinite(position.y)
    return [id, isValid
      ? { x: Math.max(0, Math.min(1, position.x)), y: Math.max(0, Math.min(1, position.y)) }
      : { ...CAMPAIGN_PAWN_STARTS[id] }]
  })) as Record<CampaignPawnId, Point>
}

function normalizeCampaignPawnPositions(value: unknown) {
  const positions = value && typeof value === 'object' ? value as Record<string, unknown> : null
  if (positions && ('top' in positions || 'bottom' in positions)) {
    return {
      top: normalizeCampaignPawnSet(positions.top),
      bottom: normalizeCampaignPawnSet(positions.bottom),
    }
  }

  const legacyPositions = normalizeCampaignPawnSet(value)
  return {
    top: normalizeCampaignPawnSet(legacyPositions),
    bottom: normalizeCampaignPawnSet(legacyPositions),
  }
}

const PLAYER_ROW_START = Math.round((BOARD_WIDTH - PLAYER_ROW_SLOTS * CARD_WIDTH) / 2)

export function isPlayerRow(rowIndex: number) {
  return PLAYER_IDS.some((playerId) => PLAYERS[playerId].rowIndex === rowIndex)
}

export function playerRowSlotX(slot: number) {
  return PLAYER_ROW_START + slot * CARD_WIDTH
}

export function objectiveRowY(playerId: PlayerId) {
  return ROW_Y[OBJECTIVE_ROW_INDEX[playerId]]
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

function shuffleCards(cards: Card[], random = Math.random) {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[cards[index], cards[target]] = [cards[target], cards[index]]
  }
}

function seededRandom(seed: string) {
  let value = 0
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619)
  return () => {
    value = value + 0x6D2B79F5 | 0
    let result = value
    result = Math.imul(result ^ result >>> 15, result | 1)
    result ^= result + Math.imul(result ^ result >>> 7, result | 61)
    return ((result ^ result >>> 14) >>> 0) / 4294967296
  }
}

function createObjectiveRiver(seed?: string) {
  const cards = Array.from({ length: OBJECTIVE_CARD_TOTAL }, (_, index) => ({
    id: seed ? `${seed}-objective-card-${index + 1}` : createId(),
    code: index + 1,
    faceUp: false,
    kind: 'objective' as const,
  }))
  shuffleCards(cards, seed ? seededRandom(seed) : Math.random)

  const drawPileId = seed ? `${seed}-objective-deck` : createId()
  const piles: ObjectivePile[] = [{ id: drawPileId, slot: 0, z: 1, cards }]
  for (let slot = 1; slot <= OBJECTIVE_MARKET_SIZE; slot += 1) {
    const card = cards.pop()
    if (!card) break
    piles.push({
      id: seed ? `${seed}-objective-slot-${slot}` : createId(),
      slot,
      z: slot + 1,
      cards: [{ ...card, faceUp: true }],
    })
  }

  return { objectivePiles: piles, objectiveDrawPileId: drawPileId }
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
    y: ROW_Y[ROW_INDEX.center],
    z: slot + 1,
    cards: [{ ...card, faceUp: true }],
  }))
  const drawPile: Pile = { id: createId(), x: slotX(STARTING_MARKET_SIZE), y: ROW_Y[ROW_INDEX.center], z: slotCount, cards: deck }
  const objectiveRiver = createObjectiveRiver()

  return {
    piles: [...market, drawPile],
    hands,
    objectiveHands: { top: [], bottom: [] },
    campaignPawns: createCampaignPawnPositions(),
    radioTokens: createRadioTokens(),
    topZ: Math.max(slotCount, RADIO_TOKEN_COUNT),
    drawPileId: drawPile.id,
    boardLayoutVersion: BOARD_LAYOUT_VERSION,
    ...objectiveRiver,
  }
}

export function parseGameState(raw: unknown, legacySeed = ''): GameState | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<GameState>
  if (!Array.isArray(value.piles) || !value.hands || !Array.isArray(value.hands.top) || !Array.isArray(value.hands.bottom)) {
    return null
  }

  const boardLayoutVersion = value.boardLayoutVersion === BOARD_LAYOUT_VERSION ? BOARD_LAYOUT_VERSION : 1
  const legacyRowPositions: Record<number, number> = {
    28: ROW_Y[ROW_INDEX.topPlayer],
    590: ROW_Y[ROW_INDEX.center],
    1152: ROW_Y[ROW_INDEX.bottomPlayer],
  }
  const piles = boardLayoutVersion === BOARD_LAYOUT_VERSION
    ? value.piles
    : value.piles.map((pile) => {
      const y = legacyRowPositions[pile.y] ?? pile.y
      return y === pile.y ? pile : { ...pile, y }
    })

  const drawPile = typeof value.drawPileId === 'string'
    ? piles.find((pile) => pile.id === value.drawPileId)
    : undefined
  const legacyDrawPile = piles
    .filter((pile) => (
      nearestRowIndex(pile.y) === ROW_INDEX.center
      && Array.isArray(pile.cards)
      && pile.cards.length > 0
      && !isPileFaceUp(pile)
    ))
    .sort((left, right) => right.cards.length - left.cards.length || left.z - right.z)[0]
  const storedObjectivePiles = Array.isArray(value.objectivePiles) ? value.objectivePiles : undefined
  const objectiveRiver = storedObjectivePiles ? null : createObjectiveRiver(legacySeed)
  const objectivePiles = storedObjectivePiles ?? objectiveRiver!.objectivePiles
  const objectiveDrawPileId = storedObjectivePiles
    ? typeof value.objectiveDrawPileId === 'string' && objectivePiles.some((pile) => pile.id === value.objectiveDrawPileId)
      ? value.objectiveDrawPileId
      : null
    : objectiveRiver!.objectiveDrawPileId
  const storedObjectiveHands = value.objectiveHands
  const legacyTopObjectives = value.hands.top.filter((card) => card.kind === 'objective')
  const legacyBottomObjectives = value.hands.bottom.filter((card) => card.kind === 'objective')
  const radioTokens = normalizeRadioTokens(value.radioTokens, piles, legacySeed)

  return {
    piles,
    hands: {
      top: value.hands.top.filter((card) => card.kind !== 'objective'),
      bottom: value.hands.bottom.filter((card) => card.kind !== 'objective'),
    },
    objectiveHands: {
      top: [...(Array.isArray(storedObjectiveHands?.top) ? storedObjectiveHands.top : []), ...legacyTopObjectives],
      bottom: [...(Array.isArray(storedObjectiveHands?.bottom) ? storedObjectiveHands.bottom : []), ...legacyBottomObjectives],
    },
    campaignPawns: normalizeCampaignPawnPositions(value.campaignPawns),
    radioTokens,
    boardLayoutVersion: BOARD_LAYOUT_VERSION,
    topZ: Math.max(typeof value.topZ === 'number' ? value.topZ : 1, ...radioTokens.map((token) => token.z)),
    drawPileId: drawPile?.id ?? legacyDrawPile?.id ?? null,
    objectivePiles,
    objectiveDrawPileId,
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
  const pile = state.piles.find((entry) => entry.id === pileId)
  if (pile) {
    // Radio tokens stay on the table where the card was.
    for (const token of state.radioTokens) {
      if (token.attachedTo?.pileId !== pileId) continue
      token.x = pile.x + token.attachedTo.dx
      token.y = pile.y + token.attachedTo.dy
      token.attachedTo = null
    }
  }
  state.piles = state.piles.filter((entry) => entry.id !== pileId)
  if (state.drawPileId === pileId) state.drawPileId = null
}

function removeObjectivePile(state: GameState, pileId: string) {
  state.objectivePiles = state.objectivePiles.filter((pile) => pile.id !== pileId)
  if (state.objectiveDrawPileId === pileId) state.objectiveDrawPileId = null
}

function replenishObjectiveSlot(state: GameState, slot: number) {
  const drawPile = state.objectiveDrawPileId
    ? state.objectivePiles.find((pile) => pile.id === state.objectiveDrawPileId)
    : undefined
  const card = drawPile?.cards.pop()
  if (!drawPile || !card) return false

  card.faceUp = true
  if (drawPile.cards.length === 0) removeObjectivePile(state, drawPile.id)

  state.objectivePiles.push({
    id: createId(),
    slot,
    z: Math.max(0, ...state.objectivePiles.map((pile) => pile.z)) + 1,
    cards: [card],
  })
  return true
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
    y: ROW_Y[ROW_INDEX.center],
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

export function moveCampaignPawn(state: GameState, playerId: PlayerId, pawnId: CampaignPawnId, position: Point): ActionResult {
  state.campaignPawns[playerId][pawnId] = {
    x: Math.max(0, Math.min(1, position.x)),
    y: Math.max(0, Math.min(1, position.y)),
  }
  return { ok: true, message: '' }
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

export function movePile(state: GameState, pileId: string, target: Point, replenishCentralMarketSlot = true): ActionResult {
  const pile = findPile(state, pileId)
  if (!pile) return { ok: false, message: '' }

  const centralPosition = replenishCentralMarketSlot
    && pile.id !== state.drawPileId
    && pile.cards.length === 1
    && nearestRowIndex(pile.y) === ROW_INDEX.center
    ? { x: pile.x, y: ROW_Y[ROW_INDEX.center] }
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

export function moveObjectiveToPile(state: GameState, objectivePileId: string, target: Point): ActionResult {
  const source = state.objectivePiles.find((pile) => pile.id === objectivePileId)
  if (!source || source.id === state.objectiveDrawPileId || source.cards.length !== 1) {
    return { ok: false, message: 'Sélectionnez un objectif visible dans la rivière.' }
  }

  const pile: Pile = { id: source.id, x: 0, y: 0, z: state.topZ + 1, cards: source.cards }
  const position = snapPosition(state, pile, target)
  if (!position) return { ok: false, message: rowRefusal(pile, target) }

  removeObjectivePile(state, source.id)
  Object.assign(pile, position)
  state.piles.push(pile)
  const result = movePile(state, pile.id, position, false)
  if (!result.ok) {
    removePile(state, pile.id)
    state.objectivePiles.push(source)
    return result
  }

  const replenished = replenishObjectiveSlot(state, source.slot)
  return {
    ...result,
    message: `${result.message}${replenished ? ' Une carte objectif remplace celle prise dans la rivière.' : ''}`,
  }
}

export function moveObjectiveToHand(state: GameState, objectivePileId: string, playerId: PlayerId): ActionResult {
  const source = state.objectivePiles.find((pile) => pile.id === objectivePileId)
  if (!source || source.id === state.objectiveDrawPileId || source.cards.length !== 1) {
    return { ok: false, message: 'Sélectionnez un objectif visible dans la rivière.' }
  }
  state.objectiveHands[playerId].push(source.cards[0])
  removeObjectivePile(state, source.id)
  const replenished = replenishObjectiveSlot(state, source.slot)
  return {
    ok: true,
    message: `Objectif envoyé dans la main de ${PLAYERS[playerId].label}.${replenished ? ' Une carte objectif remplace celle prise dans la rivière.' : ''}`,
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
  if (pile.cards[0]?.kind === 'objective') {
    state.objectiveHands[playerId].push({ ...pile.cards[0], faceUp: true })
    removePile(state, pile.id)
    return { ok: true, message: 'Objectif ajouté à la main objectifs.', selectedPileId: null }
  }
  if (state.hands[playerId].length >= MAX_HAND_SIZE) {
    return { ok: false, message: `Main de ${PLAYERS[playerId].label} pleine : ${MAX_HAND_SIZE} cartes maximum.` }
  }

  const centralPosition = pile.id !== state.drawPileId && nearestRowIndex(pile.y) === ROW_INDEX.center
    ? { x: pile.x, y: ROW_Y[ROW_INDEX.center] }
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

export function moveObjectiveCardToHand(state: GameState, pileId: string, cardId: string, playerId: PlayerId): ActionResult {
  const pile = findPile(state, pileId)
  const cardIndex = pile?.cards.findIndex((card) => card.id === cardId) ?? -1
  const card = cardIndex >= 0 ? pile?.cards[cardIndex] : undefined
  if (!pile || !card || card.kind !== 'objective') {
    return { ok: false, message: 'Objectif introuvable sur le plateau.' }
  }

  const [objective] = pile.cards.splice(cardIndex, 1)
  state.objectiveHands[playerId].push({ ...objective, faceUp: true })
  if (pile.cards.length === 0) removePile(state, pile.id)
  return { ok: true, message: `Objectif ajouté à la main de ${PLAYERS[playerId].label}.` }
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

export function playObjectiveFromHand(state: GameState, playerId: PlayerId, cardId: string, target?: Point): ActionResult {
  const hand = state.objectiveHands[playerId]
  const index = hand.findIndex((card) => card.id === cardId)
  const card = hand[index]
  if (!card) return { ok: false, message: 'Objectif introuvable dans cette main.' }
  const position = target ?? { x: playerRowSlotX(0), y: objectiveRowY(playerId) }
  const pile = addPile(state, [{ ...card, faceUp: true }], position)
  if (!pile) return { ok: false, message: rowRefusal({ id: '', ...position, z: 0, cards: [card] }, position) }
  hand.splice(index, 1)
  return { ok: true, message: 'Objectif joué depuis la main.', selectedPileId: pile.id }
}
