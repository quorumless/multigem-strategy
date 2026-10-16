// Parses data/processed/monthly.csv text (docs/DATA.md §Output contract). Pure: takes a string, no fs.

export interface MonthlyData {
  /** `YYYY-MM`, ascending. */
  dates: string[]
  /** Column → value per date (USD TR index level, or FX_xxx = units per 1 USD); null = no data. */
  series: Record<string, (number | null)[]>
}

export class DataError extends Error {}

const nextMonth = (d: string) => {
  const y = Number(d.slice(0, 4))
  const m = Number(d.slice(5, 7))
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export function parseMonthlyCsv(text: string): MonthlyData {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  const header = lines[0]?.split(',').map((h) => h.trim())
  if (!header || header[0] !== 'date') throw new DataError('monthly.csv: first column must be "date"')
  const cols = header.slice(1)
  const dates: string[] = []
  const series: Record<string, (number | null)[]> = Object.fromEntries(cols.map((c) => [c, []]))
  for (const [i, line] of lines.slice(1).entries()) {
    const cells = line.split(',')
    if (cells.length !== header.length) throw new DataError(`monthly.csv line ${i + 2}: expected ${header.length} cells`)
    const d = cells[0]!.trim()
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(d)) throw new DataError(`monthly.csv line ${i + 2}: bad date "${d}"`)
    if (dates.length && d !== nextMonth(dates[dates.length - 1]!)) throw new DataError(`monthly.csv line ${i + 2}: dates must be consecutive months`)
    dates.push(d)
    cols.forEach((c, j) => {
      const s = cells[j + 1]!.trim()
      const v = s === '' ? null : Number(s)
      if (v !== null && !(Number.isFinite(v) && v > 0)) throw new DataError(`monthly.csv line ${i + 2}: bad value "${s}" in ${c}`)
      series[c]!.push(v)
    })
  }
  return { dates, series }
}
