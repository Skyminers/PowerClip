/**
 * Snippet list item component - displays a quick command item
 * Apple-inspired design: clean, clear, with subtle interactions
 */

import { memo, useCallback, forwardRef } from 'react'
import { Star, Pencil, Trash2 } from 'lucide-react'
import type { Snippet } from '../types'
import { cn } from '@/lib/utils'

export const SNIPPET_ITEM_HEIGHT = 52

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
  contentTruncateLength = 60
}, ref) {
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(snippet.id)
  }, [snippet.id, onDelete])

  const handleEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onEdit(snippet)
  }, [snippet, onEdit])

  // Truncate content for display, replacing newlines with spaces for single-line rendering
  const flatContent = snippet.content.replace(/\n/g, ' ')
  const truncatedContent = flatContent.length > contentTruncateLength
    ? flatContent.slice(0, contentTruncateLength) + '…'
    : flatContent

  // Check if snippet has an alias
  const hasAlias = snippet.alias && snippet.alias.trim().length > 0

  return (
    <li
      ref={ref}
      data-id={snippet.id}
      data-index={dataIndex}
      className={cn(
        "group cursor-pointer transition-colors duration-150",
        isSelected && "selected-indicator"
      )}
      style={{
        backgroundColor: isSelected ? 'var(--selected)' : 'transparent',
        height: SNIPPET_ITEM_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        overflow: 'hidden',
        ...style
      }}
      onClick={() => onSelect(snippet.id)}
      onDoubleClick={() => onCopy(snippet)}
    >
      {/* Star indicator - subtle accent */}
      <div style={{
        width: 20,
        height: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        opacity: isSelected ? 1 : 0.5,
        transition: 'opacity 0.15s ease'
      }}>
        <Star
          className="w-4 h-4"
          style={{
            color: 'var(--accent)',
            fill: isSelected ? 'var(--accent)' : 'transparent',
            transition: 'fill 0.15s ease'
          }}
        />
      </div>

      {/* Content - clear hierarchy */}
      <div style={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2
      }}>
        {hasAlias ? (
          <>
            {/* Primary: Alias */}
            <span style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--foreground)',
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {snippet.alias}
            </span>
            {/* Secondary: Content preview */}
            <span style={{
              fontSize: 12,
              color: 'var(--muted-foreground)',
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              opacity: 0.7
            }}>
              {truncatedContent}
            </span>
          </>
        ) : (
          <span style={{
            fontSize: 14,
            color: 'var(--foreground)',
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {truncatedContent}
          </span>
        )}
      </div>

      {/* Actions - appear on hover/selection, subtle */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginLeft: 12,
        opacity: isSelected ? 1 : 0,
        transition: 'opacity 0.15s ease'
      }}
      className="group-hover:opacity-100"
      >
        {/* Edit button */}
            <button
              onClick={handleEdit}
              style={{
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                border: 'none',
                background: 'transparent',
                color: 'var(--muted-foreground)',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease, color 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--accent)'
                e.currentTarget.style.color = 'var(--foreground)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = 'var(--muted-foreground)'
              }}
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>

            {/* Delete button */}
            <button
              onClick={handleDelete}
              style={{
                width: 28,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                border: 'none',
                background: 'transparent',
                color: 'var(--muted-foreground)',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease, color 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'
                e.currentTarget.style.color = '#ef4444'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = 'var(--muted-foreground)'
              }}
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
      </div>
    </li>
  )
}))
