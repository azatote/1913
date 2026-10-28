import { CARD_DATA, RESOURCES, type CardData, type ResourceId } from './cardData.ts'
import { PLAYER_ROW_SLOTS, playerRowPiles, playerRowSlotIndex } from './logic.ts'
import type { GameState, PlayerId } from './types'

export type ScoredGroup = {
  country: string
  cards: CardData[]
  completeRadios: number
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

function matchingRadiosBetween(left: CardData, right: CardData) {
  return Number(left.radios.rightTop && right.radios.leftTop) + Number(left.radios.rightBottom && right.radios.leftBottom)
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

function scoreGroup(cards: CardData[], completeRadios: number, invalidated: boolean): ScoredGroup {
  const resourceCounts = emptyResources()
  const scores = emptyResources()
  for (const { id } of RESOURCES) {
    resourceCounts[id] = cards.filter((card) => card.resources[id]).length
    scores[id] = invalidated ? 0 : completeRadios * resourceCounts[id]
  }
  return { country: cards[0].country, cards, completeRadios, resourceCounts, scores, invalidated }
}

export function scorePlayerRow(state: GameState, playerId: PlayerId): RowScore {
  const segments: { cards: CardData[]; completeRadios: number }[] = []
  const impossibleConnections: ImpossibleConnection[] = []
  const affectedCardCodes = new Set<number>()
  let cards: CardData[] = []
  let radios = 0

  const closeSegment = () => {
    if (cards.length > 0) segments.push({ cards, completeRadios: radios })
    cards = []
    radios = 0
  }

  for (const card of viewedRowCards(state, playerId)) {
    if (!card) {
      closeSegment()
      continue
    }

    const previous = cards.at(-1)
    if (!previous) {
      cards.push(card)
      continue
    }

    const matchingRadios = matchingRadiosBetween(previous, card)
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
  }
  closeSegment()

  const groups = segments
    .filter(({ cards: segmentCards, completeRadios }) => completeRadios > 0 || segmentCards.some((card) => affectedCardCodes.has(card.code)))
    .map(({ cards: segmentCards, completeRadios }) => (
      scoreGroup(segmentCards, completeRadios, segmentCards.some((card) => affectedCardCodes.has(card.code)))
    ))

  const totals = emptyResources()
  for (const group of groups) {
    for (const { id } of RESOURCES) totals[id] += group.scores[id]
  }
  return { groups, impossibleConnections, totals }
}
