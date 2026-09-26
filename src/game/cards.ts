import type { Card } from './types'

const images = import.meta.glob<string>('../assets/cartes/*.{jpg,png}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const faces = new Map<number, string>()
let back = ''

for (const [path, url] of Object.entries(images)) {
  const match = /carte \((\d+)\)\.jpg$/.exec(path)
  if (match) faces.set(Number(match[1]), url)
  else if (path.endsWith('dos.png')) back = url
}

export const CARD_BACK_URL = back

export function cardFaceUrl(code: number) {
  return faces.get(code) ?? back
}

export function cardImageUrl(card: Card) {
  return card.faceUp ? cardFaceUrl(card.code) : back
}
