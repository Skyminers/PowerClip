/**
 * Snippet list item component - displays a quick command item
 * Compact layout with buttons and time grouped together
 */

import { memo, useState, useCallback, forwardRef } from 'react'
import { Star, Pencil, Trash2 } from 'lucide-react'
import type { Snippet } from '../types'
import { formatTime } from '../utils/helpers'
import { cn } from '@/lib/utils'

export const SNIPPET_ITEM_HEIGHT = 48

export const SnippetListItem = memo(forwardRef<HTMLLIElement, {
  snippet: Snippet
  isSelected: boolean
  onSelect: (id: number) => void
  onCopy: (snippet: Snippet) => void
  onDelete: (id: number) => void
  onEdit: (snippet: Snippet) => void
  style?: React.CSSProperties
  'data-index'?: number
  contentTruncateLength?: number
}>(function SnippetListItem({
  snippet,
  isSelected,
  onSelect,
  onCopy,
  onDelete,
  onEdit,
  style,
  'data-index': dataIndex,
  contentTruncateLength = 50
}, ref) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isDeleting) {
      setIsDeleting(true)
      onDelete(snippet.id)
    }
  }, [snippet.id, isDeleting, onDelete])

  const handleEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onEdit(snippet)
  }, [snippet, onEdit])

  // Truncate content for display
  const truncatedContent = snippet.content.length > contentTruncateLength
    ? snippet.content.slice(0, contentTruncateLength) + '...'
    : snippet.content

  // Check if snippet has an alias
  const hasAlias = snippet.alias && snippet.alias.trim().length > 0

  return (
    <li
      ref={ref}
      data-id={snippet.id}
      data-index={dataIndex}
      className={cn(
        "px-4 cursor-pointer",
        isSelected && "selected-indicator",
        isDeleting && "deleting"
      )}
      style={{
        backgroundColor: isSelected ? 'var(--selected)' : 'transparent',
        height: SNIPPET_ITEM_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        ...style
      }}
      onClick={() => !isDeleting && onSelect(snippet.id)}
      onDoubleClick={() => !isDeleting && onCopy(snippet)}
    >
      {/* Star icon - fixed width */}
      <Star
        className="w-4 h-4 flex-shrink-0"
        style={{ color: isSelected ? 'var(--foreground)' : 'var(--accent)' }}
      />

      {/* Content - flexible */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {hasAlias ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm truncate font-medium" style={{ color: 'var(--foreground)' }}>
              {snippet.alias}
            </span>
            <span className="text-xs truncate" style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}>
              {truncatedContent}
            </span>
          </div>
        ) : (
          <span className="text-sm truncate block" style={{ color: 'var(--foreground)' }}>
            {snippet.content}
          </span>
        )}
      </div>

      {/* Right side: actions + time in a compact group */}
      <div className="flex items-center shrink-0" style={{ gap: '2px' }}>
        {/* Edit button - fixed slot */}
        <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!isDeleting && (
            <button
              onClick={handleEdit}
              className="rounded hover:bg-blue-500/20 transition-colors"
              style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)' }}
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Delete button - fixed slot */}
        <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!isDeleting && (
            <button
              onClick={handleDelete}
              className="rounded hover:bg-rose-500/20 transition-colors"
              style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)' }}
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Time - compact, right aligned */}
        <span
          className="text-xs shrink-0"
          style={{
            minWidth: 70,
            textAlign: 'right',
            color: 'var(--muted-foreground)'
          }}
        >
          {formatTime(snippet.updated_at)}
        </span>
      </div>
    </li>
  )
}))
