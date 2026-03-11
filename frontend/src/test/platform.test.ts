import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock navigator.platform before importing the module
const mockPlatform = (platform: string) => {
  Object.defineProperty(navigator, 'platform', {
    value: platform,
    writable: true,
    configurable: true,
  })
}

describe('formatHotkey', () => {
  // Store original platform
  let originalPlatform: string

  beforeEach(() => {
    originalPlatform = navigator.platform
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    })
    // Clear module cache to re-import with new platform
    vi.resetModules()
  })

  describe('on macOS', () => {
    beforeEach(() => {
      mockPlatform('MacIntel')
    })

    it('should format Meta+Shift+KeyV to ⌘⇧V', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Meta+Shift', 'KeyV')).toBe('⌘⇧V')
    })

    it('should format Control+Alt+KeyP to ⌃⌥P', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Control+Alt', 'KeyP')).toBe('⌃⌥P')
    })

    it('should format single modifier Meta+KeyA to ⌘A', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Meta', 'KeyA')).toBe('⌘A')
    })

    it('should format Digit keys correctly', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Meta', 'Digit1')).toBe('⌘1')
      expect(formatHotkey('Meta', 'Digit0')).toBe('⌘0')
    })

    it('should format F-keys correctly', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Meta', 'F1')).toBe('⌘F1')
      expect(formatHotkey('Meta', 'F12')).toBe('⌘F12')
    })

    it('should format special keys correctly', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Meta', 'Space')).toBe('⌘Space')
      expect(formatHotkey('Meta', 'Enter')).toBe('⌘Enter')
      expect(formatHotkey('Meta', 'Tab')).toBe('⌘Tab')
      expect(formatHotkey('Meta', 'Escape')).toBe('⌘Esc')
      expect(formatHotkey('Meta', 'Backspace')).toBe('⌘⌫')
      expect(formatHotkey('Meta', 'Delete')).toBe('⌘Del')
    })

    it('should format arrow keys correctly', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Meta', 'ArrowUp')).toBe('⌘↑')
      expect(formatHotkey('Meta', 'ArrowDown')).toBe('⌘↓')
      expect(formatHotkey('Meta', 'ArrowLeft')).toBe('⌘←')
      expect(formatHotkey('Meta', 'ArrowRight')).toBe('⌘→')
    })

    it('should handle empty modifiers', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('', 'KeyV')).toBe('V')
    })

    it('should handle empty key by returning empty string', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Meta', '')).toBe('')
    })

    it('should handle whitespace in modifiers', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Meta + Shift', 'KeyV')).toBe('⌘⇧V')
    })

    it('should handle case-insensitive modifiers', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('meta+shift', 'KeyV')).toBe('⌘⇧V')
      expect(formatHotkey('META+SHIFT', 'KeyV')).toBe('⌘⇧V')
    })
  })

  describe('on Windows', () => {
    beforeEach(() => {
      mockPlatform('Win32')
    })

    it('should format Control+Shift+KeyV to Ctrl+Shift+V', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Control+Shift', 'KeyV')).toBe('Ctrl+Shift+V')
    })

    it('should format Control+Alt+KeyP to Ctrl+Alt+P', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Control+Alt', 'KeyP')).toBe('Ctrl+Alt+P')
    })

    it('should format single modifier Control+KeyA to Ctrl+A', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Control', 'KeyA')).toBe('Ctrl+A')
    })

    it('should format Digit keys correctly', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Control', 'Digit1')).toBe('Ctrl+1')
      expect(formatHotkey('Control', 'Digit0')).toBe('Ctrl+0')
    })

    it('should format F-keys correctly', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Control', 'F1')).toBe('Ctrl+F1')
      expect(formatHotkey('Control', 'F12')).toBe('Ctrl+F12')
    })

    it('should format Meta as Win on Windows', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Meta', 'KeyV')).toBe('Win+V')
    })

    it('should handle empty modifiers', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('', 'KeyV')).toBe('V')
    })

    it('should handle empty key by returning empty string', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Control', '')).toBe('')
    })
  })

  describe('edge cases', () => {
    beforeEach(() => {
      mockPlatform('MacIntel')
    })

    it('should handle Numpad keys', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Meta', 'Numpad1')).toBe('⌘1')
      expect(formatHotkey('Meta', 'Numpad0')).toBe('⌘0')
    })

    it('should handle navigation keys', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Meta', 'Home')).toBe('⌘Home')
      expect(formatHotkey('Meta', 'End')).toBe('⌘End')
      expect(formatHotkey('Meta', 'PageUp')).toBe('⌘PgUp')
      expect(formatHotkey('Meta', 'PageDown')).toBe('⌘PgDn')
      expect(formatHotkey('Meta', 'Insert')).toBe('⌘Ins')
    })

    it('should pass through unknown key codes', async () => {
      const { formatHotkey } = await import('../utils/platform')
      expect(formatHotkey('Meta', 'UnknownKey')).toBe('⌘UnknownKey')
    })
  })
})

describe('isDarwin', () => {
  it('should return true for MacIntel', async () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      writable: true,
      configurable: true,
    })
    vi.resetModules()
    const { isDarwin } = await import('../utils/platform')
    expect(isDarwin).toBe(true)
  })

  it('should return true for MacPPC', async () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'MacPPC',
      writable: true,
      configurable: true,
    })
    vi.resetModules()
    const { isDarwin } = await import('../utils/platform')
    expect(isDarwin).toBe(true)
  })

  it('should return false for Win32', async () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
      configurable: true,
    })
    vi.resetModules()
    const { isDarwin } = await import('../utils/platform')
    expect(isDarwin).toBe(false)
  })

  it('should return false for Linux x86_64', async () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'Linux x86_64',
      writable: true,
      configurable: true,
    })
    vi.resetModules()
    const { isDarwin } = await import('../utils/platform')
    expect(isDarwin).toBe(false)
  })
})
