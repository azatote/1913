import { CARD_DATA, RESOURCES, type CardData, type ResourceId } from './cardData.ts'
import { CARD_HEIGHT, CARD_WIDTH, PLAYER_ROW_SLOTS, RADIO_TOKEN_HEIGHT, RADIO_TOKEN_WIDTH, playerRowPiles, playerRowSlotIndex } from './logic.ts'
import type { GameState, PlayerId } from './types'

export type ScoredGroup = {
  country: string
  cards: CardData[]
  completeRadios: number
  // Complete radios that only exist thanks to a radio token on the rim between two cards.
  tokenRadios: number
  resourceCounts: Record<ResourceId, number>
  scores: Record<ResourceId, number>
  invalidated: boolean
}

export type ImpossibleConnection = {
  leftCard: CardData
  rightCard: CardData
  radios: number
}

export type RowScore = {
  groups: ScoredGroup[]
  impossibleConnections: ImpossibleConnection[]
  totals: Record<ResourceId, number>
}

function emptyResources(): Record<ResourceId, number> {
  return { money: 0, population: 0, logistics: 0, transport: 0 }
}

type RimTokens = { top: boolean; bottom: boolean }

// A radio token on the rim between two cards stands for both half radios: the radio is complete whatever the cards show.
function radioLink(left: CardData, right: CardData, tokens: RimTokens) {
  const top = left.radios.rightTop && right.radios.leftTop
  const bottom = left.radios.rightBottom && right.radios.leftBottom
  return {
    complete: Number(top || tokens.top) + Number(bottom || tokens.bottom),
    fromTokens: Number(!top && tokens.top) + Number(!bottom && tokens.bottom),
  }
}

// Rims holding a token, keyed by the pair of model slots they separate (left slot) and the radio height.
function rimTokenKeys(state: GameState, playerId: PlayerId) {
  const keys = new Set<string>()
  for (const pile of playerRowPiles(state, playerId)) {
    const slot = playerRowSlotIndex(pile.x)
    for (const token of state.radioTokens) {
      if (token.attachedTo?.pileId !== pile.id) continue
      const onRight = token.attachedTo.dx + RADIO_TOKEN_WIDTH / 2 >= CARD_WIDTH / 2
      const height = token.attachedTo.dy + RADIO_TOKEN_HEIGHT / 2 < CARD_HEIGHT / 2 ? 'top' : 'bottom'
      keys.add(`${onRight ? slot : slot - 1}:${height}`)
    }
  }
  return keys
}

// Cards are read left to right as the owner sees them: the top player's row is mirrored in the model.
function viewedRowCards(state: GameState, playerId: PlayerId): (CardData | null)[] {
  const slots: (CardData | null)[] = Array.from({ length: PLAYER_ROW_SLOTS }, () => null)
  for (const pile of playerRowPiles(state, playerId)) {
    const card = pile.cards.at(-1)
    if (card?.faceUp && card.kind !== 'objective') slots[playerRowSlotIndex(pile.x)] = CARD_DATA.get(card.code) ?? null
  }
  return playerId === 'top' ? slots.reverse() : slots
}

function scoreGroup(cards: CardData[], completeRadios: number, tokenRadios: number, invalidated: boolean): ScoredGroup {
  const resourceCounts = emptyResources()
  const scores = emptyResources()
  for (const { id } of RESOURCES) {
    resourceCounts[id] = cards.filter((card) => card.resources[id]).length
    scores[id] = invalidated ? 0 : completeRadios * resourceCounts[id]
  }
  return { country: cards[0].country, cards, completeRadios, tokenRadios, resourceCounts, scores, invalidated }
}

export function scorePlayerRow(state: GameState, playerId: PlayerId): RowScore {
  const segments: { cards: CardData[]; completeRadios: number; tokenRadios: number }[] = []
  const impossibleConnections: ImpossibleConnection[] = []
  const affectedCardCodes = new Set<number>()
  const rimTokens = rimTokenKeys(state, playerId)
  let cards: CardData[] = []
  let radios = 0
  let tokenRadios = 0

  const closeSegment = () => {
    if (cards.length > 0) segments.push({ cards, completeRadios: radios, tokenRadios })
    cards = []
    radios = 0
    tokenRadios = 0
  }

  for (const [index, card] of viewedRowCards(state, playerId).entries()) {
    if (!card) {
      closeSegment()
      continue
    }

    const previous = cards.at(-1)
    if (!previous) {
      cards.push(card)
      continue
    }

    // Model slot on the left of this pair; the top player's row is read mirrored.
    const modelLeftSlot = playerId === 'top' ? PLAYER_ROW_SLOTS - 1 - index : index - 1
    const link = radioLink(previous, card, {
      top: rimTokens.has(`${modelLeftSlot}:top`),
      bottom: rimTokens.has(`${modelLeftSlot}:bottom`),
    })
    const matchingRadios = link.complete
    if (previous.country !== card.country) {
      if (matchingRadios > 0) {
        impossibleConnections.push({ leftCard: previous, rightCard: card, radios: matchingRadios })
        affectedCardCodes.add(previous.code)
        affectedCardCodes.add(card.code)
      }
      closeSegment()
      cards.push(card)
      continue
    }

    if (matchingRadios === 0) {
      closeSegment()
      cards.push(card)
      continue
    }

    cards.push(card)
    radios += matchingRadios
    tokenRadios += link.fromTokens
  }
  closeSegment()

  const groups = segments
    .filter(({ cards: segmentCards, completeRadios }) => completeRadios > 0 || segmentCards.some((card) => affectedCardCodes.has(card.code)))
    .map(({ cards: segmentCards, completeRadios, tokenRadios: fromTokens }) => (
      scoreGroup(segmentCards, completeRadios, fromTokens, segmentCards.some((card) => affectedCardCodes.has(card.code)))
    ))

  const totals = emptyResources()
  for (const group of groups) {
    for (const { id } of RESOURCES) totals[id] += group.scores[id]
  }
  return { groups, impossibleConnections, totals }
}
