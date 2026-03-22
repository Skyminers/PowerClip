/**
 * Clipboard list item component
 * Fixed height design: text items show one line, image items show label + preview
 */

import { memo, useState, useCallback, forwardRef } from 'react'
import { FileText, Image, File, Star, X } from 'lucide-react'
import type { ClipboardItem, ImageCache } from '../types'
import { formatContent, formatTime } from '../utils/helpers'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

// Fixed heights for item types
export const TEXT_ITEM_HEIGHT = 48
export const IMAGE_ITEM_HEIGHT = 80
export const FILE_ITEM_HEIGHT = 48

/**
 * Format similarity score as percentage
 */
function formatScore(score: number): string {
  return (score * 100).toFixed(2) + '%'
}

export const ClipboardListItem = memo(forwardRef<HTMLLIElement, {
  item: ClipboardItem
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
  const isFile = item.item_type === 'file'

  // Calculate item height based on type
  const itemHeight = isImage ? IMAGE_ITEM_HEIGHT : TEXT_ITEM_HEIGHT

  // Get icon based on item type
  const ItemIcon = isImage ? Image : isFile ? File : FileText

  return (
    <li
      ref={ref}
      data-id={item.id}
      data-index={dataIndex}
      className={cn(
        "relative px-4 cursor-pointer",
        isSelected && "selected-indicator selected-animate",
        isDeleting && "deleting"
      )}
      style={{
        backgroundColor: isSelected ? 'var(--selected)' : 'transparent',
        height: itemHeight,
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
          <ItemIcon
            className="w-4 h-4 flex-shrink-0"
            style={{ color: isSelected ? 'var(--foreground)' : 'var(--muted-foreground)' }}
          />
          <div className="flex-1 min-w-0 flex items-center">
            {isImage ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Image</span>
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
                  <span className="text-xs text-muted-foreground">Loading...</span>
                )}
              </div>
            ) : isFile ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">File</span>
                <p className="text-sm truncate text-foreground">
                  {formatContent(item.content, item.item_type, contentTruncateLength)}
                </p>
              </div>
            ) : (
              <p className="text-sm truncate text-foreground">
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
                  <Star className="w-3.5 h-3.5" />
                </button>
              )}
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
          {/* AI search similarity score */}
          {semanticScore !== undefined && (
            <Badge
              variant="score"
              title={`Semantic similarity: ${formatScore(semanticScore)}`}
            >
              {formatScore(semanticScore)}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {formatTime(item.created_at)}
          </span>
        </div>
      </div>
    </li>
  )
}))
