/**
 * Add Snippet Dialog component
 * Apple-inspired design with clean visuals
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { ClipboardItem } from '../types'
import { getPreview } from '../utils/helpers'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add to Quick Commands</DialogTitle>
          </DialogHeader>

          {/* Content preview */}
          <div className="px-4 py-4 space-y-2">
            <label
              className="text-xs font-medium"
              style={{ color: 'var(--muted-foreground)' }}
            >
              Content
            </label>
            <div
              className="text-sm p-3 rounded-md font-mono max-h-24 overflow-y-auto scrollbar-thin"
              style={{
                backgroundColor: 'var(--muted)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)'
              }}
            >
              {getPreview(item.content, 200)}
            </div>
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
              ref={inputRef}
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
            <Button type="submit">Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
