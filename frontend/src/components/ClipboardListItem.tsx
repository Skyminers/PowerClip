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
  onSelect,
  onCopy,
  onDelete
}: {
  item: ClipboardItem
  index: number
  isSelected: boolean
  imageCache: ImageCache
  semanticScore?: number  // AI search similarity score (0.0 - 1.0)
  onSelect: (id: number) => void
  onCopy: (item: ClipboardItem) => void
  onDelete: (id: number) => void
}) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

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
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
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
                  {formatContent(item.content, item.item_type)}
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
                    className="max-w-[120px] max-h-[80px] object-contain rounded border"
                    style={{ borderColor: colors.border }}
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
          {/* Delete button */}
          {showDelete && !isDeleting && (
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
