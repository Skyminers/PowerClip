/**
 * Add Snippet Dialog component
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { ClipboardItem } from '../types'
import { theme } from '../theme'
import { getPreview } from '../utils/helpers'

const colors = theme.colors

export function AddSnippetDialog({
  item,
  onConfirm,
  onCancel
}: {
  item: ClipboardItem
  onConfirm: (content: string, alias: string | null) => void
  onCancel: () => void
}) {
  const [alias, setAlias] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    onConfirm(item.content, alias.trim() || null)
  }, [item.content, alias, onConfirm])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={onCancel}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div
        className="rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
        style={{ backgroundColor: colors.bgSecondary, border: `1px solid ${colors.border}` }}
        onClick={e => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="px-4 py-3 border-b" style={{ borderColor: colors.border }}>
            <h3 className="text-sm font-medium" style={{ color: colors.text }}>
              Add to Quick Commands
            </h3>
          </div>

          {/* Content preview */}
          <div className="px-4 py-3">
            <label className="block text-xs mb-2" style={{ color: colors.textMuted }}>
              Content
            </label>
            <div
              className="text-sm p-3 rounded font-mono max-h-24 overflow-y-auto"
              style={{ backgroundColor: colors.bg, color: colors.text }}
            >
              {getPreview(item.content, 200)}
            </div>
          </div>

          {/* Alias input */}
          <div className="px-4 py-3">
            <label className="block text-xs mb-2" style={{ color: colors.textMuted }}>
              Alias (optional)
            </label>
            <input
              ref={inputRef}
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
              className="px-3 py-1.5 rounded text-sm font-medium transition-colors"
              style={{
                backgroundColor: colors.accent,
                color: '#fff'
              }}
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
