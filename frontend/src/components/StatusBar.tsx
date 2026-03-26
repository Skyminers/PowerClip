/**
 * Status bar component
 * Apple-inspired design with subtle indicators and clean typography
 */

import { AlertTriangle } from 'lucide-react'
import { formatHotkey } from '../utils/platform'

export function StatusBar({
  totalCount,
  filteredCount,
  hasSearchQuery,
  semanticMode = false,
  viewMode = 'history',
  hotkeyModifiers,
  hotkeyKey,
  settingsError,
  hasExtensions = false,
  hasSelection = false,
}: {
  totalCount: number
  filteredCount: number
  hasSearchQuery: boolean
  semanticMode?: boolean
  viewMode?: 'history' | 'snippets'
  hotkeyModifiers: string
  hotkeyKey: string
  settingsError?: string | null
  hasExtensions?: boolean
  hasSelection?: boolean
}) {
  const hotkeyDisplay = formatHotkey(hotkeyModifiers, hotkeyKey)

  return (
    <div
      className="flex items-center justify-between px-4 py-2 text-xs border-t"
      style={{
        backgroundColor: 'var(--secondary)',
        borderColor: 'var(--border)'
      }}
    >
      {/* Left side - counts and status */}
      <div className="flex items-center gap-4">
        {settingsError ? (
          <span
            className="flex items-center gap-1.5"
            style={{ color: '#f87171' }}
            title={settingsError}
          >
            <AlertTriangle className="w-3 h-3" />
            Config error - using defaults
          </span>
        ) : (
          <>
            <span style={{ color: 'var(--muted-foreground)' }}>
              <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>{filteredCount}</span>
              <span style={{ opacity: 0.7 }}> / {totalCount}</span>
              <span style={{ opacity: 0.7 }}> {viewMode === 'snippets' ? 'commands' : 'items'}</span>
            </span>

            {/* Status indicators with dots */}
            {viewMode === 'snippets' && (
              <span className="flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
                Quick Commands
              </span>
            )}
            {viewMode === 'history' && semanticMode && (
              <span className="flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
                AI Search
              </span>
            )}
            {viewMode === 'history' && !semanticMode && hasSearchQuery && (
              <span className="flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
                Filtered
              </span>
            )}
          </>
        )}
      </div>

      {/* Right side - keyboard shortcuts */}
      <div className="flex items-center gap-3">
        <ShortcutHint keys="↑↓" label="Navigate" />
        {viewMode === 'history' && <ShortcutHint keys="←→" label="Filter" />}
        {viewMode === 'snippets' && <ShortcutHint keys="←→" label="History" />}
        {viewMode === 'history' && hasExtensions && hasSelection && (
          <ShortcutHint keys="Tab" label="Plugins" />
        )}
        <ShortcutHint keys="/" label="Search" />
        <ShortcutHint keys="Esc" label="Close" />
        <span style={{ color: 'var(--muted-foreground)', opacity: 0.7 }}>{hotkeyDisplay}</span>
      </div>
    </div>
  )
}

/* Sub-component for keyboard shortcuts */
function ShortcutHint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5" style={{ color: 'var(--muted-foreground)' }}>
      <span
        className="text-[9px] px-1.5 py-0.5 rounded"
        style={{
          backgroundColor: 'rgba(255,255,255,0.06)',
          fontFamily: 'monospace'
        }}
      >
        {keys}
      </span>
      <span style={{ opacity: 0.8 }}>{label}</span>
    </span>
  )
}
