import { clearCookies } from '@/test-utils/cookies'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, type RenderResult } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { getCookie, setCookie } from '@/lib/cookies'
import { ThemeProvider } from '@/context/theme-provider'
import { SidebarProvider } from '@/components/ui/sidebar'
import { ConfigDrawer } from './config-drawer'

async function renderConfigDrawer({
  sidebarDefaultOpen = true,
}: {
  sidebarDefaultOpen?: boolean
} = {}) {
  return await render(
    <ThemeProvider>
      <SidebarProvider defaultOpen={sidebarDefaultOpen}>
        <ConfigDrawer />
      </SidebarProvider>
    </ThemeProvider>
  )
}

async function openDrawer(screen: RenderResult) {
  await userEvent.click(
    screen.getByRole('button', { name: /^Open theme settings$/i })
  )
  await expect
    .element(screen.getByText(/^Theme Settings$/i))
    .toBeInTheDocument()
}

describe('ConfigDrawer (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    clearCookies()

    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.removeAttribute('dir')
  })

  it('opens the drawer and renders the sections', async () => {
    const screen = await renderConfigDrawer()

    await openDrawer(screen)

    const drawer = screen.getByRole('dialog', { name: /theme settings/i })

    await expect.element(drawer).toBeInTheDocument()

    await expect.element(drawer.getByText(/^Theme$/i)).toBeInTheDocument()
    // sidebar style, layout and direction are fixed (inset, default, LTR)
    for (const t of [/^Layout$/i, /^Sidebar$/i, /^Direction$/i])
      expect(drawer.getByText(t).query()).toBeNull()
    await expect
      .element(
        screen.getByRole('button', {
          name: /reset all settings to default values/i,
        })
      )
      .toBeInTheDocument()
  })

  describe('theme preference', () => {
    it('applies light theme to <html> and cookie', async () => {
      const screen = await renderConfigDrawer()
      await openDrawer(screen)
      await userEvent.click(
        screen.getByRole('radio', { name: /select light/i })
      )
      await vi.waitFor(() =>
        expect(document.documentElement.classList.contains('light')).toBe(true)
      )
      expect(getCookie('vite-ui-theme')).toBe('light')
    })

    it('applies dark theme to <html> and cookie', async () => {
      const screen = await renderConfigDrawer()
      await openDrawer(screen)
      await userEvent.click(screen.getByRole('radio', { name: /select dark/i }))
      await vi.waitFor(() =>
        expect(document.documentElement.classList.contains('dark')).toBe(true)
      )
      expect(getCookie('vite-ui-theme')).toBe('dark')
    })

    it('applies system theme: stores cookie and applies a resolved light or dark class', async () => {
      // Pre-seed light so mounted theme is not system; re-selecting System alone would not fire setTheme.
      setCookie('vite-ui-theme', 'light')

      const screen = await renderConfigDrawer()
      await openDrawer(screen)

      await userEvent.click(
        screen.getByRole('radio', { name: /select system/i })
      )
      await vi.waitFor(() => expect(getCookie('vite-ui-theme')).toBe('system'))
      await vi.waitFor(() => {
        const root = document.documentElement
        const hasLight = root.classList.contains('light')
        const hasDark = root.classList.contains('dark')
        expect(hasLight !== hasDark).toBe(true)
      })
    })
  })

  describe('section reset buttons', () => {
    it('resets theme via section control after choosing dark', async () => {
      const screen = await renderConfigDrawer()
      await openDrawer(screen)

      await userEvent.click(screen.getByRole('radio', { name: /select dark/i }))
      await vi.waitFor(() => expect(getCookie('vite-ui-theme')).toBe('dark'))

      await userEvent.click(
        screen.getByRole('button', {
          name: /reset theme preference to default/i,
        })
      )
      await vi.waitFor(() => expect(getCookie('vite-ui-theme')).toBe('system'))
    })

  })

  it('reset restores the default theme and opens the sidebar', async () => {
    const screen = await renderConfigDrawer({ sidebarDefaultOpen: false })

    await openDrawer(screen)
    await userEvent.click(screen.getByRole('radio', { name: /select dark/i }))
    await vi.waitFor(() => expect(getCookie('vite-ui-theme')).toBe('dark'))

    await userEvent.click(
      screen.getByRole('button', {
        name: /reset all settings to default values/i,
      })
    )

    await vi.waitFor(() => expect(getCookie('sidebar_state')).toBe('true'))
    await vi.waitFor(() => expect(getCookie('vite-ui-theme')).toBeUndefined())
  })
})
