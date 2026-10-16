export const HAND_CARD_MIME = 'application/x-nd1913-hand-card'
export const OBJECTIVE_CARD_MIME = 'application/x-nd1913-objective-card'
export const OBJECTIVE_HAND_MIME = 'application/x-nd1913-objective-hand'

export function readHandCardIndex(dataTransfer: DataTransfer) {
  const raw = dataTransfer.getData(HAND_CARD_MIME)
  const index = Number(raw)
  return raw !== '' && Number.isInteger(index) ? index : null
}

export function isHandCardDrag(dataTransfer: DataTransfer) {
  return dataTransfer.types.includes(HAND_CARD_MIME)
}

export function readObjectivePileId(dataTransfer: DataTransfer) {
  return dataTransfer.getData(OBJECTIVE_CARD_MIME) || null
}

export function isObjectiveCardDrag(dataTransfer: DataTransfer) {
  return dataTransfer.types.includes(OBJECTIVE_CARD_MIME)
}
