/**
 * PowerClip - 主应用组件
 *
 * 核心功能:
 * 1. 显示剪贴板历史列表
 * 2. 支持搜索、选择、复制操作
 * 3. 设置管理 (快捷键、清理规则等)
 * 4. 窗口拖拽和调整大小
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { ClipboardItem, Settings } from './types'
import { theme } from './theme'
import { logger } from './utils/logger'

// 导入组件
import {
  ResizeHandle,
  WindowDragHandler,
  EmptyState,
  StatusBar,
  ClipboardListItem,
  SettingsDialog
} from './components'

const colors = theme.colors
type ImageCache = Record<string, string>

// ============================================================================
// 主组件
// ============================================================================

function App() {
  const isDarwin = navigator.platform.toLowerCase().includes('mac')

  // ==================== 状态管理 ====================

  // 数据状态
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [imageCache, setImageCache] = useState<ImageCache>({})

  // UI 状态
  const [showSettings, setShowSettings] = useState(false)
  const [recordingHotkey, setRecordingHotkey] = useState(false)
  const [previousAppBundleId, setPreviousAppBundleId] = useState<string>('')

  // 应用设置
  const [settings, setSettings] = useState<Settings>({
    auto_cleanup_enabled: false,
    max_items: 100,
    hotkey_modifiers: isDarwin ? 'Meta+Shift' : 'Control+Shift',
    hotkey_key: 'KeyV',
    display_limit: 50,
    preview_max_length: 200,
    window_opacity: 0.95,
  })

  // DOM 引用
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ==================== 派生状态 ====================

  const filteredItems = items.filter(item =>
    item.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getCurrentIndex = useCallback(() => {
    if (selectedId === null) return -1
    return filteredItems.findIndex(item => item.id === selectedId)
  }, [filteredItems, selectedId])

  // ==================== 核心功能函数 ====================

  /**
   * 复制项目到系统剪贴板并隐藏窗口
   */
  const copyItem = useCallback(async (item: ClipboardItem) => {
    logger.info('App', `Copying item id=${item.id}, type=${item.item_type}`)
    try {
      await invoke('copy_to_clipboard', { item })
      await invoke('hide_window')
      logger.info('App', 'Item copied and window hidden')

      // 恢复焦点到之前的应用 (macOS)
      if (previousAppBundleId) {
        await invoke('activate_previous_app', { bundleId: previousAppBundleId })
        logger.info('App', `Restored focus to app: ${previousAppBundleId}`)
      }
    } catch (error) {
      logger.error('App', `Failed to copy item: ${error}`)
      console.error('Failed to copy:', error)
    }
  }, [previousAppBundleId])

  /**
   * 从后端获取历史记录
   */
  const fetchHistory = useCallback(async () => {
    try {
      const result = await invoke<ClipboardItem[]>('get_history', { limit: settings.display_limit })

      setItems(result)

      // 并行加载所有图片的 data URL
      const imageItems = result.filter((item: ClipboardItem) => item.item_type === 'image')
      if (imageItems.length === 0) return

      const newPaths: ImageCache = {}
      await Promise.all(
        imageItems.map(async (item: ClipboardItem) => {
          try {
            const dataUrl = await invoke<string>('get_image_asset_url', { relativePath: item.content })
            newPaths[item.content] = dataUrl
            logger.debug('App', `Image loaded: ${item.content}`)
          } catch (e) {
            logger.error('App', `Failed to load image: ${item.content}, error: ${e}`)
          }
        })
      )

      if (Object.keys(newPaths).length > 0) {
        setImageCache(prev => ({ ...prev, ...newPaths }))
        logger.info('App', `Loaded ${Object.keys(newPaths).length} image URLs`)
      }
    } catch (error) {
      logger.error('App', `Failed to fetch history: ${error}`)
      console.error('Failed to fetch history:', error)
    }
  }, [settings.display_limit])

  /**
   * 更新本地设置状态（不保存到后端）
   * 用于实时更新 UI，实际保存在失去焦点或关闭窗口时
   */
  const updateSettings = useCallback((newSettings: Settings) => {
    setSettings(newSettings)
  }, [])

  /**
   * 保存设置到后端
   * 在用户完成输入后调用（失去焦点、关闭窗口、checkbox/slider变化等）
   */
  const saveSettings = useCallback((settingsToSave?: Settings) => {
    const finalSettings = settingsToSave || settings

    // 异步保存到后端 (不阻塞 UI)
    invoke('save_settings', { settings: finalSettings })
      .then(() => {
        logger.info('App', 'Settings saved successfully')

        // 如果 display_limit 变化了，刷新历史记录
        if (finalSettings.display_limit !== settings.display_limit) {
          logger.info('App', 'Display limit changed, refreshing history...')
          fetchHistory()
        }
      })
      .catch(err => {
        logger.error('App', `Failed to save settings: ${err}`)
      })
  }, [settings, fetchHistory])

  /**
   * 键盘导航处理
   */
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
        // Restore focus to previous app (macOS)
        if (previousAppBundleId) {
          invoke('activate_previous_app', { bundleId: previousAppBundleId })
        }
        break
      case 'focusSearch':
        inputRef.current?.focus()
        break
    }
  }, [filteredItems, selectedId, copyItem, getCurrentIndex, previousAppBundleId])

  /**
   * 数字键快速复制 (1-9)
   */
  const handleNumberKey = useCallback((key: string) => {
    const index = parseInt(key) - 1
    if (filteredItems[index]) {
      copyItem(filteredItems[index])
    }
  }, [filteredItems, copyItem])

  // ==================== 键盘事件处理 ====================

  /** 列表的键盘处理 */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Esc: 先关闭设置，再关闭窗口
    if (e.key === 'Escape') {
      e.preventDefault()
      if (showSettings) {
        setShowSettings(false)
      } else {
        handleNavigation('close')
      }
      return
    }

    // 设置打开时禁用其他快捷键
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
        // 数字键 1-9
        if (e.key >= '1' && e.key <= '9') {
          handleNumberKey(e.key)
        }
    }
  }, [handleNavigation, handleNumberKey, showSettings])

  /** 搜索框的键盘处理 */
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Esc: 先关闭设置，再关闭窗口
    if (e.key === 'Escape') {
      e.preventDefault()
      if (showSettings) {
        setShowSettings(false)
      } else {
        handleNavigation('close')
      }
      return
    }

    // 设置打开时禁用其他快捷键
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

  /** 快捷键录制处理 */
  const handleHotkeyKeyDown = useCallback((e: KeyboardEvent) => {
    if (!recordingHotkey) return
    e.preventDefault()

    if (e.key === 'Escape') {
      setRecordingHotkey(false)
      return
    }

    const modifiers: string[] = []
    if (e.ctrlKey) modifiers.push('Control')
    if (e.metaKey) modifiers.push('Meta')
    if (e.altKey) modifiers.push('Alt')
    if (e.shiftKey) modifiers.push('Shift')

    // 获取按键值 - 使用 code 而不是 key，避免特殊字符问题
    const key = e.code

    if (key !== 'ControlLeft' && key !== 'ControlRight' &&
        key !== 'MetaLeft' && key !== 'MetaRight' &&
        key !== 'AltLeft' && key !== 'AltRight' &&
        key !== 'ShiftLeft' && key !== 'ShiftRight') {
      // 从 e.code 提取键名 (如 KeyA -> A)
      const keyName = key.startsWith('Key') ? key.slice(3) : key
      const keyCode = `Key${keyName.toUpperCase()}`
      const newSettings = {
        ...settings,
        hotkey_modifiers: modifiers.join('+') || 'Meta',
        hotkey_key: keyCode,
      }
      // Update local state first (for immediate UI update), then save to backend
      updateSettings(newSettings)
      saveSettings(newSettings)
      setRecordingHotkey(false)
    }
  }, [recordingHotkey, settings, updateSettings, saveSettings])

  // ==================== 副作用 (Effects) ====================

  /**
   * 初始化: 加载历史和设置窗口位置
   */
  useEffect(() => {
    fetchHistory()

    // 首次加载时居中窗口
    const initWindowPosition = async () => {
      try {
        const state = await invoke<{ x: number; y: number; width: number; height: number }>('get_window_state')
        if (state.x <= 50 && state.y <= 50) {
          const screenWidth = window.screen.width
          const screenHeight = window.screen.height
          const windowWidth = state.width || 450
          const windowHeight = state.height || 400
          const newX = Math.floor((screenWidth - windowWidth) / 2)
          const newY = Math.floor((screenHeight - windowHeight) / 3)
          await invoke('move_window', { x: newX, y: newY })
          logger.info('App', `Window positioned at (${newX}, ${newY})`)
        }
      } catch (e) {
        logger.error('App', `Failed to set window position: ${e}`)
      }
    }

    initWindowPosition()

    // 监听新剪贴板项
    const handleNewItem = (event: Event) => {
      const customEvent = event as CustomEvent<ClipboardItem>
      const newItem = customEvent.detail

      setItems(prev => [newItem, ...prev.filter(item => item.id !== newItem.id)])
      setSelectedId(newItem.id)

      // 如果是图片，加载图片
      if (newItem.item_type === 'image') {
        invoke<string>('get_image_asset_url', { relativePath: newItem.content })
          .then(dataUrl => setImageCache(prev => ({ ...prev, [newItem.content]: dataUrl })))
          .catch(err => logger.error('App', `Failed to load new image: ${err}`))
      }
    }

    window.addEventListener('powerclip:new-item', handleNewItem)
    return () => window.removeEventListener('powerclip:new-item', handleNewItem)
  }, [fetchHistory])

  /**
   * 加载设置
   */
  useEffect(() => {
    invoke<Settings>('get_settings')
      .then(s => {
        setSettings(s)
        logger.info('App', 'Settings loaded')
      })
      .catch(err => logger.error('App', `Failed to load settings: ${err}`))
  }, [])

  /**
   * 通知后端设置界面状态 + 焦点恢复
   */
  useEffect(() => {
    if (!showSettings) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }

    // 通知后端设置界面状态
    invoke('set_settings_dialog_open', { open: showSettings })
      .then(() => logger.debug('App', `Settings dialog: ${showSettings}`))
      .catch(err => logger.error('App', `Failed to notify backend: ${err}`))
  }, [showSettings])

  /**
   * 快捷键录制监听
   */
  useEffect(() => {
    if (recordingHotkey) {
      window.addEventListener('keydown', handleHotkeyKeyDown)
      return () => window.removeEventListener('keydown', handleHotkeyKeyDown)
    }
  }, [recordingHotkey, handleHotkeyKeyDown])

  /**
   * 窗口显示时刷新数据
   */
  useEffect(() => {
    const handleWindowShown = async () => {
      try {
        // 获取当前聚焦的应用，用于之后恢复
        if (isDarwin) {
          const bundleId = await invoke<string>('get_previous_app')
          setPreviousAppBundleId(bundleId)
          logger.info('App', `Previous app bundle ID: ${bundleId}`)
        }

        const result = await invoke<ClipboardItem[]>('get_history', { limit: settings.display_limit })
        setItems(result)

        if (listRef.current) {
          listRef.current.scrollTop = 0
        }

        if (result.length > 0) {
          setSelectedId(result[0].id)
        }

        setTimeout(() => inputRef.current?.focus(), 50)
      } catch (error) {
        console.error('Error in window shown handler:', error)
      }
    }

    window.addEventListener('powerclip:window-shown', handleWindowShown)
    return () => window.removeEventListener('powerclip:window-shown', handleWindowShown)
  }, [settings.display_limit, isDarwin])

  /**
   * 自动滚动到选中项
   */
  useEffect(() => {
    if (selectedId !== null && listRef.current) {
      const selectedElement = listRef.current.querySelector(`[data-id="${selectedId}"]`)
      if (selectedElement) {
        selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [selectedId])

  /**
   * 初始聚焦搜索框
   */
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  // ==================== 渲染 ====================

  return (
    <div className="window-wrapper w-full h-full flex flex-col text-white relative" style={{ opacity: settings.window_opacity }}>
      {/* 顶栏: 搜索框 + 设置按钮 */}
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

      {/* 设置界面 (模态框) */}
      {showSettings && (
        <SettingsDialog
          settings={settings}
          recordingHotkey={recordingHotkey}
          onClose={() => setShowSettings(false)}
          onUpdateSettings={updateSettings}
          onSaveSettings={saveSettings}
          onStartRecordingHotkey={() => setRecordingHotkey(true)}
        />
      )}

      {/* 历史列表 */}
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
        {filteredItems.length === 0 && <EmptyState hasSearchQuery={searchQuery.length > 0} />}
      </ul>

      {/* 状态栏 */}
      <StatusBar
        totalCount={items.length}
        filteredCount={filteredItems.length}
        hasSearchQuery={searchQuery.length > 0}
        isDarwin={isDarwin}
      />

      {/* 调整大小手柄 */}
      <ResizeHandle />
    </div>
  )
}

export default App
