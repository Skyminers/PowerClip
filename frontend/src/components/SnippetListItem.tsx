/**
 * Snippet list item component - displays a quick command item
 * Fixed height design: shows alias (name) with content preview on the right
 */

import { memo, useState, useCallback, forwardRef } from 'react'
import { Star, Pencil, X } from 'lucide-react'
import type { Snippet } from '../types'
import { formatTime } from '../utils/helpers'
import { cn } from '@/lib/utils'

// Fixed height for snippet items
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
  const [showActions, setShowActions] = useState(false)

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isDeleting) {
      setIsDeleting(true)
      onDelete(snippet.id)
    }
  }, [snippet.id, isDeleting, onDelete])

  const handleEditClick = useCallback((e: React.MouseEvent) => {
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
        "relative px-4 cursor-pointer",
        isSelected && "selected-indicator selected-animate",
        isDeleting && "deleting"
      )}
      style={{
        backgroundColor: isSelected ? 'var(--selected)' : 'transparent',
        height: SNIPPET_ITEM_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        ...style
      }}
      onClick={() => !isDeleting && onSelect(snippet.id)}
      onDoubleClick={() => !isDeleting && onCopy(snippet)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-center justify-between gap-3 w-full">
        {/* Content area */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Star
            className="w-4 h-4 flex-shrink-0"
            style={{ color: isSelected ? 'var(--foreground)' : 'var(--accent)' }}
          />
          {/* Show alias if available, otherwise show content */}
          {hasAlias ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-sm truncate font-medium text-foreground">
                {snippet.alias}
              </span>
              <span className="text-xs truncate text-muted-foreground/60">
                {truncatedContent}
              </span>
            </div>
          ) : (
            <p className="text-sm truncate flex-1 text-foreground">
              {snippet.content}
            </p>
          )}
        </div>

        {/* Metadata area */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Action buttons */}
          {showActions && !isDeleting && (
            <>
              <button
                onClick={handleEditClick}
                className="p-1 rounded hover:bg-white/10 transition-colors button-press"
                style={{ color: 'var(--muted-foreground)' }}
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleDeleteClick}
                className="p-1 rounded hover:bg-red-500/20 transition-colors button-press"
                style={{ color: '#ef4444' }}
                title="Delete"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <span className="text-xs text-muted-foreground">
            {formatTime(snippet.updated_at)}
          </span>
        </div>
      </div>
    </li>
  )
}))
