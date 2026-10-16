import { describe, expect, it } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import useDialogState from './use-dialog-state'

describe('useDialogState', () => {
  it('starts with the initial state, null by default', async () => {
    const { result } = await renderHook(() =>
      useDialogState<'approve' | 'reject'>()
    )
    expect(result.current[0]).toBeNull()
  })

  it('opens the given key', async () => {
    const { result, act } = await renderHook(() =>
      useDialogState<'approve' | 'reject'>()
    )
    await act(() => result.current[1]('approve'))
    expect(result.current[0]).toBe('approve')
  })

  it('switches to another key without closing', async () => {
    const { result, act } = await renderHook(() =>
      useDialogState<'approve' | 'reject'>()
    )
    await act(() => result.current[1]('approve'))
    await act(() => result.current[1]('reject'))
    expect(result.current[0]).toBe('reject')
  })

  it('toggles off when the same key is set again', async () => {
    const { result, act } = await renderHook(() =>
      useDialogState<'approve' | 'reject'>()
    )
    await act(() => result.current[1]('approve'))
    await act(() => result.current[1]('approve'))
    expect(result.current[0]).toBeNull()
  })

  it('accepts an initial boolean state', async () => {
    const { result } = await renderHook(() => useDialogState<boolean>(true))
    expect(result.current[0]).toBe(true)
  })
})
