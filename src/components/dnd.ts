export const HAND_CARD_MIME = 'application/x-nd1913-hand-card'

export function readHandCardIndex(dataTransfer: DataTransfer) {
  const raw = dataTransfer.getData(HAND_CARD_MIME)
  const index = Number(raw)
  return raw !== '' && Number.isInteger(index) ? index : null
}

export function isHandCardDrag(dataTransfer: DataTransfer) {
  return dataTransfer.types.includes(HAND_CARD_MIME)
}
