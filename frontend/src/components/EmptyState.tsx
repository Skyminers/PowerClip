/**
 * Empty state component
 * Apple-inspired design with subtle visuals and clear hierarchy
 */

import { Clipboard, Search } from 'lucide-react'

export function EmptyState({
  hasSearchQuery,
  semanticMode = false
}: {
  hasSearchQuery: boolean
  semanticMode?: boolean
}) {
  return (
    <li
      className="px-4 py-16 text-center"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div
        className="flex flex-col items-center gap-4"
        style={{ color: 'var(--muted-foreground)' }}
      >
        {/* Icon - subtle */}
        <div
          style={{
            width: 48,
            height: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.3
          }}
        >
          {hasSearchQuery ? (
            <Search className="w-10 h-10" />
          ) : (
            <Clipboard className="w-10 h-10" />
          )}
        </div>

        {/* Primary text */}
        <span className="text-sm font-medium" style={{ color: 'var(--foreground)', opacity: 0.7 }}>
          {hasSearchQuery
            ? semanticMode
              ? 'No semantic search results found'
              : 'No matching results'
            : 'No clipboard history yet'}
        </span>

        {/* Secondary text */}
        <span className="text-xs" style={{ opacity: 0.5 }}>
          {hasSearchQuery && semanticMode
            ? 'Try using different keywords'
            : 'Content will be recorded automatically after copying'}
        </span>
      </div>
    </li>
  )
}
