/**
 * Clipboard list item component
 * Compact layout with buttons and time grouped together
 */

import { memo, useState, useCallback, forwardRef } from 'react'
import { FileText, Image, File, BookmarkPlus, Trash2 } from 'lucide-react'
import type { ClipboardItem, ImageCache } from '../types'
import { formatContent, formatTime } from '../utils/helpers'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export const TEXT_ITEM_HEIGHT = 48
export const IMAGE_ITEM_HEIGHT = 80
export const FILE_ITEM_HEIGHT = 48

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

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isDeleting) {
      setIsDeleting(true)
      onDelete(item.id)
    }
  }, [item.id, isDeleting, onDelete])

  const handleBookmark = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onAddToSnippets?.(item)
  }, [item, onAddToSnippets])

  const isImage = item.item_type === 'image'
  const isFile = item.item_type === 'file'
  const isText = item.item_type === 'text'

  const itemHeight = isImage ? IMAGE_ITEM_HEIGHT : TEXT_ITEM_HEIGHT
  const ItemIcon = isImage ? Image : isFile ? File : FileText

  return (
    <li
      ref={ref}
      data-id={item.id}
      data-index={dataIndex}
      className={cn(
        "px-4 cursor-pointer",
        isSelected && "selected-indicator",
        isDeleting && "deleting"
      )}
      style={{
        backgroundColor: isSelected ? 'var(--selected)' : 'transparent',
        height: itemHeight,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        ...style
      }}
      onClick={() => !isDeleting && onSelect(item.id)}
      onDoubleClick={() => !isDeleting && onCopy(item)}
    >
      {/* Type icon - fixed 16px */}
      <ItemIcon
        className="w-4 h-4 flex-shrink-0"
        style={{ color: isSelected ? 'var(--foreground)' : 'var(--muted-foreground)' }}
      />

      {/* Content - flexible, takes remaining space */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {isImage ? (
          <div className="flex items-center gap-2">
            <span className="text-xs shrink-0" style={{ color: 'var(--muted-foreground)' }}>Image</span>
            {imageCache[item.content] ? (
              <img
                src={imageCache[item.content]}
                alt=""
                className="object-contain rounded shrink-0"
                style={{
                  maxWidth: imagePreviewMaxWidth,
                  maxHeight: imagePreviewMaxHeight
                }}
              />
            ) : (
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>...</span>
            )}
          </div>
        ) : isFile ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs shrink-0" style={{ color: 'var(--muted-foreground)' }}>File</span>
            <span className="text-sm truncate" style={{ color: 'var(--foreground)' }}>
              {formatContent(item.content, item.item_type, contentTruncateLength)}
            </span>
          </div>
        ) : (
          <span className="text-sm truncate block" style={{ color: 'var(--foreground)' }}>
            {formatContent(item.content, item.item_type, contentTruncateLength)}
          </span>
        )}
      </div>

      {/* Right side: actions + metadata in a compact group */}
      <div className="flex items-center shrink-0" style={{ gap: '2px' }}>
        {/* Bookmark button - fixed slot */}
        <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!isDeleting && isText && onAddToSnippets && (
            <button
              onClick={handleBookmark}
              className="rounded hover:bg-amber-500/20 transition-colors"
              style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)' }}
              title="Add to Quick Commands"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
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

        {/* Score badge */}
        {semanticScore !== undefined && (
          <Badge variant="score" style={{ marginLeft: 4, marginRight: 4 }}>
            {formatScore(semanticScore)}
          </Badge>
        )}

        {/* Time - compact, right aligned */}
        <span
          className="text-xs shrink-0"
          style={{
            minWidth: 70,
            textAlign: 'right',
            color: 'var(--muted-foreground)'
          }}
        >
          {formatTime(item.created_at)}
        </span>
      </div>
    </li>
  )
}))
