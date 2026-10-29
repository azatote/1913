import type { ResourceId } from './cardData.ts'
import { RESOURCES } from './cardData.ts'
import { CAMPAIGN_PAWN_STARTS } from './logic.ts'
import type { ActionResult, CampaignPawnId, GameState, PlayerId } from './types'

// Centres des 20 cases d'une piste, en pixels sur l'image du plateau (1536 px de large). Les cases ne sont pas parfaitement régulières.
const BOARD_IMAGE_WIDTH = 1536
const CELL_CENTERS_PX = [
  339.75, 390, 440.25, 489.75, 539.25, 588.75, 638, 687, 737, 788.75,
  842.5, 895, 944, 991, 1037.75, 1086.5, 1134.75, 1182.75, 1231, 1278.75,
]

export const TRACK_CELL_X = CELL_CENTERS_PX.map((px) => px / BOARD_IMAGE_WIDTH)
export const TRACK_LENGTH = TRACK_CELL_X.length

// Same colors as the resource icons on the cards: logistics is blue (factory), transport is red (industry).
export const RESOURCE_TRACK_PAWNS: Record<ResourceId, CampaignPawnId> = {
  money: 'money',
  population: 'population',
  logistics: 'factory',
  transport: 'industry',
}

// 1-based number of the cell closest to the pawn's horizontal position.
export function nearestTrackCell(x: number) {
  let nearest = 0
  TRACK_CELL_X.forEach((cellX, index) => {
    if (Math.abs(cellX - x) < Math.abs(TRACK_CELL_X[nearest] - x)) nearest = index
  })
  return nearest + 1
}

export function advanceResourceTrack(state: GameState, playerId: PlayerId, resource: ResourceId, steps: number): ActionResult {
  const pawnId = RESOURCE_TRACK_PAWNS[resource]
  const label = RESOURCES.find(({ id }) => id === resource)?.label ?? resource
  if (steps <= 0) return { ok: false, message: `${label} : aucune case à avancer.` }

  const from = nearestTrackCell(state.campaignPawns[playerId][pawnId].x)
  const to = Math.min(TRACK_LENGTH, from + steps)
  if (to === from) return { ok: false, message: `${label} : le pion est déjà à la case ${TRACK_LENGTH}.` }

  state.campaignPawns[playerId][pawnId] = { x: TRACK_CELL_X[to - 1], y: CAMPAIGN_PAWN_STARTS[pawnId].y }
  const moved = to - from
  return { ok: true, message: `${label} : le pion avance de ${moved} case${moved > 1 ? 's' : ''} (case ${to}).` }
}
