import { assets } from '@/data/source'

const byId = new Map(assets.map((a) => [a.id, a]))
/** Human name, e.g. "US stocks (S&P 500)". Falls back to the raw ID. */
export const assetLabel = (id: string) => byId.get(id)?.name ?? id
/** Investable example, e.g. "iShares Core S&P 500 UCITS". */
export const assetExample = (id: string) => byId.get(id)?.ucits[0]?.name
/** Everything a strategy can hold (no FX columns). */
export const holdableAssets = assets.filter((a) => a.role !== 'fx')
/** Candidates for the "pick from" list: not cash. */
export const riskyAssets = holdableAssets.filter((a) => a.id !== 'TBILL')
