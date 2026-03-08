/**
 * Clipboard list item component
 */

import { memo, useState, useCallback } from 'react'
import type { ClipboardItem, ImageCache } from '../types'
import { theme } from '../theme'
import { formatContent, formatTime, getPreview } from '../utils/helpers'
import { MAX_SHORTCUT_INDEX } from '../constants'
import { IconDocument, IconImage } from './icons'

const colors = theme.colors

/**
 * Format similarity score as percentage
 * @param score Similarity score (0.0 - 1.0)
 * @returns Formatted string (0.00% - 100.00%)
 */
function formatScore(score: number): string {
  return (score * 100).toFixed(2) + '%'
}

export const ClipboardListItem = memo(function ClipboardListItem({
  item,
  index,
  isSelected,
  imageCache,
  semanticScore,
  contentTruncateLength = 50,
  imagePreviewMaxWidth = 120,
  imagePreviewMaxHeight = 80,
  onSelect,
  onCopy,
  onDelete,
  onAddToSnippets
}: {
  item: ClipboardItem
  index: number
  isSelected: boolean
  imageCache: ImageCache
  semanticScore?: number  // AI search similarity score (0.0 - 1.0)
  contentTruncateLength?: number
  imagePreviewMaxWidth?: number
  imagePreviewMaxHeight?: number
  onSelect: (id: number) => void
  onCopy: (item: ClipboardItem) => void
  onDelete: (id: number) => void
  onAddToSnippets?: (item: ClipboardItem) => void
}) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [showActions, setShowActions] = useState(false)

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isDeleting) {
      setIsDeleting(true)
      onDelete(item.id)
    }
  }, [item.id, isDeleting, onDelete])

  return (
    <li
      data-id={item.id}
      className={`relative px-4 py-3 cursor-pointer transition-all duration-150 fade-in ${isSelected ? 'selected-pulse' : ''} ${isDeleting ? 'opacity-50' : ''}`}
      style={{ backgroundColor: isSelected ? colors.selected : 'transparent' }}
      onClick={() => !isDeleting && onSelect(item.id)}
      onDoubleClick={() => !isDeleting && onCopy(item)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Content area */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span
            className={`text-sm flex-shrink-0 mt-0.5 ${isSelected ? 'opacity-90' : ''}`}
            style={{ color: isSelected ? colors.text : colors.textMuted }}
          >
            {item.item_type === 'text' ? <IconDocument /> : <IconImage />}
          </span>
          <div className="flex-1 min-w-0">
            {item.item_type === 'text' ? (
              <>
                <p className="text-sm truncate" style={{ color: colors.text }}>
                  {formatContent(item.content, item.item_type, contentTruncateLength)}
                </p>
                {isSelected && (
                  <p className="text-xs mt-1.5 line-clamp-2 opacity-70" style={{ color: colors.text }}>
                    {getPreview(item.content, 200)}
                  </p>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-xs" style={{ color: colors.textMuted }}>Image</p>
                {imageCache[item.content] ? (
                  <img
                    src={imageCache[item.content]}
                    alt="Clipboard image"
                    className="object-contain rounded border"
                    style={{
                      borderColor: colors.border,
                      maxWidth: `${imagePreviewMaxWidth}px`,
                      maxHeight: `${imagePreviewMaxHeight}px`
                    }}
                  />
                ) : (
                  <span className="text-xs" style={{ color: colors.textMuted }}>Loading...</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Metadata area */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Action buttons */}
          {showActions && !isDeleting && (
            <>
              {/* Add to snippets button - only for text items */}
              {item.item_type === 'text' && onAddToSnippets && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAddToSnippets(item); }}
                  className="p-1 rounded hover:bg-yellow-500/20 transition-colors"
                  style={{ color: '#eab308' }}
                  title="Add to Quick Commands"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </button>
              )}
              {/* Delete button */}
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
          {/* AI search similarity score */}
          {semanticScore !== undefined && (
            <span
              className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{
                backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.15)',
                color: isSelected ? '#fff' : colors.accent
              }}
              title={`Semantic similarity: ${formatScore(semanticScore)}`}
            >
              {formatScore(semanticScore)}
            </span>
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
            {formatTime(item.created_at)}
          </span>
        </div>
      </div>
    </li>
  )
})
