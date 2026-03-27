/**
 * Snippet Dialog component - Used for both adding and editing snippets
 * Apple-inspired design with clean visuals
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { Snippet } from '../types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

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

  const title = mode === 'add' ? 'Add Quick Command' : 'Edit Quick Command'
  const confirmText = mode === 'add' ? 'Add' : 'Save'

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          {/* Content input */}
          <div className="px-4 py-4 space-y-2">
            <label
              className="text-xs font-medium"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Content
            </label>
            <Textarea
              ref={contentRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Enter command or text..."
              rows={4}
              className="font-mono resize-none"
            />
          </div>

          {/* Alias input */}
          <div className="px-4 pb-4 space-y-2">
            <label
              className="text-xs font-medium"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Alias (optional)
            </label>
            <Input
              value={alias}
              onChange={e => setAlias(e.target.value)}
              placeholder="e.g., Docker bash"
            />
            <p
              className="text-xs"
              style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}
            >
              A short name to help you identify this command
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!content.trim()}
            >
              {confirmText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
