// "What to hold now" helpers (display only; the signal itself comes from the engine).
export { currentSignal, type CurrentSignal } from 'engine'

/** `2026-09`, -1 → `2026-08` */
export const addMonths = (d: string, k: number) => {
  const n = Number(d.slice(0, 4)) * 12 + Number(d.slice(5)) - 1 + k
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`
}

/** Months between `asOf` and the last complete calendar month before `today`; 0 if up to date. Display only. */
export function monthsOld(asOf: string, today = new Date()): number {
  const last = today.getFullYear() * 12 + today.getMonth() - 1 // previous calendar month, 0-based month index
  const a = Number(asOf.slice(0, 4)) * 12 + Number(asOf.slice(5)) - 1
  return Math.max(0, last - a)
}

/** `2026-09` → `September 2026` */
export const longMonth = (d: string) => new Date(Number(d.slice(0, 4)), Number(d.slice(5)) - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' })

export const heldAssets = (w: Record<string, number>) =>
  Object.entries(w).filter(([, x]) => x > 0.005).sort((a, b) => b[1] - a[1])
