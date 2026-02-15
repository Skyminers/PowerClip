import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { ClipboardItem, Settings } from './types'
import {
  CONTENT_TRUNCATE_LENGTH,
} from './constants'
import { theme } from './theme'

// Type aliases for convenience
const colors = theme.colors
type ImageCache = Record<string, string>

// ============== Logger ==============
const logger = {
  debug: (module: string, message: string) => {
    (window as any).powerclipLogger?.debug(module, message)
  },
  info: (module: string, message: string) => {
    (window as any).powerclipLogger?.info(module, message)
  },
  warning: (module: string, message: string) => {
    (window as any).powerclipLogger?.warning(module, message)
  },
  error: (module: string, message: string) => {
    (window as any).powerclipLogger?.error(module, message)
  },
}

// ============== Helper Functions ==============
function formatTime(createdAt: string): string {
  try {
    const date = new Date(createdAt)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (minutes < 1440) return `${Math.floor(minutes / 60)}小时前`
    return date.toLocaleDateString('zh-CN')
  } catch {
    return createdAt
  }
}

function formatContent(content: string, type: string): string {
  if (type === 'text') {
    const text = content.replace(/\n/g, ' ')
    return text.length > CONTENT_TRUNCATE_LENGTH
      ? text.slice(0, CONTENT_TRUNCATE_LENGTH) + '...'
      : text
  }
  return `[图片] ${content.slice(0, 12)}...`
}

function getPreview(content: string, maxLength: number = 200): string {
  return content.length > maxLength
    ? content.slice(0, maxLength) + '...'
    : content
}

// ============== Components ==============
// Resize handle component
function ResizeHandle() {
  const handleMouseDown = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      // Get current window state
      const currentState = await invoke<{ width: number; height: number; x: number; y: number }>('get_window_state')

      const startX = e.clientX
      const startY = e.clientY
      const startWidth = currentState.width
      const startHeight = currentState.height

      const onMouseMove = async (moveEvent: MouseEvent) => {
        const newWidth = startWidth + (moveEvent.clientX - startX)
        const newHeight = startHeight + (moveEvent.clientY - startY)

        // Clamp to min/max dimensions
        const minWidth = 300
        const maxWidth = 800
        const minHeight = 200
        const maxHeight = 600

        const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))
        const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight))

        await invoke('resize_window', { width: clampedWidth, height: clampedHeight })
      }

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        // Save window state after resize
        invoke('save_window_state').catch(console.error)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    } catch (error) {
      console.error('Failed to start resize:', error)
    }
  }

  return (
    <div
      className="resize-handle"
      onMouseDown={handleMouseDown}
      title="拖拽调整大小"
    />
  )
}

// Window drag handler - entire window is draggable
function WindowDragHandler({ children }: { children: React.ReactNode }) {
  const handleDragStart = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    // Don't drag on interactive elements or resize handle
    if (
      target.closest('.resize-handle') ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('input')
    ) {
      return
    }
    try {
      const win = getCurrentWindow()
      await win.startDragging()
    } catch (error) {
      console.error('Failed to start dragging:', error)
    }
  }

  return (
    <div
      onMouseDown={handleDragStart}
      data-tauri-drag-region
    >
      {children}
    </div>
  )
}

function ClipboardListItem({
  item,
  index,
  isSelected,
  imageCache,
  previewMaxLength,
  onSelect,
  onCopy
}: {
  item: ClipboardItem
  index: number
  isSelected: boolean
  imageCache: ImageCache
  previewMaxLength: number
  onSelect: (id: number) => void
  onCopy: (item: ClipboardItem) => void
}) {
  const isDarwin = navigator.platform.toLowerCase().includes('mac')

  return (
    <li
      key={item.id}
      data-id={item.id}
      className={`relative px-4 py-3 cursor-pointer transition-all duration-150 fade-in ${
        isSelected ? 'selected-pulse' : ''
      }`}
      style={{ backgroundColor: isSelected ? colors.selected : 'transparent' }}
      onClick={() => onSelect(item.id)}
      onDoubleClick={() => onCopy(item)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span
            className={`text-sm flex-shrink-0 mt-0.5 ${isSelected ? 'opacity-90' : ''}`}
            style={{ color: isSelected ? colors.text : colors.textMuted }}
          >
            {item.item_type === 'text' ? (
              <IconDocument />
            ) : (
              <IconImage />
            )}
          </span>
          <div className="flex-1 min-w-0">
            {item.item_type === 'text' ? (
              <>
                <p className="text-sm truncate" style={{ color: colors.text }}>
                  {formatContent(item.content, item.item_type)}
                </p>
                {isSelected && (
                  <p className="text-xs mt-1.5 line-clamp-2 opacity-70" style={{ color: colors.text }}>
                    {getPreview(item.content, previewMaxLength)}
                  </p>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-xs" style={{ color: colors.textMuted }}>图片</p>
                {imageCache[item.content] ? (
                  <img
                    src={imageCache[item.content]}
                    alt="Clipboard image"
                    className="max-w-[120px] max-h-[80px] object-contain rounded border"
                    style={{ borderColor: colors.border }}
                  />
                ) : (
                  <span className="text-xs" style={{ color: colors.textMuted }}>加载中...</span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {index < 9 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: isSelected ? 'rgba(255,255,255,0.15)' : colors.bgSecondary,
                color: isSelected ? colors.text : colors.textMuted
              }}
            >
              {isDarwin ? '⌘' : 'Ctrl'}{index + 1}
            </span>
          )}
          <span className="text-xs" style={{ color: colors.textMuted }}>
            {formatTime(item.created_at)}
          </span>
        </div>
      </div>
    </li>
  )
}

function IconDocument() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function IconImage() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function EmptyState({ hasSearchQuery }: { hasSearchQuery: boolean }) {
  return (
    <li className="px-4 py-16 text-center empty-state">
      <div className="flex flex-col items-center gap-3" style={{ color: colors.textMuted }}>
        <svg className="w-12 h-12 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <span className="text-sm">
          {hasSearchQuery ? '未找到匹配的结果' : '暂无剪贴板历史'}
        </span>
        <span className="text-xs opacity-50">复制内容后会自动记录</span>
      </div>
    </li>
  )
}

function StatusBar({
  totalCount,
  filteredCount,
  hasSearchQuery,
  isDarwin
}: {
  totalCount: number
  filteredCount: number
  hasSearchQuery: boolean
  isDarwin: boolean
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2 text-xs"
      style={{ backgroundColor: colors.bgSecondary }}
    >
      <div className="flex items-center gap-4" style={{ color: colors.textMuted }}>
        <span>{filteredCount} / {totalCount} 条</span>
        {hasSearchQuery && <span style={{ color: colors.accent }}>筛选模式</span>}
      </div>
      <div className="flex items-center gap-4" style={{ color: colors.textMuted }}>
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: colors.bgHover }}>/</kbd>
          搜索
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: colors.bgHover }}>Esc</kbd>
          关闭
        </span>
        <span>{isDarwin ? '⌘⇧V' : 'Ctrl+Shift+V'}</span>
      </div>
    </div>
  )
}

// ============== Main Component ==============
function App() {
  const isDarwin = navigator.platform.toLowerCase().includes('mac')
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [imageCache, setImageCache] = useState<ImageCache>({})
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<Settings>({
    auto_cleanup_enabled: false,
    max_items: 100,
    hotkey_modifiers: isDarwin ? 'Meta+Shift' : 'Control+Shift',
    hotkey_key: 'KeyV',
    display_limit: 50,
    preview_max_length: 200,
    window_opacity: 0.95,
  })
  const [recordingHotkey, setRecordingHotkey] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef<ClipboardItem[]>([])
  const prevDisplayLimitRef = useRef<number>(50)
  const settingsRef = useRef<Settings>(settings)

  // Derived state
  const filteredItems = items.filter(item =>
    item.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Get current selection index
  const getCurrentIndex = useCallback(() => {
    if (selectedId === null) return -1
    return filteredItems.findIndex(item => item.id === selectedId)
  }, [filteredItems, selectedId])

  // Copy item to clipboard (now uses Rust backend with arboard)
  const copyItem = useCallback(async (item: ClipboardItem) => {
    logger.info('App', `Copying item id=${item.id}, type=${item.item_type}`)
    try {
      // Call Rust backend to copy using arboard
      await invoke('copy_to_clipboard', { item })
      logger.info('App', 'Item copied to system clipboard via Rust')

      // Hide window and release focus after copy
      await invoke('hide_window')
      logger.info('App', 'Window hidden after copy')
    } catch (error) {
      logger.error('App', `Failed to copy item: ${error}`)
      console.error('Failed to copy:', error)
    }
  }, [])

  // Fetch history data
  const fetchHistory = useCallback(async () => {
    try {
      logger.info('App', 'Fetching clipboard history...')
      const result = await invoke<ClipboardItem[]>('get_history', { limit: settings.display_limit })
      logger.info('App', `Retrieved ${result.length} items from history`)

      setItems(result)
      itemsRef.current = result

      // Load image data URLs in parallel
      const imageItems = result.filter(
        (item: ClipboardItem) => item.item_type === 'image'
      )
      if (imageItems.length === 0) return

      const newPaths: ImageCache = {}
      const loadPromises = imageItems.map(async (item: ClipboardItem) => {
        try {
          const dataUrl = await invoke<string>('get_image_asset_url', { relativePath: item.content })
          logger.debug('App', `Image loaded: ${item.content}`)
          newPaths[item.content] = dataUrl
        } catch (e) {
          logger.error('App', `Failed to load image: ${item.content}, error: ${e}`)
        }
      })

      await Promise.all(loadPromises)

      if (Object.keys(newPaths).length > 0) {
        setImageCache(prev => ({ ...prev, ...newPaths }))
        logger.info('App', `Loaded ${Object.keys(newPaths).length} image URLs`)
      }
    } catch (error) {
      logger.error('App', `Failed to fetch history: ${error}`)
      console.error('Failed to fetch history:', error)
    }
  }, [settings.display_limit])

  // Initialize data and set default window position if needed
  useEffect(() => {
    fetchHistory()

    // Set default window position on first load (centered, slightly above center)
    const initWindowPosition = async () => {
      try {
        const state = await invoke<{ x: number; y: number; width: number; height: number }>('get_window_state')
        // If window is at default position (0,0) or very close to it, move to screen center
        if (state.x <= 50 && state.y <= 50) {
          const screenWidth = window.screen.width
          const screenHeight = window.screen.height
          const windowWidth = state.width || 450
          const windowHeight = state.height || 400

          // Center horizontally, slightly above center vertically (at 1/3 from top)
          const newX = Math.floor((screenWidth - windowWidth) / 2)
          const newY = Math.floor((screenHeight - windowHeight) / 3)

          // Move window to calculated position
          await invoke('move_window', { x: newX, y: newY })
          logger.info('App', `Window positioned at (${newX}, ${newY})`)
        }
      } catch (e) {
        logger.error('App', `Failed to set window position: ${e}`)
      }
    }

    initWindowPosition()

    // Listen for new clipboard items from backend (via custom DOM event)
    const handleNewItem = (event: Event) => {
      const customEvent = event as CustomEvent<ClipboardItem>
      const newItem = customEvent.detail

      // Add new item to the top of the list
      setItems(prev => [newItem, ...prev.filter(item => item.id !== newItem.id)])
      itemsRef.current = [newItem, ...itemsRef.current.filter(item => item.id !== newItem.id)]

      // Auto-select the new item
      setSelectedId(newItem.id)

      // Load image if new item is an image
      if (newItem.item_type === 'image') {
        invoke<string>('get_image_asset_url', { relativePath: newItem.content })
          .then(dataUrl => {
            setImageCache(prev => ({ ...prev, [newItem.content]: dataUrl }))
          })
          .catch(err => {
            logger.error('App', `Failed to load new image: ${err}`)
          })
      }
    }

    window.addEventListener('powerclip:new-item', handleNewItem)

    return () => {
      window.removeEventListener('powerclip:new-item', handleNewItem)
    }
  }, [])

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const s = await invoke<Settings>('get_settings')
        setSettings(s)
        settingsRef.current = s
        prevDisplayLimitRef.current = s.display_limit
      } catch (err) {
        logger.error('App', `Failed to load settings: ${err}`)
      }
    }
    loadSettings()
  }, [])

  // Notify backend when settings dialog opens/closes
  useEffect(() => {
    // Non-blocking notification to backend
    invoke('set_settings_dialog_open', { open: showSettings })
      .then(() => logger.debug('App', `Backend notified: settings_open=${showSettings}`))
      .catch(err => logger.error('App', `Failed to notify backend: ${err}`))

    // When closing settings, restore focus (non-blocking)
    if (!showSettings) {
      setTimeout(() => {
        inputRef.current?.focus()
        logger.debug('App', 'Focus restored to search input')
      }, 50)
    }
  }, [showSettings])

  // Save settings immediately (no debounce)
  const saveSettings = useCallback(async (newSettings: Settings) => {
    const oldDisplayLimit = prevDisplayLimitRef.current

    // Update local state and ref immediately for responsive UI
    setSettings(newSettings)
    settingsRef.current = newSettings

    try {
      // Save to backend immediately (non-blocking for UI)
      invoke('save_settings', { settings: newSettings })
        .then(() => {
          logger.info('App', 'Settings saved to backend')

          // Refresh history if display_limit changed (also non-blocking)
          if (oldDisplayLimit !== newSettings.display_limit) {
            logger.info('App', 'Display limit changed, refreshing history')
            prevDisplayLimitRef.current = newSettings.display_limit
            return invoke<ClipboardItem[]>('get_history', { limit: newSettings.display_limit })
          }
        })
        .then(result => {
          if (result) {
            setItems(result)
            itemsRef.current = result
            logger.info('App', 'History refreshed')
          }
        })
        .catch(err => {
          logger.error('App', `Failed to save settings: ${err}`)
        })
    } catch (err) {
      logger.error('App', `Error initiating save: ${err}`)
    }
  }, [])

  // Handle hotkey recording
  const handleHotkeyKeyDown = useCallback((e: KeyboardEvent) => {
    if (!recordingHotkey) return
    e.preventDefault()

    // Escape cancels recording
    if (e.key === 'Escape') {
      setRecordingHotkey(false)
      return
    }

    const modifiers: string[] = []
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) {
      if (e.ctrlKey) modifiers.push('Control')
      if (e.metaKey) modifiers.push('Meta')
      if (e.altKey) modifiers.push('Alt')
      if (e.shiftKey) modifiers.push('Shift')
    }

    const key = e.key
    if (key !== 'Control' && key !== 'Meta' && key !== 'Alt' && key !== 'Shift') {
      const keyCode = key.length === 1 ? `Key${key.toUpperCase()}` : key
      const newSettings = {
        ...settings,
        hotkey_modifiers: modifiers.join('+') || 'Meta',
        hotkey_key: keyCode,
      }
      saveSettings(newSettings)
      setRecordingHotkey(false)
    }
  }, [recordingHotkey, settings])

  useEffect(() => {
    if (recordingHotkey) {
      window.addEventListener('keydown', handleHotkeyKeyDown)
      return () => window.removeEventListener('keydown', handleHotkeyKeyDown)
    }
  }, [recordingHotkey, handleHotkeyKeyDown])

  // Auto-focus search input when window opens
  useEffect(() => {
    // Focus search input immediately when component mounts
    setTimeout(() => {
      inputRef.current?.focus()
    }, 50)
  }, [])

  // Listen for window shown event from Rust backend
  useEffect(() => {
    const handleWindowShown = async () => {
      try {
        // 1. Refresh history to get latest data
        const result = await invoke<ClipboardItem[]>('get_history', { limit: settings.display_limit })

        // Update state and ref
        setItems(result)
        itemsRef.current = result

        // 2. Force scroll to top immediately
        if (listRef.current) {
          listRef.current.scrollTop = 0
        }

        // 3. Select the first (latest) item immediately
        if (result.length > 0) {
          setSelectedId(result[0].id)
        }

        // 4. Focus search input
        setTimeout(() => {
          inputRef.current?.focus()
        }, 50)
      } catch (error) {
        console.error('[PowerClip] Error in window shown handler:', error)
      }
    }

    window.addEventListener('powerclip:window-shown', handleWindowShown)

    return () => {
      window.removeEventListener('powerclip:window-shown', handleWindowShown)
    }
  }, [settings.display_limit])

  // Auto-scroll to selected item
  useEffect(() => {
    if (selectedId !== null && listRef.current) {
      const selectedElement = listRef.current.querySelector(`[data-id="${selectedId}"]`)
      if (selectedElement) {
        selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [selectedId])

  // Handle keyboard navigation
  const handleNavigation = useCallback((action: 'up' | 'down' | 'select' | 'close' | 'focusSearch') => {
    const currentIndex = getCurrentIndex()

    switch (action) {
      case 'up':
        if (currentIndex > 0) {
          setSelectedId(filteredItems[currentIndex - 1].id)
        }
        break
      case 'down':
        if (currentIndex < filteredItems.length - 1) {
          setSelectedId(filteredItems[currentIndex + 1].id)
        }
        break
      case 'select':
        if (selectedId !== null) {
          const item = filteredItems.find(i => i.id === selectedId)
          if (item) copyItem(item)
        }
        break
      case 'close':
        setSearchQuery('')
        invoke('hide_window').catch(() => {})
        break
      case 'focusSearch':
        inputRef.current?.focus()
        break
    }
  }, [filteredItems, selectedId, copyItem, getCurrentIndex])

  // Handle quick number keys (1-9)
  const handleNumberKey = useCallback((key: string) => {
    const index = parseInt(key) - 1
    if (filteredItems[index]) {
      copyItem(filteredItems[index])
    }
  }, [filteredItems, copyItem])

  // Keyboard handler for list
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Special handling for Escape key - close settings first if open, then close window
    if (e.key === 'Escape') {
      e.preventDefault()
      if (showSettings) {
        setShowSettings(false)
      } else {
        handleNavigation('close')
      }
      return
    }

    // Disable other keyboard shortcuts when settings dialog is open
    if (showSettings) return

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        handleNavigation('up')
        break
      case 'ArrowDown':
        e.preventDefault()
        handleNavigation('down')
        break
      case 'Enter':
        e.preventDefault()
        handleNavigation('select')
        break
      case '/':
        e.preventDefault()
        handleNavigation('focusSearch')
        break
      default:
        // Handle number keys 1-9
        if (e.key >= '1' && e.key <= '9') {
          handleNumberKey(e.key)
        }
    }
  }, [handleNavigation, handleNumberKey, showSettings])

  // Keyboard handler for search input
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Special handling for Escape key - close settings first if open, then close window
    if (e.key === 'Escape') {
      e.preventDefault()
      if (showSettings) {
        setShowSettings(false)
      } else {
        handleNavigation('close')
      }
      return
    }

    // Disable other keyboard shortcuts when settings dialog is open
    if (showSettings) return

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        handleNavigation('up')
        break
      case 'ArrowDown':
        e.preventDefault()
        handleNavigation('down')
        break
      case 'Enter':
        e.preventDefault()
        handleNavigation('select')
        break
    }
  }, [handleNavigation, showSettings])

  return (
    <div
      className="window-wrapper w-full h-full flex flex-col text-white relative"
      style={{ opacity: settings.window_opacity }}
    >
      <WindowDragHandler>
        <div className="flex items-center gap-2 px-4 py-3" style={{ backgroundColor: colors.bgSecondary }}>
          <svg className="w-4 h-4 flex-shrink-0" style={{ color: colors.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="搜索..."
            className="flex-1 bg-transparent text-sm outline-none placeholder-gray-500 no-drag"
            style={{ color: colors.text }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="no-drag p-1 rounded hover:bg-white/10"
              style={{ color: colors.textMuted }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 rounded hover:bg-white/10 transition-colors flex-shrink-0 no-drag"
            title="设置"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </WindowDragHandler>

      {/* Settings Modal */}
      {showSettings && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onMouseDown={(e) => {
            // Close settings when clicking backdrop
            if (e.target === e.currentTarget) {
              setShowSettings(false)
            }
          }}
        >
          <div
            className="w-96 max-h-[90vh] overflow-y-auto p-4 rounded-lg shadow-xl"
            style={{ backgroundColor: colors.bgSecondary }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">设置</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded hover:bg-white/10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Auto cleanup toggle */}
            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.auto_cleanup_enabled}
                  onChange={(e) => saveSettings({ ...settings, auto_cleanup_enabled: e.target.checked })}
                  className="w-4 h-4 rounded"
                />
                <span>自动清理旧记录</span>
              </label>
            </div>

            {/* Max items */}
            <div className="mb-4">
              <label className="block text-sm mb-1" style={{ color: colors.textMuted }}>
                最大保存条数
              </label>
              <input
                type="number"
                value={settings.max_items}
                onChange={(e) => saveSettings({ ...settings, max_items: parseInt(e.target.value) || 100 })}
                disabled={!settings.auto_cleanup_enabled}
                min={1}
                max={10000}
                className="w-full px-3 py-1.5 rounded bg-white/10 border-none outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            {/* Display limit */}
            <div className="mb-4">
              <label className="block text-sm mb-1" style={{ color: colors.textMuted }}>
                显示历史条数
              </label>
              <input
                type="number"
                value={settings.display_limit}
                onChange={(e) => saveSettings({ ...settings, display_limit: parseInt(e.target.value) || 50 })}
                min={10}
                max={1000}
                className="w-full px-3 py-1.5 rounded bg-white/10 border-none outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Preview max length */}
            <div className="mb-4">
              <label className="block text-sm mb-1" style={{ color: colors.textMuted }}>
                文本预览最大长度
              </label>
              <input
                type="number"
                value={settings.preview_max_length}
                onChange={(e) => saveSettings({ ...settings, preview_max_length: parseInt(e.target.value) || 200 })}
                min={50}
                max={1000}
                className="w-full px-3 py-1.5 rounded bg-white/10 border-none outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Window opacity */}
            <div className="mb-4">
              <label className="block text-sm mb-1" style={{ color: colors.textMuted }}>
                窗口透明度: {Math.round(settings.window_opacity * 100)}%
              </label>
              <input
                type="range"
                value={settings.window_opacity}
                onChange={(e) => saveSettings({ ...settings, window_opacity: parseFloat(e.target.value) })}
                min={0.5}
                max={1.0}
                step={0.05}
                className="w-full"
              />
            </div>

            {/* Hotkey */}
            <div className="mb-4">
              <label className="block text-sm mb-1" style={{ color: colors.textMuted }}>
                唤起窗口快捷键
              </label>
              <button
                onClick={() => setRecordingHotkey(true)}
                className={`w-full px-3 py-1.5 rounded text-sm ${
                  recordingHotkey
                    ? 'bg-blue-500 ring-2 ring-blue-300'
                    : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                {recordingHotkey ? '按下快捷键...' : `${settings.hotkey_modifiers}+${settings.hotkey_key.replace('Key', '')}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <ul
        ref={listRef}
        className="flex-1 overflow-y-auto scrollbar-thin"
        style={{ backgroundColor: colors.bg }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {filteredItems.map((item, index) => (
          <ClipboardListItem
            key={item.id}
            item={item}
            index={index}
            isSelected={selectedId === item.id}
            imageCache={imageCache}
            previewMaxLength={settings.preview_max_length}
            onSelect={setSelectedId}
            onCopy={copyItem}
          />
        ))}

        {filteredItems.length === 0 && (
          <EmptyState hasSearchQuery={searchQuery.length > 0} />
        )}
      </ul>

      <StatusBar
        totalCount={items.length}
        filteredCount={filteredItems.length}
        hasSearchQuery={searchQuery.length > 0}
        isDarwin={isDarwin}
      />

      {/* Resize handle */}
      <ResizeHandle />
    </div>
  )
}

export default App
