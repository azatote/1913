import type { Card } from './types'

const images = import.meta.glob<string>('../assets/cartes/*.{jpg,png}', {
  eager: true,
  query: '?url',
  import: 'default',
})
const objectiveImages = import.meta.glob<string>('../assets/objectifs/carte-objectf_icones_*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

const faces = new Map<number, string>()
const objectiveFaces = new Map<number, string>()
let back = ''

for (const [path, url] of Object.entries(images)) {
  const match = /carte \((\d+)\)\.jpg$/.exec(path)
  if (match) faces.set(Number(match[1]), url)
  else if (/dos\.(jpg|png)$/.test(path)) back = url
}

for (const [path, url] of Object.entries(objectiveImages)) {
  const match = /carte-objectf_icones_(\d+)\.png$/.exec(path)
  if (match) objectiveFaces.set(Number(match[1]), url)
}

export const CARD_BACK_URL = back

export function cardFaceUrl(code: number, kind?: Card['kind']) {
  return kind === 'objective' ? objectiveFaces.get(code) ?? back : faces.get(code) ?? back
}

export function cardImageUrl(card: Card) {
  return card.faceUp ? cardFaceUrl(card.code, card.kind) : back
}
