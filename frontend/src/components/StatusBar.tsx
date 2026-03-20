/**
 * Status bar component
 * Displays clipboard statistics and keyboard shortcuts
 */

import { AlertTriangle } from 'lucide-react'
import { formatHotkey } from '../utils/platform'
import { Badge } from '@/components/ui/badge'

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
    <div className="flex items-center justify-between px-4 py-2 text-xs bg-secondary text-muted-foreground">
      <div className="flex items-center gap-4">
        {settingsError ? (
          <span className="flex items-center gap-1.5 text-red-300" title={settingsError}>
            <AlertTriangle className="w-3 h-3" />
            Config error - using defaults
          </span>
        ) : (
          <>
            <span>{filteredCount} / {totalCount} {viewMode === 'snippets' ? 'commands' : 'items'}</span>
            {viewMode === 'snippets' && <span className="text-accent">Quick Commands</span>}
            {viewMode === 'history' && semanticMode && <span className="text-accent">AI Search</span>}
            {viewMode === 'history' && !semanticMode && hasSearchQuery && <span className="text-accent">Filtered</span>}
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <Badge variant="keyboard">1-9</Badge>
          Quick copy
        </span>
        <span className="flex items-center gap-1.5">
          <Badge variant="keyboard">{isDarwin ? '⌘P' : 'Ctrl+P'}</Badge>
          Toggle
        </span>
        <span className="flex items-center gap-1.5">
          <Badge variant="keyboard">Esc</Badge>
          Close
        </span>
        <span>{hotkeyDisplay}</span>
      </div>
    </div>
  )
}
