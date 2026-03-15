/**
 * Snippet Dialog component - Used for both adding and editing snippets
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { Snippet } from '../types'
import { theme } from '../theme'

const colors = theme.colors

interface SnippetDialogProps {
  mode: 'add' | 'edit'
  snippet?: Snippet  // Required for edit mode
  initialContent?: string  // Optional for add mode
  onConfirm: (content: string, alias: string | null) => void
  onCancel: () => void
}

export function SnippetDialog({
  mode,
  snippet,
  initialContent = '',
  onConfirm,
  onCancel
}: SnippetDialogProps) {
  const [content, setContent] = useState(snippet?.content || initialContent || '')
  const [alias, setAlias] = useState(snippet?.alias || '')
  const contentRef = useRef<HTMLTextAreaElement>(null)

  // Focus content input on mount
  useEffect(() => {
    contentRef.current?.focus()
  }, [])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmedContent = content.trim()
    if (!trimmedContent) return
    onConfirm(trimmedContent, alias.trim() || null)
  }, [content, alias, onConfirm])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
    // Ctrl/Cmd + Enter to submit
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      const trimmedContent = content.trim()
      if (trimmedContent) {
        onConfirm(trimmedContent, alias.trim() || null)
      }
    }
  }, [content, alias, onConfirm, onCancel])

  const title = mode === 'add' ? 'Add Quick Command' : 'Edit Quick Command'
  const confirmText = mode === 'add' ? 'Add' : 'Save'

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={onCancel}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div
        className="rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden dialog-animate"
        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
        onClick={e => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="px-4 py-3 border-b" style={{ borderColor: colors.border }}>
            <h3 className="text-sm font-medium" style={{ color: colors.text }}>
              {title}
            </h3>
          </div>

          {/* Content input */}
          <div className="px-4 py-3">
            <label className="block text-xs mb-2" style={{ color: colors.textMuted }}>
              Content
            </label>
            <textarea
              ref={contentRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Enter command or text..."
              rows={4}
              className="w-full px-3 py-2 rounded text-sm outline-none resize-none font-mono"
              style={{
                backgroundColor: colors.bg,
                color: colors.text,
                border: `1px solid ${colors.border}`
              }}
            />
          </div>

          {/* Alias input */}
          <div className="px-4 py-3">
            <label className="block text-xs mb-2" style={{ color: colors.textMuted }}>
              Alias (optional)
            </label>
            <input
              type="text"
              value={alias}
              onChange={e => setAlias(e.target.value)}
              placeholder="e.g., Docker bash"
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{
                backgroundColor: colors.bg,
                color: colors.text,
                border: `1px solid ${colors.border}`
              }}
            />
            <p className="text-xs mt-1.5" style={{ color: colors.textMuted }}>
              A short name to help you identify this command
            </p>
          </div>

          {/* Buttons */}
          <div className="px-4 py-3 flex justify-end gap-2 border-t" style={{ borderColor: colors.border }}>
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded text-sm transition-colors hover:bg-white/10"
              style={{ color: colors.textMuted }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!content.trim()}
              className="px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: colors.accent,
                color: '#fff'
              }}
            >
              {confirmText}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
