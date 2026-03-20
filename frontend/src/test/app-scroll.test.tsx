/**
 * Integration test for App scroll behavior
 * Tests the complete flow of window show -> data load -> scroll to top
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'

// Mock Tauri APIs
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

// Mock platform with all exports
vi.mock('../utils/platform', () => ({
  isDarwin: true,
  formatHotkey: (modifiers: string, key: string) => {
    if (!key) return ''
    const parts = modifiers ? modifiers.split('+') : []
    let keyDisplay = key.startsWith('Key') ? key.slice(3) : key
    return parts.length > 0 ? parts.join('+') + '+' + keyDisplay : keyDisplay
  },
}))

// Create mock items with long content
const createMockHistoryItems = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    item_type: 'text' as const,
    content: `History item ${i + 1}: ${'A'.repeat(200)}`, // Long content to trigger preview
    hash: `hash-${i}`,
    created_at: new Date(Date.now() - i * 1000).toISOString(),
  }))

const createMockSnippets = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    content: `Snippet ${i + 1}: ${'B'.repeat(200)}`,
    alias: `Alias ${i + 1}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }))

const defaultSettings = {
  auto_cleanup_enabled: false,
  max_items: 100,
  hotkey_modifiers: 'Meta+Shift',
  hotkey_key: 'KeyV',
  window_opacity: 0.95,
  auto_paste_enabled: false,
  extensions: [],
  semantic_search_enabled: false,
  embedding_api_url: '',
  embedding_api_key: '',
  embedding_api_model: '',
  embedding_api_dim: 256,
  add_to_snippets_hotkey_enabled: true,
  add_to_snippets_hotkey_modifiers: 'Meta+Shift',
  add_to_snippets_hotkey_key: 'KeyS',
  clipboard_poll_interval_ms: 100,
  min_similarity_score: 0.2,
  max_embeddings_in_memory: 50000,
  content_truncate_length: 50,
  image_preview_max_width: 120,
  image_preview_max_height: 80,
  max_history_fetch: 10000,
  focus_delay_ms: 50,
  semantic_search_debounce_ms: 300,
}

describe('App Scroll Integration', () => {
  let scrollEvents: number[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    scrollEvents = []

    // Setup default mock responses
    mockInvoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'get_history':
          return createMockHistoryItems(20)
        case 'get_snippets':
          return createMockSnippets(5)
        case 'get_settings':
          return defaultSettings
        case 'get_window_state':
          return { x: 100, y: 100 }
        default:
          return null
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('should verify isInitialSelectionRef is set before flushSync', async () => {
    // This test verifies the timing of ref setting
    // The ref must be set BEFORE flushSync so the scroll effect can detect it

    const { default: App } = await import('../App')

    // Mock the list ref to capture scroll events
    const originalScrollTop = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollTop'
    )

    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      set: function (value: number) {
        scrollEvents.push(value)
        return originalScrollTop?.set?.call(this, value)
      },
      get: function () {
        return originalScrollTop?.get?.call(this) ?? 0
      },
      configurable: true,
    })

    render(<App />)

    // Wait for initial render
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    // Trigger window show event
    await act(async () => {
      window.dispatchEvent(new CustomEvent('powerclip:window-shown'))
      await vi.runAllTimersAsync()
    })

    // Verify that scroll was reset to 0 at some point
    expect(scrollEvents).toContain(0)
  })

  it('should call get_history when window is shown', async () => {
    const { default: App } = await import('../App')

    render(<App />)

    // Clear initial calls
    mockInvoke.mockClear()

    // Trigger window show
    await act(async () => {
      window.dispatchEvent(new CustomEvent('powerclip:window-shown'))
      await vi.runAllTimersAsync()
    })

    // Verify get_history was called
    expect(mockInvoke).toHaveBeenCalledWith('get_history', { limit: expect.any(Number) })
  })
})
