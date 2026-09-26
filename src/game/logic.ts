import type { ActionResult, Card, GameState, Pile, PlayerId, Point } from './types'

// Model coordinates, shared by every client whatever its screen size.
export const BOARD_WIDTH = 2200
export const BOARD_HEIGHT = 1400
export const CARD_WIDTH = 148
export const CARD_HEIGHT = 220
export const CARD_TOTAL = 56

const ROW_MARGIN = 28
const MERGE_DISTANCE = 120
const SNAP_DISTANCE = 28
const DRAW_OFFSET = { x: 190, y: 20 }
const PLAY_START_X = 56
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

const INITIAL_DECK: Point = { x: Math.round(BOARD_WIDTH * 0.72 - CARD_WIDTH / 2), y: ROW_Y[1] }

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

export function createInitialState(): GameState {
  const cards: Card[] = Array.from({ length: CARD_TOTAL }, (_, index) => ({
    id: createId(),
    code: index + 1,
    faceUp: false,
  }))

  return {
    piles: [{ id: createId(), ...INITIAL_DECK, z: 1, cards }],
    hands: { top: [], bottom: [] },
    topZ: 1,
  }
}

export function parseGameState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<GameState>
  if (!Array.isArray(value.piles) || !value.hands || !Array.isArray(value.hands.top) || !Array.isArray(value.hands.bottom)) {
    return null
  }

  return {
    piles: value.piles,
    hands: { top: value.hands.top, bottom: value.hands.bottom },
    topZ: typeof value.topZ === 'number' ? value.topZ : 1,
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

// Snaps to the nearest row, then aligns on a face-up pile of the same row.
export function snapPosition(state: GameState, pile: Pile, target: Point): Point {
  const rowIndex = nearestRowIndex(clamp(target.y, 0, BOARD_HEIGHT - CARD_HEIGHT))
  const position = { x: clamp(target.x, 0, BOARD_WIDTH - CARD_WIDTH), y: ROW_Y[rowIndex] }

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
}

function addPile(state: GameState, cards: Card[], target: Point) {
  state.topZ += 1
  const pile: Pile = { id: createId(), x: 0, y: 0, z: state.topZ, cards }
  Object.assign(pile, snapPosition(state, pile, target))
  state.piles.push(pile)
  return pile
}

export function resetGame(state: GameState): ActionResult {
  Object.assign(state, createInitialState())
  return { ok: true, message: `Nouvelle partie prête : ${CARD_TOTAL} cartes dans le talon.`, selectedPileId: state.piles[0].id }
}

export function drawCard(state: GameState, pileId: string): ActionResult {
  const source = findPile(state, pileId)
  const card = source?.cards.pop()
  if (!source || !card) return { ok: false, message: 'Aucune carte disponible à piocher.' }

  card.faceUp = true
  const pile = addPile(state, [card], { x: source.x + DRAW_OFFSET.x, y: source.y + DRAW_OFFSET.y })
  if (source.cards.length === 0) removePile(state, source.id)
  return { ok: true, message: `Carte ${card.code} piochée.`, selectedPileId: pile.id }
}

export function flipTopCard(state: GameState, pileId: string | null): ActionResult {
  const pile = findPile(state, pileId)
  const topCard = pile && getTopCard(pile)
  if (!pile || !topCard) return { ok: false, message: 'Sélectionnez un paquet avec au moins une carte.' }

  topCard.faceUp = !topCard.faceUp
  Object.assign(pile, snapPosition(state, pile, pile))
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

  const { cards } = pile
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[cards[index], cards[target]] = [cards[target], cards[index]]
  }
  return { ok: true, message: `Paquet mélangé (${formatCardCount(cards.length)}).`, selectedPileId: pile.id }
}

export function movePile(state: GameState, pileId: string, target: Point): ActionResult {
  const pile = findPile(state, pileId)
  if (!pile) return { ok: false, message: '' }

  Object.assign(pile, snapPosition(state, pile, target))
  bringToFront(state, pile)

  const mergeTarget = state.piles.find((candidate) => (
    candidate.id !== pile.id && Math.hypot(candidate.x - pile.x, candidate.y - pile.y) < MERGE_DISTANCE
  ))
  if (!mergeTarget) {
    return { ok: true, message: `Paquet déplacé (${formatCardCount(pile.cards.length)}).`, selectedPileId: pile.id }
  }

  mergeTarget.cards.push(...pile.cards)
  removePile(state, pile.id)
  bringToFront(state, mergeTarget)
  Object.assign(mergeTarget, snapPosition(state, mergeTarget, mergeTarget))
  return {
    ok: true,
    message: `Paquets fusionnés : ${formatCardCount(mergeTarget.cards.length)}.`,
    selectedPileId: mergeTarget.id,
  }
}

export function movePileToHand(state: GameState, pileId: string | null, playerId: PlayerId): ActionResult {
  const pile = findPile(state, pileId)
  if (!pile) return { ok: false, message: 'Sélectionnez un paquet à envoyer dans une main.' }
  if (pile.cards.length > 1) {
    return { ok: false, message: "Impossible d'envoyer plusieurs cartes dans une main en une seule fois." }
  }

  state.hands[playerId].push(...pile.cards)
  removePile(state, pile.id)
  return { ok: true, message: `Carte envoyée dans la main de ${PLAYERS[playerId].label}.`, selectedPileId: null }
}

function nextPlayPosition(state: GameState, playerId: PlayerId): Point {
  const rowIndex = PLAYERS[playerId].rowIndex
  const rowPiles = state.piles.filter((pile) => nearestRowIndex(pile.y) === rowIndex)
  const x = rowPiles.length === 0
    ? PLAY_START_X
    : Math.min(Math.max(...rowPiles.map((pile) => pile.x)) + PLAY_STEP_X, BOARD_WIDTH - CARD_WIDTH - 24)
  return { x, y: ROW_Y[rowIndex] }
}

export function playFromHand(state: GameState, playerId: PlayerId, index: number, target?: Point): ActionResult {
  const position = target ?? nextPlayPosition(state, playerId)
  const [card] = state.hands[playerId].splice(index, 1)
  if (!card) return { ok: false, message: '' }

  card.faceUp = true
  const pile = addPile(state, [card], position)
  return { ok: true, message: `Carte ${card.code} jouée depuis la main de ${PLAYERS[playerId].label}.`, selectedPileId: pile.id }
}

export function reorderHand(state: GameState, playerId: PlayerId, from: number, to: number): ActionResult {
  const hand = state.hands[playerId]
  if (from === to || from < 0 || to < 0 || from >= hand.length || to >= hand.length) return { ok: false, message: '' }

  const [card] = hand.splice(from, 1)
  hand.splice(to, 0, card)
  return { ok: true, message: `Main de ${PLAYERS[playerId].label} réorganisée.` }
}
