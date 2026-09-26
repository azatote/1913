type StorageKind = 'local' | 'session'

function getStorage(kind: StorageKind) {
  return kind === 'local' ? window.localStorage : window.sessionStorage
}

// Storage can be unavailable (private mode, blocked cookies): fail silently.
export function readStored(kind: StorageKind, key: string) {
  try {
    return getStorage(kind).getItem(key)
  } catch {
    return null
  }
}

export function writeStored(kind: StorageKind, key: string, value: string | null) {
  try {
    if (value === null) getStorage(kind).removeItem(key)
    else getStorage(kind).setItem(key, value)
  } catch {
    // Ignored: the preference simply won't persist.
  }
}
