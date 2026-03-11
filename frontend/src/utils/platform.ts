/** Whether the current platform is macOS */
export const isDarwin = navigator.platform.toLowerCase().includes('mac')

/**
 * Format hotkey modifiers and key for display
 * Converts internal format (e.g., "Meta+Shift", "KeyV") to display format (e.g., "⌘⇧V", "Ctrl+Shift+V")
 */
export function formatHotkey(modifiers: string, key: string): string {
  // Handle empty/undefined inputs
  if (!key) {
    return ''
  }

  // Map internal modifier names to display symbols/names
  const modifierMap: Record<string, string> = isDarwin
    ? {
        'meta': '⌘',
        'control': '⌃',
        'alt': '⌥',
        'shift': '⇧',
      }
    : {
        'meta': 'Win',
        'control': 'Ctrl',
        'alt': 'Alt',
        'shift': 'Shift',
      }

  // Map special keys to display names
  const specialKeyMap: Record<string, string> = {
    'Space': 'Space',
    'Enter': 'Enter',
    'Tab': 'Tab',
    'Escape': 'Esc',
    'Backspace': '⌫',
    'Delete': 'Del',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'Home': 'Home',
    'End': 'End',
    'PageUp': 'PgUp',
    'PageDown': 'PgDn',
    'Insert': 'Ins',
  }

  // Parse modifiers (e.g., "Meta+Shift" -> ["Meta", "Shift"])
  const modifierParts = modifiers
    ? modifiers.split('+').map(m => modifierMap[m.trim().toLowerCase()] || m.trim())
    : []

  // Convert key code to display character (e.g., "KeyV" -> "V", "Digit1" -> "1")
  let keyDisplay = key

  // Check special keys first
  if (specialKeyMap[key]) {
    keyDisplay = specialKeyMap[key]
  } else if (key.startsWith('Key')) {
    keyDisplay = key.slice(3) // "KeyV" -> "V"
  } else if (key.startsWith('Digit')) {
    keyDisplay = key.slice(5) // "Digit1" -> "1"
  } else if (key.startsWith('Numpad')) {
    keyDisplay = key.slice(6) // "Numpad1" -> "1"
  } else if (/^F\d+$/.test(key)) {
    keyDisplay = key // "F1", "F12", etc.
  }

  // Combine modifiers and key
  if (modifierParts.length === 0) {
    return keyDisplay
  }
  return modifierParts.join(isDarwin ? '' : '+') + (isDarwin ? '' : '+') + keyDisplay
}
