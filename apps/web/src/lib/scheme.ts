// Color scheme choice: remembered in localStorage and applied as <html data-scheme>.
// index.html applies the saved value before first paint; keep the key in sync.
export const SCHEMES = [
  { id: 'default', label: 'Default' },
  { id: 'catppuccin', label: 'Catppuccin (Latte / Mocha)' },
  { id: 'nord', label: 'Nord (Snow Storm / Polar Night)' },
  { id: 'solarized', label: 'Solarized' },
  { id: 'gruvbox', label: 'Gruvbox' },
  { id: 'rose-pine', label: 'Rosé Pine (Dawn / Main)' },
  { id: 'tokyo-night', label: 'Tokyo Night (Day / Night)' },
]
export const SCHEME_KEY = 'multigem.scheme'

export function getScheme(): string {
  try {
    const s = localStorage.getItem(SCHEME_KEY)
    if (s && SCHEMES.some((x) => x.id === s)) return s
  } catch { /* storage blocked: fall back */ }
  return 'default'
}

export function setScheme(id: string) {
  document.documentElement.dataset.scheme = id
  try { localStorage.setItem(SCHEME_KEY, id) } catch { /* not remembered */ }
}
