// Plain-language meanings for every metric and parameter (PRD U2). Shown in ⓘ tooltips.
import type { Metrics } from 'engine'

export interface GlossaryEntry {
  label: string
  meaning: string
  /** Which direction is good. */
  good: string
  /** Typical range, for orientation only. */
  typical: string
}

type E = [label: string, meaning: string, good: string, typical: string]
const entry = ([label, meaning, good, typical]: E): GlossaryEntry => ({ label, meaning, good, typical })

const metricEntries: Record<keyof Metrics, E> = {
  months: ['Months tested', 'How many months of history the test covers.', 'Longer is more trustworthy.', '300–430'],
  totalReturn: ['Total return', 'How much your money grew over the whole period, in percent.', 'Higher is better.', '+500% to +3000% over 35 years'],
  cagr: ['Yearly growth (CAGR)', 'The steady yearly growth rate that would give the same final result.', 'Higher is better.', '5–10% a year'],
  volatility: ['Volatility', 'How much monthly returns bounce around, scaled to a year.', 'Lower means a smoother ride.', '8–18% a year'],
  sharpe: ['Sharpe ratio', 'Return above T-bills per unit of ups and downs.', 'Higher is better.', '0.3–1.0'],
  sortino: ['Sortino ratio', 'Like Sharpe, but only counts the bad (downward) bounces.', 'Higher is better.', '0.5–1.5'],
  maxDrawdown: ['Worst fall', 'The biggest drop from a high point to a later low.', 'Closer to 0% is better.', '−20% to −55%'],
  maxDrawdownPeak: ['Fall started', 'The month your money last peaked before the worst fall.', 'Informational.', '—'],
  maxDrawdownTrough: ['Fall bottomed', 'The month of the lowest point in the worst fall.', 'Informational.', '—'],
  maxDrawdownRecoveryMonths: ['Months to recover', 'Months from the bottom until you were back at the earlier high.', 'Fewer is better.', '12–60 months'],
  calmar: ['Calmar ratio', 'Yearly growth divided by the worst fall.', 'Higher is better.', '0.1–0.6'],
  ulcer: ['Ulcer index', 'How deep and how long falls lasted, combined into one number (percent).', 'Lower is better.', '3–15'],
  bestYear: ['Best year', 'The best full calendar year.', 'Higher is better.', '+20% to +60%'],
  worstYear: ['Worst year', 'The worst full calendar year.', 'Closer to 0% is better.', '−10% to −40%'],
  pctPositiveMonths: ['Winning months', 'Share of months that ended with a gain.', 'Higher is better, but not everything.', '55–70%'],
  switchesPerYear: ['Switches per year', 'How often the strategy changes what it holds. Each switch costs fees.', 'Fewer is cheaper and simpler.', '0.5–3'],
  timeInAsset: ['Time in each asset', 'Share of months spent holding each asset.', 'Informational.', '—'],
}

const paramEntries = {
  universe: ['Assets to choose from', 'The risky assets the strategy picks between each month.', 'More diverse choices help only if they behave differently.', '2–4 assets'],
  lookback: ['Lookback (months)', 'How far back we look to judge which asset has been winning.', 'No best value; very short reacts to noise, very long reacts late.', '3–12 months'],
  safeHaven: ['Safe haven', 'Where the money goes when no risky asset beats T-bills.', 'Steadier assets such as bonds cushion falls.', 'Bonds, T-bills or gold'],
  sleeves: ['Sleeves', 'Independent sub-strategies, each with its own share of the money.', 'More sleeves spread the bet.', '1–3'],
  sleeveWeight: ['Sleeve share (%)', 'Share of your money managed by this sleeve. All shares must add up to 100%.', 'Informational.', '—'],
  topN: ['How many to hold', 'Number of top-ranked assets held at once.', 'More holds smooth things but dilute the winner.', '1–3'],
  buffer: ['Switch buffer (%)', 'The new leader must beat the current holding by this margin before we switch.', 'Higher means fewer switches and lower costs.', '0–3%'],
  invVol: ['Calmer assets get more', 'When holding several assets, give more money to the less jumpy ones.', 'Often smoother; needs 13+ months of history.', 'on/off'],
  executionLag: ['Trade one month late', 'Realistic delay: act on the signal a month after it appears. Cash earns nothing meanwhile.', 'On is more pessimistic and more realistic.', 'off/on'],
  rebalance: ['Check how often', 'Monthly checks every month-end; quarterly only in Mar, Jun, Sep, Dec.', 'Quarterly means fewer trades.', 'monthly or quarterly'],
  currency: ['Reporting currency', 'Currency your results are shown in. Buy/sell signals always use USD.', 'Informational.', 'USD, PLN, EUR'],
  costPct: ['Trading cost (%)', 'Fee and spread paid on every amount bought or sold.', 'Lower is better.', '0.05–0.3%'],
  fxCostPct: ['Currency exchange cost (%)', 'Extra cost for converting currency; applies only when not reporting in USD.', 'Lower is better.', '0–0.5%'],
  tax: ['Tax on gains', 'Tax on gains realised by selling, paid at the end of each year.', 'Informational.', '19% in Poland'],
} satisfies Record<string, E>

export const glossary: Record<string, GlossaryEntry> = Object.fromEntries(
  Object.entries({ ...metricEntries, ...paramEntries }).map(([k, v]) => [k, entry(v)])
)
export const metricKeys = Object.keys(metricEntries)

/** Which direction wins when comparing runs. maxDrawdown and worstYear are ≤ 0, so "higher" = closer to 0. */
export const betterWhen = {
  totalReturn: 'higher',
  cagr: 'higher',
  volatility: 'lower',
  sharpe: 'higher',
  sortino: 'higher',
  maxDrawdown: 'higher',
  maxDrawdownRecoveryMonths: 'lower',
  calmar: 'higher',
  ulcer: 'lower',
  worstYear: 'higher',
  pctPositiveMonths: 'higher',
  switchesPerYear: 'lower',
} as const satisfies Partial<Record<keyof Metrics, 'higher' | 'lower'>>
