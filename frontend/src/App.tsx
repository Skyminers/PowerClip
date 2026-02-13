import { useState, useEffect, useCallback, useRef, forwardRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { ClipboardItem } from './types'
import {
  HISTORY_LIMIT,
  PREVIEW_MAX_LENGTH,
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

function getPreview(content: string): string {
  return content.length > PREVIEW_MAX_LENGTH
    ? content.slice(0, PREVIEW_MAX_LENGTH) + '...'
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
      className="flex items-center gap-3 px-4 py-3"
      style={{ backgroundColor: colors.bgSecondary }}
      onMouseDown={handleDragStart}
      data-tauri-drag-region
    >
      {children}
    </div>
  )
}

const SearchBar = forwardRef(function SearchBar({
  value,
  onChange,
  onKeyDown
}: {
  value: string
  onChange: (value: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
}, ref: React.ForwardedRef<HTMLInputElement>) {
  return (
    <>
      <svg className="w-4 h-4 flex-shrink-0" style={{ color: colors.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="搜索..."
        className="flex-1 bg-transparent text-sm outline-none placeholder-gray-500 no-drag"
        style={{ color: colors.text }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="no-drag p-1 rounded hover:bg-gray-700 transition-colors"
          style={{ color: colors.textMuted }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </>
  )
})

function ClipboardListItem({
  item,
  index,
  isSelected,
  imageCache,
  onSelect,
  onCopy
}: {
  item: ClipboardItem
  index: number
  isSelected: boolean
  imageCache: ImageCache
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
                    {getPreview(item.content)}
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
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [imageCache, setImageCache] = useState<ImageCache>({})
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemsRef = useRef<ClipboardItem[]>([])
  const isDarwin = navigator.platform.toLowerCase().includes('mac')

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
      const result = await invoke<ClipboardItem[]>('get_history', { limit: HISTORY_LIMIT })
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
  }, [])

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
        const result = await invoke<ClipboardItem[]>('get_history', { limit: HISTORY_LIMIT })

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
  }, [])

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
      case 'Escape':
        e.preventDefault()
        handleNavigation('close')
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
  }, [handleNavigation, handleNumberKey])

  // Keyboard handler for search input
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
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
      case 'Escape':
        e.preventDefault()
        handleNavigation('close')
        break
    }
  }, [handleNavigation])

  return (
    <div className="window-wrapper w-full h-full flex flex-col text-white relative">
      <WindowDragHandler>
        <SearchBar
          ref={inputRef}
          value={searchQuery}
          onChange={setSearchQuery}
          onKeyDown={handleInputKeyDown}
        />
      </WindowDragHandler>

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
