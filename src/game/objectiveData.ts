import type { ResourceId } from './cardData.ts'

// Source: carte_de_plans_complete.csv. L'ID du CSV est le numéro du fichier carte-objectf_icones_NN.png, donc Card.code.
// Coût: argent, population, logistique, transport.
const COSTS: [number, number, number, number][] = [
  [1, 1, 2, 1], // 1
  [3, 0, 1, 1], // 2
  [1, 2, 1, 1], // 3
  [2, 1, 1, 1], // 4
  [1, 1, 1, 2], // 5
  [0, 2, 2, 2], // 6
  [1, 2, 1, 2], // 7
  [2, 2, 1, 1], // 8
  [1, 2, 1, 2], // 9
  [0, 3, 3, 2], // 10
  [2, 2, 2, 2], // 11
  [2, 2, 2, 2], // 12
  [2, 2, 2, 2], // 13
  [2, 0, 2, 3], // 14
  [2, 2, 2, 2], // 15
  [0, 0, 0, 8], // 16
  [2, 2, 2, 2], // 17
  [8, 0, 0, 0], // 18
  [0, 0, 8, 0], // 19
  [0, 8, 0, 0], // 20
  [2, 2, 2, 2], // 21
  [2, 2, 2, 2], // 22
  [2, 2, 2, 2], // 23
  [0, 4, 0, 0], // 24
  [0, 0, 4, 0], // 25
  [4, 0, 0, 0], // 26
  [1, 1, 1, 1], // 27
  [1, 0, 2, 1], // 28
  [0, 1, 1, 2], // 29
  [1, 1, 1, 1], // 30
  [0, 1, 1, 2], // 31
  [0, 0, 0, 4], // 32
  [1, 1, 1, 1], // 33
  [0, 1, 1, 2], // 34
  [1, 2, 1, 0], // 35
  [0, 1, 1, 2], // 36
]

export type ObjectiveCost = Record<ResourceId, number>

export function objectiveCost(code: number): ObjectiveCost | null {
  const cost = COSTS[code - 1]
  return cost ? { money: cost[0], population: cost[1], logistics: cost[2], transport: cost[3] } : null
}
