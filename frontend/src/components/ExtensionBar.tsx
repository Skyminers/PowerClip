/**
 * Extension Bar - Inline command bar for running extensions on clipboard items
 *
 * Replaces the old full-screen modal with a lightweight inline bar.
 * Design: appears between the search header and the list, showing extension
 * chips with number shortcuts for instant one-key execution.
 *
 * Interaction:
 * - Number keys (1-9): Instant execution of the corresponding extension
 * - ArrowLeft/Right: Navigate between extensions
 * - Enter: Execute highlighted extension
 * - Esc / Tab: Close the bar
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Loader2, Check, X, Zap } from 'lucide-react'
import type { Extension, ClipboardItem } from '../types'
import { logger } from '../utils/logger'
import { cn } from '@/lib/utils'

type BarState =
  | { kind: 'idle' }
  | { kind: 'running'; index: number }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }

const FEEDBACK_DURATION_MS = 1500

export function ExtensionBar({
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
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [barState, setBarState] = useState<BarState>({ kind: 'idle' })
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isRunning = barState.kind === 'running'

  // Auto-dismiss feedback after a delay
  const showFeedback = useCallback((state: BarState, thenClose: boolean) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setBarState(state)
    feedbackTimer.current = setTimeout(() => {
      if (thenClose) {
        onClose()
      } else {
        setBarState({ kind: 'idle' })
      }
    }, FEEDBACK_DURATION_MS)
  }, [onClose])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    }
  }, [])

  const runExtension = useCallback(async (ext: Extension, index: number) => {
    if (!selectedItem || isRunning) return
    setBarState({ kind: 'running', index })

    try {
      logger.info('Extension', `Running "${ext.name}" on item ${selectedItem.id}`)
      const output = await invoke<string>('run_extension', {
        command: ext.command,
        content: selectedItem.content,
        timeout: ext.timeout,
      })

      if (output.length > 0) {
        await invoke('copy_to_clipboard', {
          item: { ...selectedItem, item_type: 'text', content: output },
        })
        logger.info('Extension', `Output copied to clipboard (${output.length} bytes)`)
      }

      if (ext.close_on_success) {
        onCloseWindow()
      } else {
        const preview = output.length > 0
          ? `Copied: ${output.replace(/\n/g, ' ').slice(0, 40)}${output.length > 40 ? '...' : ''}`
          : `Done`
        showFeedback({ kind: 'success', message: preview }, false)
      }
    } catch (error) {
      const msg = String(error)
      logger.error('Extension', `Failed to run "${ext.name}": ${msg}`)
      const shortMsg = msg.length > 50 ? msg.slice(0, 50) + '...' : msg
      showFeedback({ kind: 'error', message: shortMsg }, false)
    }
  }, [selectedItem, isRunning, onCloseWindow, showFeedback])

  // Keyboard handler (capture phase to intercept before main UI)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // During feedback, any key dismisses
      if (barState.kind === 'success' || barState.kind === 'error') {
        e.preventDefault()
        e.stopPropagation()
        if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
        setBarState({ kind: 'idle' })
        return
      }

      // Number keys 1-9 for instant execution
      const num = parseInt(e.key)
      if (num >= 1 && num <= 9 && num <= extensions.length) {
        e.preventDefault()
        e.stopPropagation()
        if (!isRunning) {
          setHighlightIndex(num - 1)
          runExtension(extensions[num - 1], num - 1)
        }
        return
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          e.stopPropagation()
          if (!isRunning) setHighlightIndex(i => i > 0 ? i - 1 : extensions.length - 1)
          break
        case 'ArrowRight':
          e.preventDefault()
          e.stopPropagation()
          if (!isRunning) setHighlightIndex(i => i < extensions.length - 1 ? i + 1 : 0)
          break
        case 'Enter':
          e.preventDefault()
          e.stopPropagation()
          if (!isRunning && extensions[highlightIndex]) {
            runExtension(extensions[highlightIndex], highlightIndex)
          }
          break
        case 'Escape':
        case 'Tab':
          e.preventDefault()
          e.stopPropagation()
          if (!isRunning) onClose()
          break
        // Let ArrowUp/Down pass through to list navigation
        case 'ArrowUp':
        case 'ArrowDown':
          break
        default:
          // Swallow other keys to prevent typing in search while bar is open
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            e.stopPropagation()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [extensions, highlightIndex, isRunning, barState, runExtension, onClose])

  // Feedback states
  if (barState.kind === 'success') {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 border-b animate-fade-in"
        style={{ backgroundColor: 'rgba(74, 222, 128, 0.08)', borderColor: 'var(--border)' }}
      >
        <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#4ade80' }} />
        <span className="text-xs truncate" style={{ color: '#4ade80' }}>
          {barState.message}
        </span>
      </div>
    )
  }

  if (barState.kind === 'error') {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 border-b animate-fade-in"
        style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: 'var(--border)' }}
      >
        <X className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#ef4444' }} />
        <span className="text-xs truncate" style={{ color: '#ef4444' }}>
          {barState.message}
        </span>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-1 px-3 py-1.5 border-b overflow-x-auto scrollbar-thin animate-fade-in"
      style={{ backgroundColor: 'var(--secondary)', borderColor: 'var(--border)' }}
    >
      {/* Label */}
      <Zap className="w-3 h-3 flex-shrink-0 mr-1" style={{ color: 'var(--accent)', opacity: 0.8 }} />

      {/* Extension chips */}
      {extensions.map((ext, index) => {
        const isHighlighted = index === highlightIndex
        const isThisRunning = barState.kind === 'running' && barState.index === index

        return (
          <button
            key={index}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs whitespace-nowrap transition-all duration-100",
              "hover:bg-white/10 active:scale-[0.97]",
              isHighlighted && "bg-white/12 text-foreground",
              !isHighlighted && "text-muted-foreground"
            )}
            style={isHighlighted ? { boxShadow: 'inset 0 0 0 1px rgba(137, 180, 250, 0.3)' } : undefined}
            onClick={() => {
              if (!isRunning) {
                setHighlightIndex(index)
                runExtension(ext, index)
              }
            }}
            onMouseEnter={() => !isRunning && setHighlightIndex(index)}
            title={ext.command}
          >
            {/* Number shortcut badge */}
            {index < 9 && (
              <span
                className="text-[9px] w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: isHighlighted ? 'rgba(137, 180, 250, 0.2)' : 'rgba(255,255,255,0.06)',
                  color: isHighlighted ? 'var(--accent)' : 'var(--muted-foreground)',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                }}
              >
                {index + 1}
              </span>
            )}

            {/* Extension name or loading */}
            {isThisRunning ? (
              <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent)' }} />
            ) : (
              <span>{ext.name}</span>
            )}
          </button>
        )
      })}

      {/* Dismiss hint */}
      <span className="ml-auto text-[10px] flex-shrink-0 pl-2" style={{ color: 'var(--muted-foreground)', opacity: 0.6 }}>
        Esc
      </span>
    </div>
  )
}
