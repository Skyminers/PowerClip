/**
 * Tests for the useDebouncedValue hook
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('hello', 300))
    expect(result.current).toBe('hello')
  })

  it('does not update immediately when value changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'hello', delay: 300 } }
    )

    rerender({ value: 'world', delay: 300 })

    // Should still be the old value before the timer fires
    expect(result.current).toBe('hello')
  })

  it('updates after the delay has elapsed', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'hello', delay: 300 } }
    )

    rerender({ value: 'world', delay: 300 })

    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current).toBe('world')
  })

  it('resets the timer when value changes multiple times before delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'a', delay: 300 } }
    )

    rerender({ value: 'b', delay: 300 })
    act(() => { vi.advanceTimersByTime(100) }) // 100ms in — timer not fired

    rerender({ value: 'c', delay: 300 })
    act(() => { vi.advanceTimersByTime(100) }) // 200ms total — timer not fired

    rerender({ value: 'd', delay: 300 })
    // Timer reset again. Only 100ms elapsed since last change.
    expect(result.current).toBe('a') // still the original

    act(() => { vi.advanceTimersByTime(300) }) // timer fires
    expect(result.current).toBe('d') // the final value
  })

  it('works with number values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 0, delay: 500 } }
    )

    rerender({ value: 42, delay: 500 })
    expect(result.current).toBe(0)

    act(() => { vi.advanceTimersByTime(500) })
    expect(result.current).toBe(42)
  })

  it('works with object values', () => {
    const initial = { name: 'Alice' }
    const updated = { name: 'Bob' }

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: initial, delay: 200 } }
    )

    rerender({ value: updated, delay: 200 })
    expect(result.current).toEqual({ name: 'Alice' })

    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current).toEqual({ name: 'Bob' })
  })

  it('updates immediately when delay is 0', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'start', delay: 0 } }
    )

    rerender({ value: 'end', delay: 0 })

    act(() => { vi.advanceTimersByTime(0) })
    expect(result.current).toBe('end')
  })

  it('does not update before delay even with a large gap', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebouncedValue(value, delay),
      { initialProps: { value: 'first', delay: 1000 } }
    )

    rerender({ value: 'second', delay: 1000 })

    act(() => { vi.advanceTimersByTime(999) })
    expect(result.current).toBe('first') // still old

    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current).toBe('second') // updated exactly at 1000ms
  })
})
