/**
 * Empty state component
 */

import { Clipboard } from 'lucide-react'

export function EmptyState({
  hasSearchQuery,
  semanticMode = false
}: {
  hasSearchQuery: boolean
  semanticMode?: boolean
}) {
  return (
    <li className="px-4 py-16 text-center empty-state">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Clipboard className="w-12 h-12 opacity-40" />
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
