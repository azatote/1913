export type PlayerId = 'top' | 'bottom'

export type Card = {
  id: string
  code: number
  faceUp: boolean
}

export type Pile = {
  id: string
  x: number
  y: number
  z: number
  cards: Card[]
}

export type GameState = {
  piles: Pile[]
  hands: Record<PlayerId, Card[]>
  topZ: number
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
