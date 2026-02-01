import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { ClipboardItem } from './types'

// Ghostty-inspired color palette
const colors = {
  bg: '#1e1e2e',
  bgSecondary: '#29293f',
  bgHover: '#3a3a4f',
  text: '#cdd6f4',
  textMuted: '#6c7086',
  accent: '#89b4fa',
  accentHover: '#b4befe',
  border: '#45475a',
  selected: '#585b70',
}

// 窗口拖动处理函数
function handleDragStart(e: React.MouseEvent) {
  const target = e.target as HTMLElement
  // 排除输入框和按钮
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('button')) {
    return
  }
  invoke('drag_window').catch(console.error)
}

function App() {
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isDarwin = navigator.platform.toLowerCase().includes('mac')

  // 获取历史记录
  const fetchHistory = useCallback(async () => {
    try {
      const result = await invoke<ClipboardItem[]>('get_history', { limit: 50 })
      setItems(result)
    } catch (error) {
      console.error('获取历史失败:', error)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
    const interval = setInterval(fetchHistory, 1000)
    return () => clearInterval(interval)
  }, [fetchHistory])

  // 复制到剪贴板
  const copyItem = async (item: ClipboardItem) => {
    try {
      await invoke('copy_to_clipboard', { item })
      await invoke('toggle_window')
    } catch (error) {
      console.error('复制失败:', error)
    }
  }

  // 过滤项目
  const filteredItems = items.filter(item =>
    item.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // 自动选择第一个
  useEffect(() => {
    if (filteredItems.length > 0 && selectedId === null) {
      setSelectedId(filteredItems[0].id)
    }
  }, [filteredItems, selectedId])

  // 自动滚动到选中项
  useEffect(() => {
    if (selectedId !== null && listRef.current) {
      const selectedElement = listRef.current.querySelector(`[data-id="${selectedId}"]`)
      if (selectedElement) {
        selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [selectedId])

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const currentIndex = filteredItems.findIndex(item => item.id === selectedId)

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        if (currentIndex > 0) {
          setSelectedId(filteredItems[currentIndex - 1].id)
        }
        break
      case 'ArrowDown':
        e.preventDefault()
        if (currentIndex < filteredItems.length - 1) {
          setSelectedId(filteredItems[currentIndex + 1].id)
        }
        break
      case 'Enter':
        e.preventDefault()
        if (selectedId !== null) {
          const item = filteredItems.find(i => i.id === selectedId)
          if (item) copyItem(item)
        }
        break
      case 'Escape':
        e.preventDefault()
        setSearchQuery('')
        invoke('toggle_window')
        break
      case '/':
        e.preventDefault()
        inputRef.current?.focus()
        break
    }

    // 快捷键复制第 n 个项目 (1-9)
    if (e.key >= '1' && e.key <= '9') {
      const index = parseInt(e.key) - 1
      if (filteredItems[index]) {
        copyItem(filteredItems[index])
      }
    }
  }, [filteredItems, selectedId])

  // 格式化时间
  const formatTime = (createdAt: string) => {
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

  // 格式化内容
  const formatContent = (content: string, type: string) => {
    if (type === 'text') {
      const text = content.replace(/\n/g, ' ')
      return text.length > 50 ? text.slice(0, 50) + '...' : text
    }
    return `[图片] ${content.slice(0, 12)}...`
  }

  // 获取预览文本
  const getPreview = (content: string, type: string) => {
    if (type === 'text') {
      return content.length > 200 ? content.slice(0, 200) + '...' : content
    }
    return content
  }

  return (
    <div className="window-wrapper w-full h-full flex flex-col text-white">
      {/* 搜索栏 - 可拖动区域 */}
      <div
        className="drag-region flex items-center gap-3 px-4 py-3"
        style={{ backgroundColor: colors.bgSecondary }}
        onMouseDown={handleDragStart}
      >
        <svg className="w-4 h-4 flex-shrink-0" style={{ color: colors.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            const currentIndex = filteredItems.findIndex(item => item.id === selectedId)

            switch (e.key) {
              case 'ArrowUp':
                e.preventDefault()
                if (currentIndex > 0) {
                  setSelectedId(filteredItems[currentIndex - 1].id)
                }
                break
              case 'ArrowDown':
                e.preventDefault()
                if (currentIndex < filteredItems.length - 1) {
                  setSelectedId(filteredItems[currentIndex + 1].id)
                }
                break
              case 'Enter':
                e.preventDefault()
                if (selectedId !== null) {
                  const item = filteredItems.find(i => i.id === selectedId)
                  if (item) copyItem(item)
                }
                break
              case 'Escape':
                e.preventDefault()
                setSearchQuery('')
                invoke('toggle_window')
                break
            }
          }}
          placeholder="搜索..."
          className="flex-1 bg-transparent text-sm outline-none placeholder-gray-500 no-drag"
          style={{ color: colors.text }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="no-drag p-1 rounded hover:bg-gray-700 transition-colors"
            style={{ color: colors.textMuted }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* 历史列表 */}
      <ul
        ref={listRef}
        className="flex-1 overflow-y-auto scrollbar-thin"
        style={{ backgroundColor: colors.bg }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {filteredItems.map((item, index) => (
          <li
            key={item.id}
            data-id={item.id}
            className={`relative px-4 py-3 cursor-pointer transition-all duration-150 fade-in ${
              selectedId === item.id ? 'selected-pulse' : ''
            }`}
            style={{
              backgroundColor: selectedId === item.id ? colors.selected : 'transparent',
            }}
            onClick={() => setSelectedId(item.id)}
            onDoubleClick={() => copyItem(item)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <span className={`text-sm flex-shrink-0 mt-0.5 ${
                  selectedId === item.id ? 'opacity-90' : ''
                }`} style={{ color: selectedId === item.id ? colors.text : colors.textMuted }}>
                  {item.item_type === 'text' ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: selectedId === item.id ? colors.text : colors.text }}>
                    {formatContent(item.content, item.item_type)}
                  </p>
                  {selectedId === item.id && item.item_type === 'text' && (
                    <p className="text-xs mt-1.5 line-clamp-2 opacity-70" style={{ color: colors.text }}>
                      {getPreview(item.content, item.item_type)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {!isDarwin && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{
                    backgroundColor: selectedId === item.id ? 'rgba(255,255,255,0.15)' : colors.bgSecondary,
                    color: selectedId === item.id ? colors.text : colors.textMuted
                  }}>
                    {index + 1}
                  </span>
                )}
                <span className="text-xs" style={{ color: selectedId === item.id ? colors.textMuted : colors.textMuted }}>
                  {formatTime(item.created_at)}
                </span>
              </div>
            </div>

            {/* 快捷键提示 */}
            {selectedId === item.id && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <span className="text-xs px-2 py-0.5 rounded" style={{
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: colors.text
                }}>
                  Enter
                </span>
                {isDarwin && (
                  <span className="text-xs px-2 py-0.5 rounded" style={{
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    color: colors.text
                  }}>
                    ⌘{index + 1}
                  </span>
                )}
              </div>
            )}
          </li>
        ))}

        {filteredItems.length === 0 && (
          <li className="px-4 py-16 text-center empty-state">
            <div className="flex flex-col items-center gap-3" style={{ color: colors.textMuted }}>
              <svg className="w-12 h-12 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-sm">
                {searchQuery ? '未找到匹配的结果' : '暂无剪贴板历史'}
              </span>
              <span className="text-xs opacity-50">复制内容后会自动记录</span>
            </div>
          </li>
        )}
      </ul>

      {/* 状态栏 */}
      <div
        className="flex items-center justify-between px-4 py-2 text-xs"
        style={{ backgroundColor: colors.bgSecondary }}
      >
        <div className="flex items-center gap-4" style={{ color: colors.textMuted }}>
          <span>{filteredItems.length} / {items.length} 条</span>
          {searchQuery && <span style={{ color: colors.accent }}>筛选模式</span>}
        </div>
        <div className="flex items-center gap-4" style={{ color: colors.textMuted }}>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: colors.bgHover }}>
              /
            </kbd>
            搜索
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: colors.bgHover }}>
              Esc
            </kbd>
            关闭
          </span>
          <span>{isDarwin ? '⌘⇧V' : 'Ctrl+Shift+V'}</span>
        </div>
      </div>
    </div>
  )
}

export default App
