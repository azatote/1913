export type PlayerId = 'top' | 'bottom'

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

export type GameState = {
  piles: Pile[]
  hands: Record<PlayerId, Card[]>
  objectiveHands: Record<PlayerId, Card[]>
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
