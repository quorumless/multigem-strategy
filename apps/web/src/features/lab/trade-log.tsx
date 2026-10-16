import { useMemo } from 'react'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import type { BacktestResult } from 'engine'
import { money } from '@/lib/format'
import { tradeSentence } from '@/lib/trade-sentence'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { assetLabel } from './assets'

interface Row {
  date: string
  text: string
  cost: string
  tax: string
}

export function TradeLog({ result, start }: { result: BacktestResult; start: number }) {
  const { currency } = result.config.settings
  const data = useMemo<Row[]>(
    () =>
      result.trades.map((t) => ({
        date: t.date,
        text: tradeSentence(t, result.config, assetLabel),
        cost: money(t.cost * start, currency),
        tax: t.tax > 0 ? money(t.tax * start, currency) : '–',
      })),
    [result, start, currency]
  )
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { accessorKey: 'text', header: 'What happened' },
      { accessorKey: 'cost', header: 'Fees' },
      { accessorKey: 'tax', header: 'Tax' },
    ],
    []
  )
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() })
  return (
    <div className='max-h-96 overflow-auto rounded-md border'>
      <Table>
        <TableHeader className='sticky top-0 bg-background'>
          {table.getHeaderGroups().map((g) => (
            <TableRow key={g.id}>
              {g.headers.map((h) => (
                <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((r) => (
            <TableRow key={r.id}>
              {r.getVisibleCells().map((c) => (
                <TableCell key={c.id} className={c.column.id === 'text' ? 'whitespace-normal' : 'whitespace-nowrap'}>
                  {flexRender(c.column.columnDef.cell, c.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
