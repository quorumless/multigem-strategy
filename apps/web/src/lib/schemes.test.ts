import { describe, expect, it } from 'vitest'
import css from '@/styles/schemes.css?raw'
import { SCHEMES, SCHEME_KEY, getScheme, setScheme } from './scheme'

const REQUIRED = [
  ...['background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground', 'accent', 'accent-foreground', 'destructive', 'border', 'input', 'ring'],
  ...['chart-strategy', 'chart-bh', 'chart-6040', 'chart-ew', 'div-neg', 'div-neu', 'div-pos'],
  ...Array.from({ length: 9 }, (_, i) => `chart-${i + 1}`),
]
// Default keeps the neutral shadcn base from theme.css, so only chart variables are required there.
const CHART_ONLY = (v: string) => /^(chart|div)-/.test(v)

const block = (sel: string) => {
  const m = css.match(new RegExp(`^${sel.replace(/[[\].".]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))
  expect(m, `missing block ${sel}`).toBeTruthy()
  return Object.fromEntries([...m![1]!.matchAll(/--([\w-]+): (#[0-9a-f]{6});/g)].map((x) => [x[1]!, x[2]!]))
}
const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05) }

describe('color schemes', () => {
  for (const { id } of SCHEMES)
    for (const mode of ['light', 'dark']) {
      it(`${id} ${mode} defines every variable and keeps text readable`, () => {
        const v = block(id === 'default' ? `[data-scheme="default"]${mode === 'dark' ? '.dark' : ''}` : mode === 'dark' ? `.dark[data-scheme="${id}"]` : `[data-scheme="${id}"]`)
        for (const k of REQUIRED.filter((k) => id !== 'default' || CHART_ONLY(k))) expect(v[k], `--${k}`).toBeDefined()
        if (id === 'default') return
        for (const [fg, bg] of [['foreground', 'background'], ['card-foreground', 'card'], ['muted-foreground', 'muted'], ['muted-foreground', 'background'], ['primary-foreground', 'primary'], ['accent-foreground', 'accent']])
          expect(ratio(v[fg!]!, v[bg!]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      })
    }
  it('persists the picked scheme', () => {
    setScheme('nord')
    expect(localStorage.getItem(SCHEME_KEY)).toBe('nord')
    expect(document.documentElement.dataset.scheme).toBe('nord')
    expect(getScheme()).toBe('nord')
    localStorage.removeItem(SCHEME_KEY)
    setScheme('default')
  })
})
