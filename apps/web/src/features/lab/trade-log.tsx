import type { BacktestResult } from 'engine'
import { money, monthName } from '@/lib/format'
import { tradeSentence } from '@/lib/trade-sentence'
import { assetLabel } from './assets'

export function TradeLog({ result, start }: { result: BacktestResult; start: number }) {
  const { currency } = result.config.settings
  return (
    <ol className='max-h-[28rem] overflow-y-auto pe-1'>
      {result.trades.map((t, i) => {
        const date = monthName(t.date)
        const text = tradeSentence(t, result.config, assetLabel).replace(`${date}: `, '')
        return (
          <li key={i} className='grid grid-cols-[5.5rem_1fr] gap-3 border-b py-2.5 text-sm last:border-0'>
            <span className='text-muted-foreground tabular-nums'>{date}</span>
            <div>
              <p className='first-letter:uppercase'>{text}</p>
              <p className='mt-0.5 text-xs text-muted-foreground tabular-nums'>
                Fees {money(t.cost * start, currency)}
                {t.tax > 0 && <> · Tax {money(t.tax * start, currency)}</>}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
