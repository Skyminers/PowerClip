import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { ClipboardItem } from './types'

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
    <div className="w-full h-full flex flex-col bg-[#1a1a2e] text-white overflow-hidden">
      {/* 搜索栏 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#16213e] border-b border-[#0f3460]">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索剪贴板历史..."
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-gray-500 hover:text-white transition-colors"
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
        className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#0f3460] scrollbar-track-transparent"
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {filteredItems.map((item, index) => (
          <li
            key={item.id}
            className={`group relative px-3 py-2.5 cursor-pointer transition-all duration-150 ${
              selectedId === item.id
                ? 'bg-[#e94560]'
                : 'hover:bg-[#16213e] border-b border-[#0f3460]/30'
            }`}
            onClick={() => setSelectedId(item.id)}
            onDoubleClick={() => copyItem(item)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <span className={`text-sm flex-shrink-0 mt-0.5 ${
                  selectedId === item.id ? 'opacity-90' : 'text-gray-400'
                }`}>
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
                  <p className={`text-sm truncate ${
                    selectedId === item.id ? 'text-white' : 'text-gray-200'
                  }`}>
                    {formatContent(item.content, item.item_type)}
                  </p>
                  {selectedId === item.id && item.item_type === 'text' && (
                    <p className="text-xs mt-1 text-white/70 line-clamp-2 opacity-80">
                      {getPreview(item.content, item.item_type)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {!isDarwin && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    selectedId === item.id ? 'bg-white/20 text-white' : 'bg-[#0f3460] text-gray-400'
                  }`}>
                    {index + 1}
                  </span>
                )}
                <span className={`text-xs ${
                  selectedId === item.id ? 'text-white/70' : 'text-gray-500'
                }`}>
                  {formatTime(item.created_at)}
                </span>
              </div>
            </div>

            {/* 快捷键提示 */}
            {selectedId === item.id && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded text-white/80">
                  Enter
                </span>
                {isDarwin && (
                  <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded text-white/80">
                    ⌘{index + 1}
                  </span>
                )}
              </div>
            )}
          </li>
        ))}

        {filteredItems.length === 0 && (
          <li className="px-3 py-12 text-center">
            <div className="flex flex-col items-center gap-2 text-gray-500">
              <svg className="w-12 h-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-sm">
                {searchQuery ? '未找到匹配的结果' : '暂无剪贴板历史'}
              </span>
            </div>
          </li>
        )}
      </ul>

      {/* 状态栏 */}
      <div className="px-3 py-2 bg-[#16213e] border-t border-[#0f3460] flex items-center justify-between text-xs">
        <div className="flex items-center gap-3 text-gray-400">
          <span>{filteredItems.length} / {items.length} 条</span>
          {searchQuery && <span className="text-[#e94560]">筛选模式</span>}
        </div>
        <div className="flex items-center gap-3 text-gray-500">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-[#0f3460] rounded text-[10px]">/</kbd> 搜索
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-[#0f3460] rounded text-[10px]">Esc</kbd> 关闭
          </span>
          <span>{isDarwin ? '⌘⇧V' : 'Ctrl+Shift+V'}</span>
        </div>
      </div>
    </div>
  )
}

export default App
