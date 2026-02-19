/**
 * 扩展选择器组件 - 按 Tab 后弹出的扩展列表
 *
 * 交互规则:
 * - ArrowUp/ArrowDown: 导航
 * - Enter: 执行选中的扩展
 * - Esc / Tab: 关闭扩展列表，回到主界面
 * - 点击背景: 关闭
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Extension, ClipboardItem } from '../types'
import { theme } from '../theme'
import { logger } from '../utils/logger'

const colors = theme.colors

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
  const listRef = useRef<HTMLDivElement>(null)

  const runExtension = useCallback(async (ext: Extension) => {
    if (!selectedItem || running) return
    setRunning(true)

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
            runExtension(extensions[selectedIndex])
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
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !running) onClose()
      }}
    >
      <div
        className="w-72 max-h-[70vh] overflow-hidden rounded-lg shadow-xl flex flex-col"
        style={{ backgroundColor: colors.bgSecondary }}
      >
        <div className="px-4 py-3 text-sm font-semibold" style={{ borderBottom: `1px solid ${colors.border}` }}>
          {running ? '执行中...' : '选择扩展'}
        </div>
        <div ref={listRef} className="overflow-y-auto">
          {extensions.map((ext, index) => (
            <div
              key={index}
              data-ext-index={index}
              className="px-4 py-2.5 cursor-pointer text-sm transition-colors"
              style={{
                backgroundColor: index === selectedIndex ? colors.selected : 'transparent',
                color: colors.text,
              }}
              onMouseEnter={() => !running && setSelectedIndex(index)}
              onClick={() => runExtension(ext)}
            >
              <div className="font-medium">{ext.name}</div>
              <div className="text-xs mt-0.5 truncate" style={{ color: colors.textMuted }}>
                {ext.command}
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 text-xs" style={{ color: colors.textMuted, borderTop: `1px solid ${colors.border}` }}>
          ↑↓ 导航 · Enter 执行 · Esc/Tab 取消
        </div>
      </div>
    </div>
  )
}
