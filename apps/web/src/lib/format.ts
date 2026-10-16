export const pct = (x: number | null | undefined, digits = 1) => (x == null ? '–' : `${(x * 100).toFixed(digits)}%`)
export const num = (x: number | null | undefined, digits = 2) => (x == null ? '–' : x.toFixed(digits))
export const money = (x: number, currency: string) =>
  new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(x)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** `2008-03` → `Mar 2008` */
export const monthName = (d: string) => `${MONTHS[Number(d.slice(5)) - 1]} ${d.slice(0, 4)}`
export const MONTH_ABBR = MONTHS
