import { clearCookies } from '@/test-utils/cookies'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { ThemeProvider, useTheme } from './theme-provider'

const THEME_COOKIE = 'vite-ui-theme'

function Probe() {
  const { theme, resolvedTheme, setTheme, resetTheme } = useTheme()
  return (
    <div>
      <span data-testid='theme'>{theme}</span>
      <span data-testid='resolved'>{resolvedTheme}</span>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => resetTheme()}>reset</button>
    </div>
  )
}

const systemIsDark = () =>
  window.matchMedia('(prefers-color-scheme: dark)').matches

describe('ThemeProvider', () => {
  beforeEach(() => clearCookies(THEME_COOKIE))
  afterEach(() => {
    clearCookies(THEME_COOKIE)
    document.documentElement.classList.remove('light', 'dark')
  })

  it('defaults to system and resolves it from prefers-color-scheme', async () => {
    const { getByTestId } = await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )

    await expect.element(getByTestId('theme')).toHaveTextContent('system')
    const expected = systemIsDark() ? 'dark' : 'light'
    await expect.element(getByTestId('resolved')).toHaveTextContent(expected)
    expect(document.documentElement.classList.contains(expected)).toBe(true)
  })

  it('honours defaultTheme when no cookie is stored', async () => {
    const { getByTestId } = await render(
      <ThemeProvider defaultTheme='light'>
        <Probe />
      </ThemeProvider>
    )

    await expect.element(getByTestId('theme')).toHaveTextContent('light')
    await expect.element(getByTestId('resolved')).toHaveTextContent('light')
  })

  it('restores the theme from the cookie over defaultTheme', async () => {
    document.cookie = `${THEME_COOKIE}=dark; path=/`

    const { getByTestId } = await render(
      <ThemeProvider defaultTheme='light'>
        <Probe />
      </ThemeProvider>
    )

    await expect.element(getByTestId('theme')).toHaveTextContent('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('setTheme persists to the cookie and applies the class', async () => {
    const { getByRole, getByTestId } = await render(
      <ThemeProvider defaultTheme='light'>
        <Probe />
      </ThemeProvider>
    )

    await userEvent.click(getByRole('button', { name: 'dark' }))

    await expect.element(getByTestId('theme')).toHaveTextContent('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
    expect(document.cookie).toContain(`${THEME_COOKIE}=dark`)
  })

  it('resetTheme removes the cookie and falls back to system', async () => {
    document.cookie = `${THEME_COOKIE}=dark; path=/`

    const { getByRole, getByTestId } = await render(
      <ThemeProvider defaultTheme='light'>
        <Probe />
      </ThemeProvider>
    )

    await userEvent.click(getByRole('button', { name: 'reset' }))

    await expect.element(getByTestId('theme')).toHaveTextContent('system')
    expect(document.cookie).not.toContain(`${THEME_COOKIE}=`)
  })
})
