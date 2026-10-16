// Strategy config per docs/STRATEGY_SPEC.md §2–3. Canonical schema; config.schema.json is generated from it.
import { z } from 'zod'

const AssetId = z.string().regex(/^[A-Z0-9_]+$/, 'asset IDs are uppercase codes')
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM')

export const SleeveSchema = z
  .strictObject({
    id: z.string().min(1),
    weight: z.number().gt(0).lte(1),
    universe: z.array(AssetId).min(1),
    lookbacks: z.array(z.int().min(1).max(12)).min(1).default([12]),
    lookbackMode: z.enum(['blend', 'average']).default('blend'),
    momentum: z.enum(['total', 'skip1']).default('total'),
    topN: z.int().min(1).default(1),
    absFilter: z.enum(['tbill', 'zero', 'off']).default('tbill'),
    safeHaven: z
      .discriminatedUnion('mode', [
        z.strictObject({ mode: z.literal('fixed'), asset: AssetId }),
        z.strictObject({ mode: z.literal('bestOf'), assets: z.array(AssetId).min(1) }),
      ])
      .default({ mode: 'fixed', asset: 'AGG' }),
    weighting: z.enum(['equal', 'invVol']).default('equal'),
    buffer: z.number().min(0).default(0),
  })
  .superRefine((s, ctx) => {
    if (s.topN > s.universe.length) ctx.addIssue({ code: 'custom', path: ['topN'], message: 'topN must be ≤ universe size' })
    if (s.buffer > 0 && s.topN !== 1) ctx.addIssue({ code: 'custom', path: ['buffer'], message: 'buffer requires topN = 1 (v1)' })
    if (new Set(s.universe).size !== s.universe.length) ctx.addIssue({ code: 'custom', path: ['universe'], message: 'duplicate asset in universe' })
  })

export const SettingsSchema = z.strictObject({
  rebalance: z.enum(['monthly', 'quarterly']).default('monthly'),
  executionLag: z.union([z.literal(0), z.literal(1)]).default(0),
  currency: z.enum(['USD', 'PLN', 'EUR']).default('USD'),
  costPct: z.number().min(0).max(1).default(0.001),
  fxCostPct: z.number().min(0).max(1).default(0),
  tax: z
    .strictObject({ enabled: z.boolean().default(false), rate: z.number().min(0).max(1).default(0.19) })
    .prefault({}),
})

export const StrategySchema = z
  .strictObject({
    name: z.string().min(1),
    sleeves: z.array(SleeveSchema).min(1),
    startDate: Month.optional(),
    endDate: Month.optional(),
    settings: SettingsSchema.prefault({}),
  })
  .superRefine((c, ctx) => {
    const sum = c.sleeves.reduce((a, s) => a + s.weight, 0)
    if (Math.abs(sum - 1) > 1e-9) ctx.addIssue({ code: 'custom', path: ['sleeves'], message: `sleeve weights sum to ${sum}, must be 1` })
    if (new Set(c.sleeves.map((s) => s.id)).size !== c.sleeves.length) ctx.addIssue({ code: 'custom', path: ['sleeves'], message: 'duplicate sleeve id' })
    if (c.startDate && c.endDate && c.startDate > c.endDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'endDate before startDate' })
  })

export type StrategyInput = z.input<typeof StrategySchema>
export type Strategy = z.output<typeof StrategySchema>
export type Sleeve = z.output<typeof SleeveSchema>
export type Settings = z.output<typeof SettingsSchema>

/** Parse + apply defaults; throws ZodError on invalid config. */
export const parseConfig = (input: unknown): Strategy => StrategySchema.parse(input)
