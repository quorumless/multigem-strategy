import { clearCookies } from '@/test-utils/cookies'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { LayoutProvider, useLayout } from './layout-provider'

const COOKIE_PREFIX = 'layout_'

function Probe() {
  const { collapsible, variant, setCollapsible, setVariant, resetLayout } =
    useLayout()
  return (
    <div>
      <span data-testid='collapsible'>{collapsible}</span>
      <span data-testid='variant'>{variant}</span>
      <button onClick={() => setCollapsible('offcanvas')}>collapse</button>
      <button onClick={() => setVariant('floating')}>floating</button>
      <button onClick={() => resetLayout()}>reset</button>
    </div>
  )
}

describe('LayoutProvider', () => {
  beforeEach(() => clearCookies(COOKIE_PREFIX))
  afterEach(() => clearCookies(COOKIE_PREFIX))

  it('starts from the defaults when no cookies are stored', async () => {
    const { getByTestId } = await render(
      <LayoutProvider>
        <Probe />
      </LayoutProvider>
    )

    await expect.element(getByTestId('collapsible')).toHaveTextContent('icon')
    await expect.element(getByTestId('variant')).toHaveTextContent('inset')
  })

  it('restores saved values from cookies', async () => {
    document.cookie = 'layout_collapsible=none; path=/'
    document.cookie = 'layout_variant=sidebar; path=/'

    const { getByTestId } = await render(
      <LayoutProvider>
        <Probe />
      </LayoutProvider>
    )

    await expect.element(getByTestId('collapsible')).toHaveTextContent('none')
    await expect.element(getByTestId('variant')).toHaveTextContent('sidebar')
  })

  it('setters update state and persist to cookies', async () => {
    const { getByRole, getByTestId } = await render(
      <LayoutProvider>
        <Probe />
      </LayoutProvider>
    )

    await userEvent.click(getByRole('button', { name: 'collapse' }))
    await userEvent.click(getByRole('button', { name: 'floating' }))

    await expect
      .element(getByTestId('collapsible'))
      .toHaveTextContent('offcanvas')
    await expect.element(getByTestId('variant')).toHaveTextContent('floating')
    expect(document.cookie).toContain('layout_collapsible=offcanvas')
    expect(document.cookie).toContain('layout_variant=floating')
  })

  it('resetLayout restores the default collapsible and variant', async () => {
    const { getByRole, getByTestId } = await render(
      <LayoutProvider>
        <Probe />
      </LayoutProvider>
    )

    await userEvent.click(getByRole('button', { name: 'collapse' }))
    await userEvent.click(getByRole('button', { name: 'floating' }))
    await userEvent.click(getByRole('button', { name: 'reset' }))

    await expect.element(getByTestId('collapsible')).toHaveTextContent('icon')
    await expect.element(getByTestId('variant')).toHaveTextContent('inset')
  })
})
