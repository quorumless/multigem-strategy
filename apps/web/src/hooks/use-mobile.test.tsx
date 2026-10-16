import { describe, expect, it } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import { useIsMobile } from './use-mobile'

// Assert the hook agrees with the media query it is defined over.
const QUERY = '(max-width: 767px)'

describe('useIsMobile', () => {
  it('matches the max-width 767px media query', async () => {
    const { result } = await renderHook(() => useIsMobile())
    expect(result.current).toBe(window.matchMedia(QUERY).matches)
  })

  it('returns a boolean', async () => {
    const { result } = await renderHook(() => useIsMobile())
    expect(typeof result.current).toBe('boolean')
  })
})
