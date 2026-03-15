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
  settingsError,
}: {
  totalCount: number
  filteredCount: number
  hasSearchQuery: boolean
  isDarwin: boolean
  semanticMode?: boolean
  viewMode?: 'history' | 'snippets'
  hotkeyModifiers: string
  hotkeyKey: string
  settingsError?: string | null
}) {
  const hotkeyDisplay = formatHotkey(hotkeyModifiers, hotkeyKey)

  return (
    <div className="flex items-center justify-between px-4 py-2 text-xs" style={{ backgroundColor: colors.bgSecondary }}>
      <div className="flex items-center gap-4" style={{ color: colors.textMuted }}>
        {settingsError ? (
          <span className="flex items-center gap-1.5" style={{ color: '#fca5a5' }} title={settingsError}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Config error - using defaults
          </span>
        ) : (
          <>
            <span>{filteredCount} / {totalCount} {viewMode === 'snippets' ? 'commands' : 'items'}</span>
            {viewMode === 'snippets' && <span style={{ color: colors.accent }}>Quick Commands</span>}
            {viewMode === 'history' && semanticMode && <span style={{ color: colors.accent }}>AI Search</span>}
            {viewMode === 'history' && !semanticMode && hasSearchQuery && <span style={{ color: colors.accent }}>Filtered</span>}
          </>
        )}
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
