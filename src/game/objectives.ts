import { RESOURCES, type ResourceId } from './cardData.ts'
import { spendResourceTrack, trackResourceAmount } from './campaignTracks.ts'
import { moveObjectiveToHand } from './logic.ts'
import { objectiveCost } from './objectiveData.ts'
import type { ActionResult, GameState, PlayerId } from './types'

export type MissingResource = { resource: ResourceId; required: number; owned: number }

function resourceLabel(resource: ResourceId) {
  return RESOURCES.find(({ id }) => id === resource)?.label ?? resource
}

export function missingObjectiveResources(state: GameState, playerId: PlayerId, objectiveCode: number): MissingResource[] {
  const cost = objectiveCost(objectiveCode)
  if (!cost) return []
  return RESOURCES
    .map(({ id }) => ({ resource: id, required: cost[id], owned: trackResourceAmount(state, playerId, id) }))
    .filter(({ required, owned }) => owned < required)
}

// Taking an objective from the river requires the matching resources on the player's mobilization board, and spends them.
export function takeObjectiveToHand(state: GameState, objectivePileId: string, playerId: PlayerId): ActionResult {
  const pile = state.objectivePiles.find((entry) => entry.id === objectivePileId)
  const card = pile?.cards.at(-1)
  const isRiverCard = Boolean(pile && card && pile.id !== state.objectiveDrawPileId)
  const cost = isRiverCard && card ? objectiveCost(card.code) : null

  if (isRiverCard && card) {
    const missing = missingObjectiveResources(state, playerId, card.code)
    if (missing.length > 0) {
      const details = missing.map(({ resource, required, owned }) => `${resourceLabel(resource)} ${owned}/${required}`).join(', ')
      return { ok: false, message: `Objectif ${card.code} : ressources insuffisantes sur le plateau (${details}).` }
    }
  }

  const result = moveObjectiveToHand(state, objectivePileId, playerId)
  if (!result.ok || !cost) return result

  const spent = RESOURCES.filter(({ id }) => cost[id] > 0)
  for (const { id } of spent) spendResourceTrack(state, playerId, id, cost[id])
  const details = spent.map(({ id, label }) => `${label} −${cost[id]}`).join(', ')
  return { ...result, message: `${result.message}${details ? ` Ressources dépensées : ${details}.` : ''}` }
}
