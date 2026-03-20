/**
 * Add Snippet Dialog component
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
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add to Quick Commands</DialogTitle>
          </DialogHeader>

          {/* Content preview */}
          <div className="py-3">
            <label className="block text-xs mb-2 text-muted-foreground">
              Content
            </label>
            <div className="text-sm p-3 rounded-md bg-background font-mono max-h-24 overflow-y-auto text-foreground">
              {getPreview(item.content, 200)}
            </div>
          </div>

          {/* Alias input */}
          <div className="pb-3">
            <label className="block text-xs mb-2 text-muted-foreground">
              Alias (optional)
            </label>
            <Input
              ref={inputRef}
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
            <Button type="submit">
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
