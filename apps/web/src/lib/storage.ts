// localStorage can throw (private mode, blocked data) or be empty: always fall back silently.
export function readJson<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key)
    return s ? (JSON.parse(s) as T) : fallback
  } catch {
    return fallback
  }
}
export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function storageAvailable(): boolean {
  try {
    localStorage.setItem('multigem.probe', '1')
    localStorage.removeItem('multigem.probe')
    return true
  } catch {
    return false
  }
}
