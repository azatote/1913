import { RESOURCES, type ResourceId } from './cardData.ts'
import { trackResourceAmount } from './campaignTracks.ts'
import { moveObjectiveToHand } from './logic.ts'
import { objectiveCost } from './objectiveData.ts'
import type { ActionResult, GameState, PlayerId } from './types'

export type MissingResource = { resource: ResourceId; required: number; owned: number }

export function missingObjectiveResources(state: GameState, playerId: PlayerId, objectiveCode: number): MissingResource[] {
  const cost = objectiveCost(objectiveCode)
  if (!cost) return []
  return RESOURCES
    .map(({ id }) => ({ resource: id, required: cost[id], owned: trackResourceAmount(state, playerId, id) }))
    .filter(({ required, owned }) => owned < required)
}

// Taking an objective from the river requires the matching resources on the player's mobilization board.
export function takeObjectiveToHand(state: GameState, objectivePileId: string, playerId: PlayerId): ActionResult {
  const pile = state.objectivePiles.find((entry) => entry.id === objectivePileId)
  const card = pile?.cards.at(-1)
  if (pile && card && pile.id !== state.objectiveDrawPileId) {
    const missing = missingObjectiveResources(state, playerId, card.code)
    if (missing.length > 0) {
      const details = missing
        .map(({ resource, required, owned }) => `${RESOURCES.find(({ id }) => id === resource)?.label} ${owned}/${required}`)
        .join(', ')
      return { ok: false, message: `Objectif ${card.code} : ressources insuffisantes sur le plateau (${details}).` }
    }
  }
  return moveObjectiveToHand(state, objectivePileId, playerId)
}
