/**
 * Snippet list item component - displays a quick command item
 */

import { memo, useState, useCallback, forwardRef } from 'react'
import type { Snippet } from '../types'
import { theme } from '../theme'
import { formatTime } from '../utils/helpers'
import { MAX_SHORTCUT_INDEX } from '../constants'

const colors = theme.colors

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
      className={`relative px-4 py-3 cursor-pointer ${isSelected ? 'selected-indicator' : ''} ${isDeleting ? 'opacity-50' : ''}`}
      style={{ backgroundColor: isSelected ? colors.selected : 'transparent', ...style }}
      onClick={() => !isDeleting && onSelect(snippet.id)}
      onDoubleClick={() => !isDeleting && onCopy(snippet)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Content area */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span
            className={`text-sm flex-shrink-0 mt-0.5 ${isSelected ? 'opacity-90' : ''}`}
            style={{ color: isSelected ? colors.text : colors.accent }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate font-medium" style={{ color: colors.text }}>
              {displayName}
            </p>
            {isSelected && snippet.alias && (
              <p className="text-xs mt-1.5 line-clamp-2 opacity-70 font-mono fade-in" style={{ color: colors.text }}>
                {snippet.content}
              </p>
            )}
          </div>
        </div>

        {/* Metadata area */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Action buttons */}
          {showActions && !isDeleting && (
            <>
              <button
                onClick={handleEditClick}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                style={{ color: colors.textMuted }}
                title="Edit"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={handleDeleteClick}
                className="p-1 rounded hover:bg-red-500/20 transition-colors"
                style={{ color: '#ef4444' }}
                title="Delete"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
          {index < MAX_SHORTCUT_INDEX && (
            <span
              className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{
                backgroundColor: isSelected ? 'rgba(255,255,255,0.15)' : colors.bgSecondary,
                color: isSelected ? colors.text : colors.textMuted
              }}
            >
              {index + 1}
            </span>
          )}
          <span className="text-xs" style={{ color: colors.textMuted }}>
            {formatTime(snippet.updated_at)}
          </span>
        </div>
      </div>
    </li>
  )
}))
