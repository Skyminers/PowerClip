/**
 * Clipboard list item component
 * Apple-inspired design: clean, clear, with subtle interactions
 */

import { memo, useCallback, forwardRef } from 'react'
import { FileText, Image, File, BookmarkPlus, Trash2, Pin } from 'lucide-react'
import type { ClipboardItem, ImageCache } from '../types'
import { formatContent, formatTime } from '../utils/helpers'
import { cn } from '@/lib/utils'

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
  listIndex?: number
  onSelect: (id: number) => void
  onCopy: (item: ClipboardItem) => void
  onDelete: (id: number) => void
  onToggleFavorite?: (id: number) => void
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
  listIndex,
  onDelete,
  onToggleFavorite,
  onAddToSnippets,
  style,
  'data-index': dataIndex
}, ref) {
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(item.id)
  }, [item.id, onDelete])

  const handleBookmark = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onAddToSnippets?.(item)
  }, [item, onAddToSnippets])

  const handleToggleFavorite = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleFavorite?.(item.id)
  }, [item.id, onToggleFavorite])

  const isFavorited = item.is_favorited ?? false

  const isImage = item.item_type === 'image'
  const isFile = item.item_type === 'file'
  const isText = item.item_type === 'text'

  const itemHeight = isImage ? IMAGE_ITEM_HEIGHT : TEXT_ITEM_HEIGHT
  // Cap image preview height to fit within item height with vertical padding
  const effectiveImageMaxHeight = Math.min(imagePreviewMaxHeight, itemHeight - 16)
  const ItemIcon = isImage ? Image : isFile ? File : FileText

  return (
    <li
      ref={ref}
      data-id={item.id}
      data-index={dataIndex}
      className={cn(
        "group cursor-pointer transition-colors duration-150",
        isSelected && "selected-indicator"
      )}
      style={{
        backgroundColor: isSelected ? 'var(--selected)' : 'transparent',
        height: itemHeight,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        overflow: 'hidden',
        ...style
      }}
      onClick={() => onSelect(item.id)}
      onDoubleClick={() => onCopy(item)}
    >
      {/* Type icon - subtle accent, with pin indicator for favorites */}
      {/* Shows number badge (1-9) for quick-paste on first 9 items */}
      <div style={{
        width: 20,
        height: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        opacity: isSelected ? 1 : 0.6,
        transition: 'opacity 0.15s ease',
        position: 'relative'
      }}>
        {listIndex !== undefined && listIndex < 9 ? (
          <span
            style={{
              fontSize: 10,
              fontFamily: 'monospace',
              fontWeight: 600,
              width: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
              backgroundColor: isSelected ? 'rgba(137, 180, 250, 0.25)' : 'rgba(255,255,255,0.08)',
              color: isSelected ? 'var(--accent)' : 'var(--muted-foreground)',
            }}
          >
            {listIndex + 1}
          </span>
        ) : (
          <ItemIcon
            className="w-4 h-4"
            style={{
              color: isFavorited ? 'var(--accent)' : isSelected ? 'var(--foreground)' : 'var(--muted-foreground)',
              transition: 'color 0.15s ease'
            }}
          />
        )}
        {isFavorited && (
          <Pin
            className="w-2 h-2"
            style={{
              position: 'absolute',
              top: -2,
              right: -4,
              color: 'var(--accent)',
              fill: 'var(--accent)',
            }}
          />
        )}
      </div>

      {/* Content - flexible, takes remaining space */}
      <div style={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2
      }}>
        {isImage ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 12,
              color: 'var(--muted-foreground)',
              flexShrink: 0
            }}>
              Image
            </span>
            {imageCache[item.content] ? (
              <img
                src={imageCache[item.content]}
                alt=""
                style={{
                  maxWidth: imagePreviewMaxWidth,
                  maxHeight: effectiveImageMaxHeight,
                  objectFit: 'contain',
                  borderRadius: 4,
                  flexShrink: 0
                }}
              />
            ) : (
              <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>...</span>
            )}
          </div>
        ) : isFile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{
              fontSize: 12,
              color: 'var(--muted-foreground)',
              flexShrink: 0
            }}>
              File
            </span>
            <span style={{
              fontSize: 14,
              color: 'var(--foreground)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {formatContent(item.content, item.item_type, contentTruncateLength)}
            </span>
          </div>
        ) : (
          <span style={{
            fontSize: 14,
            color: 'var(--foreground)',
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {formatContent(item.content, item.item_type, contentTruncateLength)}
          </span>
        )}
      </div>

      {/* Right side: score + actions + time (time on far right) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginLeft: 12,
        flexShrink: 0
      }}>
        {/* Score badge - subtle */}
        {semanticScore !== undefined && (
          <span style={{
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--accent)',
            padding: '2px 6px',
            borderRadius: 4,
            backgroundColor: 'rgba(137, 180, 250, 0.15)'
          }}>
            {formatScore(semanticScore)}
          </span>
        )}

        {/* Actions - appear on hover/selection, before time */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          opacity: isSelected ? 1 : 0,
          transition: 'opacity 0.15s ease'
        }}
        className="group-hover:opacity-100"
        >
          {/* Pin/favorite toggle */}
              {onToggleFavorite && (
                <button
                  onClick={handleToggleFavorite}
                  style={{
                    width: 28,
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 6,
                    border: 'none',
                    background: isFavorited ? 'rgba(137, 180, 250, 0.15)' : 'transparent',
                    color: isFavorited ? 'var(--accent)' : 'var(--muted-foreground)',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease, color 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(137, 180, 250, 0.2)'
                    e.currentTarget.style.color = 'var(--accent)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isFavorited ? 'rgba(137, 180, 250, 0.15)' : 'transparent'
                    e.currentTarget.style.color = isFavorited ? 'var(--accent)' : 'var(--muted-foreground)'
                  }}
                  title={isFavorited ? 'Unpin' : 'Pin'}
                >
                  <Pin className="w-3.5 h-3.5" style={isFavorited ? { fill: 'currentColor' } : undefined} />
                </button>
              )}

          {/* Bookmark button - only for text */}
              {isText && onAddToSnippets && (
                <button
                  onClick={handleBookmark}
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
                    e.currentTarget.style.backgroundColor = 'rgba(251, 191, 36, 0.15)'
                    e.currentTarget.style.color = '#fbbf24'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = 'var(--muted-foreground)'
                  }}
                  title="Add to Quick Commands"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                </button>
              )}

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

        {/* Time - compact, on far right */}
        <span style={{
          fontSize: 12,
          color: 'var(--muted-foreground)',
          textAlign: 'right',
          minWidth: 60,
          flexShrink: 0
        }}>
          {formatTime(item.created_at)}
        </span>
      </div>
    </li>
  )
}))
