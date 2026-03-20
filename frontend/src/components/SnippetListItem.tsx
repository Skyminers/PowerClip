/**
 * Snippet list item component - displays a quick command item
 * Fixed height design: one line showing alias or content
 */

import { memo, useState, useCallback, forwardRef } from 'react'
import { Star, Pencil, X } from 'lucide-react'
import type { Snippet } from '../types'
import { formatTime } from '../utils/helpers'
import { MAX_SHORTCUT_INDEX } from '../constants'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

// Fixed height for snippet items
export const SNIPPET_ITEM_HEIGHT = 48

export const SnippetListItem = memo(forwardRef<HTMLLIElement, {
  snippet: Snippet
  index: number
  isSelected: boolean
  onSelect: (id: number) => void
  onCopy: (snippet: Snippet) => void
  onDelete: (id: number) => void
  onEdit: (snippet: Snippet) => void
  style?: React.CSSProperties
  'data-index'?: number
}>(function SnippetListItem({
  snippet,
  index,
  isSelected,
  onSelect,
  onCopy,
  onDelete,
  onEdit,
  style,
  'data-index': dataIndex
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

  // Display alias if available, otherwise show the content
  const displayName = snippet.alias || snippet.content

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
        backgroundColor: isSelected ? 'hsl(var(--selected))' : 'transparent',
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
            style={{ color: isSelected ? 'hsl(var(--foreground))' : 'hsl(var(--accent))' }}
          />
          <p className="text-sm truncate font-medium flex-1 text-foreground">
            {displayName}
          </p>
        </div>

        {/* Metadata area */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Action buttons */}
          {showActions && !isDeleting && (
            <>
              <button
                onClick={handleEditClick}
                className="p-1 rounded hover:bg-white/10 transition-colors button-press"
                style={{ color: 'hsl(var(--muted-foreground))' }}
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
          {index < MAX_SHORTCUT_INDEX && (
            <Badge variant={isSelected ? "default" : "muted"}>
              {index + 1}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {formatTime(snippet.updated_at)}
          </span>
        </div>
      </div>
    </li>
  )
}))
