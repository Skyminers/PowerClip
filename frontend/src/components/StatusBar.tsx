/**
 * Status bar component
 * Displays clipboard statistics and keyboard shortcuts
 */

import { theme } from '../theme'
import { formatHotkey } from '../utils/platform'

const colors = theme.colors

export function StatusBar({
  totalCount,
  filteredCount,
  hasSearchQuery,
  isDarwin,
  semanticMode = false,
  viewMode = 'history',
  hotkeyModifiers,
  hotkeyKey,
}: {
  totalCount: number
  filteredCount: number
  hasSearchQuery: boolean
  isDarwin: boolean
  semanticMode?: boolean
  viewMode?: 'history' | 'snippets'
  hotkeyModifiers: string
  hotkeyKey: string
}) {
  const hotkeyDisplay = formatHotkey(hotkeyModifiers, hotkeyKey)

  return (
    <div className="flex items-center justify-between px-4 py-2 text-xs" style={{ backgroundColor: colors.bgSecondary }}>
      <div className="flex items-center gap-4" style={{ color: colors.textMuted }}>
        <span>{filteredCount} / {totalCount} {viewMode === 'snippets' ? 'commands' : 'items'}</span>
        {viewMode === 'snippets' && <span style={{ color: colors.accent }}>Quick Commands</span>}
        {viewMode === 'history' && semanticMode && <span style={{ color: colors.accent }}>AI Search</span>}
        {viewMode === 'history' && !semanticMode && hasSearchQuery && <span style={{ color: colors.accent }}>Filtered</span>}
      </div>
      <div className="flex items-center gap-4" style={{ color: colors.textMuted }}>
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: colors.bgHover }}>1-9</kbd>Quick copy
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: colors.bgHover }}>{isDarwin ? '⌘P' : 'Ctrl+P'}</kbd>Toggle
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: colors.bgHover }}>Esc</kbd>Close
        </span>
        <span>{hotkeyDisplay}</span>
      </div>
    </div>
  )
}
