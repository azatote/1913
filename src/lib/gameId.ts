const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const GAME_PARAM = 'partie'

// Only a UUID is accepted: it is interpolated into the Realtime filter.
export function extractGameId(value: string | null) {
  return value ? UUID_PATTERN.exec(value)?.[0].toLowerCase() ?? null : null
}

export function readGameIdFromUrl() {
  return extractGameId(new URLSearchParams(window.location.search).get(GAME_PARAM))
}

export function buildGameUrl(gameId: string | null) {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  if (gameId) url.searchParams.set(GAME_PARAM, gameId)
  return url.toString()
}
