/**
 * Extension selector component - Shows extension list after pressing Tab
 * Apple-inspired design with subtle interactions
 *
 * Interaction rules:
 * - ArrowUp/ArrowDown: Navigate
 * - Enter: Execute selected extension
 * - Esc / Tab: Close extension list, return to main UI
 * - Click background: Close
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Loader2 } from 'lucide-react'
import type { Extension, ClipboardItem } from '../types'
import { logger } from '../utils/logger'
import { cn } from '@/lib/utils'

export function ExtensionSelector({
  extensions,
  selectedItem,
  onClose,
  onCloseWindow,
}: {
  extensions: Extension[]
  selectedItem: ClipboardItem | null
  onClose: () => void
  onCloseWindow: () => void
}) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [running, setRunning] = useState(false)
  const [runningIndex, setRunningIndex] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const runExtension = useCallback(async (ext: Extension, index: number) => {
    if (!selectedItem || running) return
    setRunning(true)
    setRunningIndex(index)

    try {
      logger.info('Extension', `Running "${ext.name}" on item ${selectedItem.id}`)
      const output = await invoke<string>('run_extension', {
        command: ext.command,
        content: selectedItem.content,
        timeout: ext.timeout,
      })

      // If the extension produced output, copy it to clipboard
      if (output.length > 0) {
        await invoke('copy_to_clipboard', {
          item: { ...selectedItem, content: output },
        })
        logger.info('Extension', `Output copied to clipboard (${output.length} bytes)`)
      }

      if (ext.close_on_success) {
        onCloseWindow()
      } else {
        onClose()
      }
    } catch (error) {
      logger.error('Extension', `Failed to run "${ext.name}": ${error}`)
      onClose()
    } finally {
      setRunning(false)
      setRunningIndex(null)
    }
  }, [selectedItem, running, onClose, onCloseWindow])

  // Capture all keyboard events at the window level to prevent them from reaching the main UI
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Always prevent default for keys we handle, to avoid triggering main UI
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          e.stopPropagation()
          if (!running) setSelectedIndex(i => Math.max(0, i - 1))
          break
        case 'ArrowDown':
          e.preventDefault()
          e.stopPropagation()
          if (!running) setSelectedIndex(i => Math.min(extensions.length - 1, i + 1))
          break
        case 'Enter':
          e.preventDefault()
          e.stopPropagation()
          if (!running && extensions[selectedIndex]) {
            runExtension(extensions[selectedIndex], selectedIndex)
          }
          break
        case 'Escape':
        case 'Tab':
          e.preventDefault()
          e.stopPropagation()
          if (!running) onClose()
          break
        default:
          // Swallow all other keys while extension selector is open
          e.preventDefault()
          e.stopPropagation()
          break
      }
    }

    // Use capture phase to intercept before React handlers
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [extensions, selectedIndex, running, runExtension, onClose])

  // Auto-scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.querySelector(`[data-ext-index="${selectedIndex}"]`)
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)'
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !running) onClose()
      }}
    >
      <div
        className="rounded-xl overflow-hidden"
        style={{
          width: '320px',
          maxHeight: '70vh',
          backgroundColor: 'var(--popover)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* Header */}
        <div
          className="px-4 py-3 text-sm font-semibold"
          style={{
            borderBottom: '1px solid var(--border)',
            color: 'var(--foreground)'
          }}
        >
          {running ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--accent)' }} />
              Running...
            </span>
          ) : (
            'Select Extension'
          )}
        </div>

        {/* Extension list */}
        <div ref={listRef} className="overflow-y-auto scrollbar-thin">
          {extensions.map((ext, index) => {
            const isSelected = index === selectedIndex
            const isRunning = running && runningIndex === index

            return (
              <div
                key={index}
                data-ext-index={index}
                className={cn(
                  "relative px-4 py-3 cursor-pointer transition-all duration-150",
                  isSelected && "selected-indicator"
                )}
                style={{
                  backgroundColor: isSelected ? 'var(--selected)' : 'transparent'
                }}
                onMouseEnter={() => !running && setSelectedIndex(index)}
                onClick={() => !running && runExtension(ext, index)}
              >
                {/* Active indicator - left accent bar */}
                {isSelected && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                    style={{ backgroundColor: 'var(--accent)' }}
                  />
                )}

                <div
                  className="font-medium text-sm"
                  style={{ color: 'var(--foreground)' }}
                >
                  {ext.name}
                  {isRunning && (
                    <Loader2
                      className="w-3 h-3 animate-spin inline-block ml-2"
                      style={{ color: 'var(--accent)' }}
                    />
                  )}
                </div>
                <div
                  className="text-xs mt-0.5 truncate"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  {ext.command}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div
          className="px-4 py-2.5 text-xs"
          style={{
            borderTop: '1px solid var(--border)',
            color: 'var(--muted-foreground)'
          }}
        >
          ↑↓ Navigate · Enter Execute · Esc/Tab Cancel
        </div>
      </div>
    </div>
  )
}
