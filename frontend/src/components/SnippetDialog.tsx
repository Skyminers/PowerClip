/**
 * Snippet Dialog component - Used for both adding and editing snippets
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
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          {/* Content input */}
          <div className="py-3">
            <label className="block text-xs mb-2 text-muted-foreground">
              Content
            </label>
            <Textarea
              ref={contentRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Enter command or text..."
              rows={4}
              className="font-mono"
            />
          </div>

          {/* Alias input */}
          <div className="pb-3">
            <label className="block text-xs mb-2 text-muted-foreground">
              Alias (optional)
            </label>
            <Input
              value={alias}
              onChange={e => setAlias(e.target.value)}
              placeholder="e.g., Docker bash"
            />
            <p className="text-xs mt-1.5 text-muted-foreground">
              A short name to help you identify this command
            </p>
          </div>

          <DialogFooter className="gap-2">
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
