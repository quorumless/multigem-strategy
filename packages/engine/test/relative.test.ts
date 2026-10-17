import { expect, test } from 'vitest'
import { computeRelative } from '../src/metrics.ts'

// 1999-12 (idx0) … 2001-12 (idx24): full years 2000 and 2001.
const dates = Array.from({ length: 25 }, (_, i) => {
  const m = (11 + i) % 12
  return `${1999 + Math.floor((11 + i) / 12)}-${String(m + 1).padStart(2, '0')}`
})
// strategy: flat, +10% in 2000-12 (idx12) → 1.1 from idx12 on. 2000 = +10%, 2001 = 0%.
const values = dates.map((_, i) => (i >= 12 ? 1.1 : 1))
// benchmark: +5% in 2000-06 (idx6), +10% in 2001-03 (idx15). 2000 = +5%, 2001 = +10%.
const benchValues = dates.map((_, i) => (i >= 15 ? 1.155 : i >= 6 ? 1.05 : 1))

test('relative: years behind and unrecovered longest stretch', () => {
  // yearsBehind: 2000 .10 vs .05 ahead; 2001 0 vs .10 behind → 1
  // q = s/b: 1 until idx5 (peak at 2000-05), 1/1.05 at idx6..11, 1.1/1.05 at idx12 ≥ 1 → recovered: 12−5 = 7 months.
  // q flat at idx12..14 → peak moves to idx14 (2001-02); idx15..24 q = 1.1/1.155 < peak, never recovers: 24−14 = 10.
  expect(computeRelative({ dates, values, benchValues })).toEqual({
    fullYears: 2,
    yearsBehind: 1,
    longestBehindMonths: 10,
    longestBehindStart: '2001-02',
    longestBehindEnd: null,
  })
})

test('relative: recovered stretch is the longest', () => {
  // cut at idx13 (2001-01): only 2000 is full → 0 behind; only stretch is 2000-05 → 2000-12 (7 months)
  const n = 14
  expect(computeRelative({ dates: dates.slice(0, n), values: values.slice(0, n), benchValues: benchValues.slice(0, n) })).toEqual({
    fullYears: 1,
    yearsBehind: 0,
    longestBehindMonths: 7,
    longestBehindStart: '2000-05',
    longestBehindEnd: '2000-12',
  })
})

test('relative: never behind', () => {
  // strategy always ≥ benchmark ratio peak (identical series → q ≡ 1)
  expect(computeRelative({ dates: dates.slice(0, 3), values: [1, 1.1, 1.2], benchValues: [1, 1.1, 1.2] })).toEqual({
    fullYears: 0,
    yearsBehind: 0,
    longestBehindMonths: 0,
    longestBehindStart: null,
    longestBehindEnd: null,
  })
})

test('relative: a tie up to float noise is not a year behind', () => {
  // 2000: benchmark ends 2e-16 above the strategy (float noise), 2001 flat for both
  const v = dates.map((_, i) => (i >= 12 ? 1.43 : 1))
  const b = dates.map((_, i) => (i >= 12 ? 1.3 * 1.1 : 1)) // 1.4300000000000002
  expect(computeRelative({ dates, values: v, benchValues: b }).yearsBehind).toBe(0)
})
