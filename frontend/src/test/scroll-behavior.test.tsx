/**
 * Tests for scroll behavior when window is shown
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useRef, useEffect, useState, useCallback } from 'react'

// Mock data
const createMockItems = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    item_type: 'text' as const,
    content: `Item content ${i + 1} - ${'x'.repeat(100)}`, // Long content
    hash: `hash-${i}`,
    created_at: new Date().toISOString(),
  }))

describe('Scroll Behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('scroll to top on window show', () => {
    it('should always scroll to top when window is shown, even if selectedId does not change', async () => {
      const scrollLog: number[] = []

      const TestComponent = () => {
        const listRef = useRef<HTMLUListElement>(null)
        const [selectedId, setSelectedId] = useState<number | null>(null)
        const windowShowCount = useRef(0)

        // Mock scrollTop setter
        useEffect(() => {
          const list = listRef.current
          if (!list) return

          const originalScrollTop = Object.getOwnPropertyDescriptor(
            HTMLElement.prototype,
            'scrollTop'
          )

          Object.defineProperty(list, 'scrollTop', {
            get: function () {
              return originalScrollTop?.get?.call(this) ?? 0
            },
            set: function (value: number) {
              scrollLog.push(value)
              return originalScrollTop?.set?.call(this, value)
            },
            configurable: true,
          })

          return () => {
            if (originalScrollTop) {
              Object.defineProperty(list, 'scrollTop', originalScrollTop)
            }
          }
        }, [])

        const simulateWindowShow = useCallback(() => {
          windowShowCount.current++
          const firstItemId = 1 // Always select first item

          // Simulate what happens in App.tsx window-shown handler
          setSelectedId(firstItemId)

          // Directly scroll to top (like in the new implementation)
          if (listRef.current) {
            listRef.current.scrollTop = 0
          }
        }, [])

        return (
          <div>
            <button onClick={simulateWindowShow} data-testid="show-btn">
              Show Window ({windowShowCount.current})
            </button>
            <span data-testid="selected-id">{selectedId}</span>
            <ul ref={listRef} style={{ height: '200px', overflow: 'auto' }}>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </div>
        )
      }

      render(<TestComponent />)

      // First window show
      await act(async () => {
        screen.getByTestId('show-btn').click()
      })
      expect(scrollLog).toContain(0)
      scrollLog.length = 0 // Clear log

      // Second window show - selectedId stays the same (1)
      await act(async () => {
        screen.getByTestId('show-btn').click()
      })
      expect(scrollLog).toContain(0)
      scrollLog.length = 0

      // Third window show - should still work
      await act(async () => {
        screen.getByTestId('show-btn').click()
      })
      expect(scrollLog).toContain(0)
    })
  })

  describe('estimateSize with selection awareness', () => {
    it('should return larger size for selected items', () => {
      const mockItems = createMockItems(5)
      const selectedId = 1

      const estimateSize = (index: number, items: typeof mockItems, selId: number | null) => {
        const item = items[index]
        if (item && selId === item.id) {
          return 90 // Selected items are taller due to preview text
        }
        return 56
      }

      // First item is selected
      expect(estimateSize(0, mockItems, selectedId)).toBe(90)

      // Other items are not selected
      expect(estimateSize(1, mockItems, selectedId)).toBe(56)
      expect(estimateSize(2, mockItems, selectedId)).toBe(56)

      // No selection
      expect(estimateSize(0, mockItems, null)).toBe(56)
    })
  })
})
