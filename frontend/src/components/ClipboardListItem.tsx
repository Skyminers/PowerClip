/**
 * Clipboard list item component
 * Fixed height design: text items show one line, image items show label + preview
 */

import { memo, useState, useCallback, forwardRef } from 'react'
import type { ClipboardItem, ImageCache } from '../types'
import { theme } from '../theme'
import { formatContent, formatTime } from '../utils/helpers'
import { MAX_SHORTCUT_INDEX } from '../constants'
import { IconDocument, IconImage } from './icons'

const colors = theme.colors

// Fixed heights for item types
export const TEXT_ITEM_HEIGHT = 48
export const IMAGE_ITEM_HEIGHT = 80

/**
 * Format similarity score as percentage
 */
function formatScore(score: number): string {
  return (score * 100).toFixed(2) + '%'
}

export const ClipboardListItem = memo(forwardRef<HTMLLIElement, {
  item: ClipboardItem
  index: number
  isSelected: boolean
  imageCache: ImageCache
  semanticScore?: number
  contentTruncateLength?: number
  imagePreviewMaxWidth?: number
  imagePreviewMaxHeight?: number
  onSelect: (id: number) => void
  onCopy: (item: ClipboardItem) => void
  onDelete: (id: number) => void
  onAddToSnippets?: (item: ClipboardItem) => void
  style?: React.CSSProperties
  'data-index'?: number
}>(function ClipboardListItem({
  item,
  index,
  isSelected,
  imageCache,
  semanticScore,
  contentTruncateLength = 50,
  imagePreviewMaxWidth = 100,
  imagePreviewMaxHeight = 48,
  onSelect,
  onCopy,
  onDelete,
  onAddToSnippets,
  style,
  'data-index': dataIndex
}, ref) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [showActions, setShowActions] = useState(false)

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isDeleting) {
      setIsDeleting(true)
      onDelete(item.id)
    }
  }, [item.id, isDeleting, onDelete])

  const isImage = item.item_type === 'image'

  return (
    <li
      ref={ref}
      data-id={item.id}
      data-index={dataIndex}
      className={`relative px-4 cursor-pointer ${isSelected ? 'selected-indicator' : ''} ${isDeleting ? 'deleting' : ''}`}
      style={{
        backgroundColor: isSelected ? colors.selected : 'transparent',
        height: isImage ? IMAGE_ITEM_HEIGHT : TEXT_ITEM_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        ...style
      }}
      onClick={() => !isDeleting && onSelect(item.id)}
      onDoubleClick={() => !isDeleting && onCopy(item)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex items-center justify-between gap-3 w-full">
        {/* Content area */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span
            className="text-sm flex-shrink-0"
            style={{ color: isSelected ? colors.text : colors.textMuted }}
          >
            {isImage ? <IconImage /> : <IconDocument />}
          </span>
          <div className="flex-1 min-w-0 flex items-center">
            {isImage ? (
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: colors.textMuted }}>Image</span>
                {imageCache[item.content] ? (
                  <img
                    src={imageCache[item.content]}
                    alt="Preview"
                    className="object-contain rounded"
                    style={{
                      maxWidth: `${imagePreviewMaxWidth}px`,
                      maxHeight: `${imagePreviewMaxHeight}px`
                    }}
                  />
                ) : (
                  <span className="text-xs" style={{ color: colors.textMuted }}>Loading...</span>
                )}
              </div>
            ) : (
              <p className="text-sm truncate" style={{ color: colors.text }}>
                {formatContent(item.content, item.item_type, contentTruncateLength)}
              </p>
            )}
          </div>
        </div>

        {/* Metadata area */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Action buttons */}
          {showActions && !isDeleting && (
            <>
              {item.item_type === 'text' && onAddToSnippets && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAddToSnippets(item); }}
                  className="p-1 rounded hover:bg-yellow-500/20 transition-colors button-press"
                  style={{ color: '#eab308' }}
                  title="Add to Quick Commands"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </button>
              )}
              <button
                onClick={handleDeleteClick}
                className="p-1 rounded hover:bg-red-500/20 transition-colors button-press"
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
}))
