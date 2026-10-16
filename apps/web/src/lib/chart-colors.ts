// Chart colors come from CSS variables of the active scheme (src/styles/schemes.css).
/** Categorical slots, in fixed order. */
export const CAT = Array.from({ length: 9 }, (_, i) => `var(--chart-${i + 1})`)
export const STRATEGY = 'var(--chart-strategy)'
/** Benchmark line colors by engine benchmark id. */
export const BENCH_COLOR: Record<string, string> = { BH_US: 'var(--chart-bh)', '6040': 'var(--chart-6040)', EW: 'var(--chart-ew)' }
/** Diverging scale: `mix(x)` shades from neutral toward the positive (x>0) or negative (x<0) pole, |x| in 0..1. */
export const diverging = (x: number) =>
  `color-mix(in oklab, var(${x >= 0 ? '--div-pos' : '--div-neg'}) ${Math.round(Math.min(Math.abs(x), 1) * 100)}%, var(--div-neu))`
