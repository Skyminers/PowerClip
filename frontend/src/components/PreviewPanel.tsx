/**
 * Preview Panel - Full content preview for selected clipboard item
 *
 * Shows below the list when Space is held/toggled.
 * Text: scrollable full content with monospace rendering
 * Image: larger image preview
 * File: full list of file paths
 */

import { X } from 'lucide-react'
import type { ClipboardItem, ImageCache } from '../types'

export function PreviewPanel({
  item,
  imageCache,
  onClose,
}: {
  item: ClipboardItem
  imageCache: ImageCache
  onClose: () => void
}) {
  return (
    <div
      className="flex flex-col border-t animate-fade-in"
      style={{
        backgroundColor: 'var(--secondary)',
        borderColor: 'var(--border)',
        maxHeight: 220,
        minHeight: 80,
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted-foreground)', opacity: 0.7 }}>
          Preview
        </span>
        <button
          onClick={onClose}
          className="flex items-center justify-center rounded transition-colors hover:bg-white/10"
          style={{ width: 20, height: 20, color: 'var(--muted-foreground)', border: 'none', background: 'transparent', cursor: 'pointer' }}
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3" style={{ minHeight: 0 }}>
        {item.item_type === 'image' ? (
          <ImagePreview item={item} imageCache={imageCache} />
        ) : item.item_type === 'file' ? (
          <FilePreview content={item.content} />
        ) : (
          <TextPreview content={item.content} />
        )}
      </div>
    </div>
  )
}

function TextPreview({ content }: { content: string }) {
  return (
    <pre
      style={{
        margin: 0,
        fontSize: 12,
        lineHeight: 1.6,
        color: 'var(--foreground)',
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
      }}
    >
      {content}
    </pre>
  )
}

function ImagePreview({ item, imageCache }: { item: ClipboardItem; imageCache: ImageCache }) {
  const src = imageCache[item.content]
  if (!src) {
    return (
      <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Loading image...</span>
    )
  }
  return (
    <img
      src={src}
      alt=""
      style={{
        maxWidth: '100%',
        maxHeight: 160,
        objectFit: 'contain',
        borderRadius: 6,
        display: 'block',
      }}
    />
  )
}

function FilePreview({ content }: { content: string }) {
  let paths: string[] = []
  try {
    paths = JSON.parse(content)
  } catch {
    paths = [content]
  }

  return (
    <div className="flex flex-col gap-1">
      {paths.map((p, i) => (
        <span
          key={i}
          style={{
            fontSize: 12,
            color: 'var(--foreground)',
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            wordBreak: 'break-all',
            lineHeight: 1.5,
          }}
        >
          {p}
        </span>
      ))}
    </div>
  )
}
