// Writes config.schema.json from the zod schema (STRATEGY_SPEC §8). Run: pnpm --filter engine gen:schema
import { writeFileSync } from 'node:fs'
import { z } from 'zod'
import { StrategySchema } from '../src/config.ts'

const url = new URL('../config.schema.json', import.meta.url)
writeFileSync(url, JSON.stringify(z.toJSONSchema(StrategySchema, { io: 'input' }), null, 2) + '\n')
