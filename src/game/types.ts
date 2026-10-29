export type PlayerId = 'top' | 'bottom'
export type CampaignPawnId = 'money' | 'population' | 'industry' | 'factory' | 'france' | 'unitedKingdom' | 'russia'

export type Card = {
  id: string
  code: number
  faceUp: boolean
  kind?: 'objective'
}

export type Pile = {
  id: string
  x: number
  y: number
  z: number
  cards: Card[]
}

export type ObjectivePile = {
  id: string
  slot: number
  z: number
  cards: Card[]
}

// A radio token is free on the table (x, y) or stuck on a pile at an offset from its top-left corner, so it follows the card.
export type RadioToken = {
  id: string
  x: number
  y: number
  z: number
  attachedTo: { pileId: string; dx: number; dy: number } | null
}

export type RadioPlacement = { pileId: string; dx: number; dy: number } | { x: number; y: number }

export type GameState = {
  piles: Pile[]
  hands: Record<PlayerId, Card[]>
  objectiveHands: Record<PlayerId, Card[]>
  campaignPawns: Record<PlayerId, Record<CampaignPawnId, Point>>
  radioTokens: RadioToken[]
  boardLayoutVersion: number
  topZ: number
  drawPileId: string | null
  objectivePiles: ObjectivePile[]
  objectiveDrawPileId: string | null
}

export type Point = {
  x: number
  y: number
}

export type ActionResult = {
  ok: boolean
  message: string
  selectedPileId?: string | null
}
