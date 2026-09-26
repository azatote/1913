import { createId } from '../game/logic'
import { readStored, writeStored } from './storage'

const TAB_KEY = 'nd1913.tab'

function loadOrCreateTabId() {
  const existing = readStored('session', TAB_KEY)
  if (existing) return existing
  const created = createId()
  writeStored('session', TAB_KEY, created)
  return created
}

// Identifies this browser tab in Realtime Presence (survives a page reload).
export const tabId = loadOrCreateTabId()
