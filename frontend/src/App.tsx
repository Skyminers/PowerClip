/**
 * PowerClip - 主应用组件
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { ClipboardItem, Settings, ImageCache, SemanticStatus } from './types'
import { theme } from './theme'
import { MAX_HISTORY_FETCH, FOCUS_DELAY_MS } from './constants'
import { isDarwin } from './utils/platform'
import { useSemanticSearch } from './hooks/useSemanticSearch'

import {
  ResizeHandle,
  WindowDragHandler,
  EmptyState,
  StatusBar,
  ClipboardListItem,
  ExtensionSelector,
  SemanticToggle
} from './components'

const colors = theme.colors

function App() {

  // 状态
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [imageCache, setImageCache] = useState<ImageCache>({})
  const [showExtensions, setShowExtensions] = useState(false)
  const [semanticMode, setSemanticMode] = useState(false)
  const [semanticStatus, setSemanticStatus] = useState<SemanticStatus | null>(null)

  const [settings, setSettings] = useState<Settings>({
    auto_cleanup_enabled: false,
    max_items: 100,
    hotkey_modifiers: isDarwin ? 'Meta+Shift' : 'Control+Shift',
    hotkey_key: 'KeyV',
    window_opacity: 0.95,
    auto_paste_enabled: false,
    extensions: [],
    semantic_search_enabled: false,
  })

  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Refs for global keydown
  const showExtensionsRef = useRef(showExtensions)
  showExtensionsRef.current = showExtensions

  // Semantic search hook
  const { results: semanticResults, loading: semanticLoading, error: semanticError } = useSemanticSearch(
    semanticMode ? searchQuery : '',
    50
  )

  // 派生状态
  const searchLower = useMemo(() => searchQuery.toLowerCase(), [searchQuery])

  // Display items based on search mode
  const filteredItems = useMemo(() => {
    if (semanticMode && semanticResults.length > 0 && searchQuery.length > 0) {
      return semanticResults.map(r => r.item)
    }
    return items.filter(item => item.content.toLowerCase().includes(searchLower))
  }, [items, searchLower, semanticMode, semanticResults, searchQuery])

  // Map item id to semantic score for quick lookup
  const semanticScoreMap = useMemo(() => {
    if (semanticMode && semanticResults.length > 0) {
      return new Map(semanticResults.map(r => [r.item.id, r.score]))
    }
    return new Map<number, number>()
  }, [semanticMode, semanticResults])

  // 复制项目
  const copyItem = useCallback(async (item: ClipboardItem) => {
    try {
      await invoke('copy_to_clipboard', { item })
      await invoke('hide_window')
      if (settings.auto_paste_enabled) {
        await invoke('simulate_paste')
      }
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }, [settings.auto_paste_enabled])

  // 删除项目
  const deleteItem = useCallback(async (itemId: number) => {
    try {
      await invoke('delete_history_item', { itemId })
      // 从列表中移除
      setItems(prev => prev.filter(item => item.id !== itemId))
      // 如果删除的是选中项，清除选中
      if (selectedId === itemId) {
        setSelectedId(null)
      }
    } catch (error) {
      console.error('Failed to delete item:', error)
    }
  }, [selectedId])

  // 加载设置
  const loadSettings = useCallback(() => {
    invoke<Settings>('get_settings')
      .then(s => {
        setSettings(s)
        // Sync semantic enabled state with settings
        if (s.semantic_search_enabled) {
          invoke<SemanticStatus>('get_semantic_status')
            .then(status => setSemanticStatus(status))
            .catch(() => {})
        }
      })
      .catch(e => console.error('[PowerClip] Failed to load settings:', e))
  }, [])

  // Load semantic status
  const loadSemanticStatus = useCallback(() => {
    invoke<SemanticStatus>('get_semantic_status')
      .then(status => setSemanticStatus(status))
      .catch(() => setSemanticStatus(null))
  }, [])

  // Handle semantic mode toggle
  const handleSemanticToggle = useCallback(() => {
    if (semanticStatus?.model_downloaded && settings.semantic_search_enabled) {
      setSemanticMode(prev => !prev)
    }
  }, [semanticStatus, settings.semantic_search_enabled])

  // 全局键盘事件
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showExtensionsRef.current) return

      // Cmd+, 打开配置文件
      if (e.key === ',' && (isDarwin ? e.metaKey : e.ctrlKey)) {
        e.preventDefault()
        invoke('open_settings_file').catch(() => {})
        return
      }

      // Esc: 关闭扩展或隐藏窗口
      if (e.key === 'Escape') {
        e.preventDefault()
        setSearchQuery('')
        invoke('hide_window').catch(() => {})
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // 列表键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showExtensionsRef.current) return

    const idx = filteredItems.findIndex(item => item.id === selectedId)

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        if (idx > 0) setSelectedId(filteredItems[idx - 1].id)
        break
      case 'ArrowDown':
        e.preventDefault()
        if (idx < filteredItems.length - 1) setSelectedId(filteredItems[idx + 1].id)
        break
      case 'Enter':
        e.preventDefault()
        if (selectedId !== null) {
          const item = filteredItems.find(i => i.id === selectedId)
          if (item) copyItem(item)
        }
        break
      case 'Tab':
        e.preventDefault()
        if (selectedId !== null && settings.extensions.length > 0) {
          setShowExtensions(true)
        }
        break
      case '/':
        e.preventDefault()
        inputRef.current?.focus()
        break
      default:
        if (e.key >= '1' && e.key <= '9') {
          const item = filteredItems[parseInt(e.key) - 1]
          if (item) copyItem(item)
        }
    }
  }, [filteredItems, selectedId, settings.extensions.length, copyItem])

  // 加载历史
  const loadHistory = useCallback(async () => {
    try {
      const result = await invoke<ClipboardItem[]>('get_history', { limit: MAX_HISTORY_FETCH })
      setItems(result)

      // 异步加载图片，不阻塞
      result.filter(i => i.item_type === 'image').forEach(item => {
        invoke<string>('get_image_asset_url', { relativePath: item.content })
          .then(url => setImageCache(prev => ({ ...prev, [item.content]: url })))
          .catch(() => {})
      })
    } catch {}
  }, [])

  // 初始化
  useEffect(() => {
    loadSettings()
    loadHistory()
    loadSemanticStatus()

    invoke<{ x: number; y: number }>('get_window_state')
      .then(s => {
        if (s.x <= 50 && s.y <= 50) {
          invoke('move_window', {
            x: Math.floor((window.screen.width - 450) / 2),
            y: Math.floor((window.screen.height - 400) / 3)
          }).catch(() => {})
        }
      })
      .catch(() => {})

    const onNewItem = (e: Event) => {
      const item = (e as CustomEvent<ClipboardItem>).detail
      setItems(prev => [item, ...prev.filter(i => i.id !== item.id)])
      setSelectedId(item.id)
      if (item.item_type === 'image') {
        invoke<string>('get_image_asset_url', { relativePath: item.content })
          .then(url => setImageCache(prev => ({ ...prev, [item.content]: url })))
          .catch(() => {})
      }
    }
    window.addEventListener('powerclip:new-item', onNewItem)
    return () => window.removeEventListener('powerclip:new-item', onNewItem)
  }, [loadSettings, loadHistory, loadSemanticStatus])

  // 监听配置文件变化
  useEffect(() => {
    const handler = () => loadSettings()
    window.addEventListener('powerclip:settings-changed', handler)
    return () => window.removeEventListener('powerclip:settings-changed', handler)
  }, [loadSettings])

  // 窗口显示时重置
  useEffect(() => {
    const handler = () => {
      setShowExtensions(false)
      loadHistory().then(() => {
        if (listRef.current) listRef.current.scrollTop = 0
        setTimeout(() => inputRef.current?.focus(), FOCUS_DELAY_MS)
      })
    }
    window.addEventListener('powerclip:window-shown', handler)
    return () => window.removeEventListener('powerclip:window-shown', handler)
  }, [loadHistory])

  // 滚动到选中项
  useEffect(() => {
    if (selectedId !== null && listRef.current) {
      listRef.current.querySelector(`[data-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedId])

  // 初始焦点
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), FOCUS_DELAY_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="window-wrapper w-full h-full flex flex-col text-white relative" style={{ opacity: settings.window_opacity }}>
      <WindowDragHandler>
        <div className="flex items-center gap-2 px-4 py-3" style={{ backgroundColor: colors.bgSecondary }}>
          <svg className="w-4 h-4 flex-shrink-0" style={{ color: colors.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={semanticMode ? "语义搜索..." : "搜索..."}
            className="flex-1 bg-transparent text-sm outline-none placeholder-gray-500 no-drag"
            style={{ color: colors.text }}
          />
          {semanticLoading && (
            <svg className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: colors.accent }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {semanticError && semanticMode && (
            <span className="text-xs px-2 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: 'rgba(239,68,68,0.2)', color: '#fca5a5' }} title={semanticError}>
              搜索错误
            </span>
          )}
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="no-drag p-1 rounded hover:bg-white/10" style={{ color: colors.textMuted }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <SemanticToggle
            enabled={settings.semantic_search_enabled}
            active={semanticMode}
            status={semanticStatus}
            onToggle={handleSemanticToggle}
            onRefreshStatus={loadSemanticStatus}
          />
          <button
            onClick={() => invoke('open_settings_file').catch(() => {})}
            className="p-1.5 rounded hover:bg-white/10 transition-colors flex-shrink-0 no-drag"
            title="编辑配置文件 (Cmd+,)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </WindowDragHandler>

      {showExtensions && (
        <ExtensionSelector
          extensions={settings.extensions}
          selectedItem={filteredItems.find(i => i.id === selectedId) || null}
          onClose={() => setShowExtensions(false)}
          onCloseWindow={() => { setShowExtensions(false); setSearchQuery(''); invoke('hide_window').catch(() => {}) }}
        />
      )}

      <ul ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin" style={{ backgroundColor: colors.bg }} onKeyDown={handleKeyDown} tabIndex={0}>
        {filteredItems.map((item, index) => (
          <ClipboardListItem
            key={item.id}
            item={item}
            index={index}
            isSelected={selectedId === item.id}
            imageCache={imageCache}
            semanticScore={semanticScoreMap.get(item.id)}
            onSelect={setSelectedId}
            onCopy={copyItem}
            onDelete={deleteItem}
          />
        ))}
        {filteredItems.length === 0 && <EmptyState hasSearchQuery={searchQuery.length > 0} semanticMode={semanticMode} />}
      </ul>

      <StatusBar
        totalCount={items.length}
        filteredCount={filteredItems.length}
        hasSearchQuery={searchQuery.length > 0}
        isDarwin={isDarwin}
        semanticMode={semanticMode}
      />
      <ResizeHandle />
    </div>
  )
}

export default App
