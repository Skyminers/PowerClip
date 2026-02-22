/**
 * Empty state component
 */

import { theme } from '../theme'

const colors = theme.colors

export function EmptyState({
  hasSearchQuery,
  semanticMode = false
}: {
  hasSearchQuery: boolean
  semanticMode?: boolean
}) {
  return (
    <li className="px-4 py-16 text-center empty-state">
      <div className="flex flex-col items-center gap-3" style={{ color: colors.textMuted }}>
        <svg className="w-12 h-12 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <span className="text-sm">
          {hasSearchQuery
            ? semanticMode
              ? 'No semantic search results found'
              : 'No matching results'
            : 'No clipboard history yet'}
        </span>
        <span className="text-xs opacity-50">
          {hasSearchQuery && semanticMode
            ? 'Try using different keywords'
            : 'Content will be recorded automatically after copying'}
        </span>
      </div>
    </li>
  )
}
