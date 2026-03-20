/**
 * PowerClip - Main Application Component
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { invoke } from '@tauri-apps/api/core'
import {
  Search,
  X,
  Loader2,
  AlertCircle,
  Star,
  Plus,
  Settings,
  List,
} from 'lucide-react'
import type { ClipboardItem, Settings as SettingsType, ImageCache, SemanticStatus, Snippet } from './types'
import { isDarwin } from './utils/platform'
import { useSemanticSearch } from './hooks/useSemanticSearch'
import { useDebouncedValue } from './hooks/useDebouncedValue'

import {
  ResizeHandle,
  WindowDragHandler,
  EmptyState,
  StatusBar,
  ClipboardListItem,
  ExtensionSelector,
  SemanticToggle,
  SnippetListItem,
  AddSnippetDialog,
  SnippetDialog,
  QuickMenu,
  SmartLists,
  TEXT_ITEM_HEIGHT,
  IMAGE_ITEM_HEIGHT,
  FILE_ITEM_HEIGHT,
  SNIPPET_ITEM_HEIGHT
} from './components'
import type { SmartListFilter } from './components'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

function App() {

  // State
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [imageCache, setImageCache] = useState<ImageCache>({})
  const [showExtensions, setShowExtensions] = useState(false)
  const [semanticMode, setSemanticMode] = useState(false)
  const [semanticStatus, setSemanticStatus] = useState<SemanticStatus | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  // Snippets state
  const [viewMode, setViewMode] = useState<'history' | 'snippets'>('history')
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [selectedSnippetId, setSelectedSnippetId] = useState<number | null>(null)
  const [addDialogItem, setAddDialogItem] = useState<ClipboardItem | null>(null)

  // Paste queue state
  const [pasteQueueCount, setPasteQueueCount] = useState(0)

  // Smart list filter state
  const [smartListFilter, setSmartListFilter] = useState<SmartListFilter>('all')

  // List key - changes when window is shown to force virtualizer reset
  const [listKey, setListKey] = useState(0)
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null)
  const [showAddSnippetDialog, setShowAddSnippetDialog] = useState(false)

  const [settings, setSettings] = useState<SettingsType>({
    auto_cleanup_enabled: false,
    max_items: 100,
    hotkey_modifiers: isDarwin ? 'Meta+Shift' : 'Control+Shift',
    hotkey_key: 'KeyV',
    window_opacity: 0.95,
    auto_paste_enabled: false,
    extensions: [],
    semantic_search_enabled: false,
    embedding_api_url: '',
    embedding_api_key: '',
    embedding_api_model: '',
    embedding_api_dim: 256,
    add_to_snippets_hotkey_enabled: true,
    add_to_snippets_hotkey_modifiers: isDarwin ? 'Meta+Shift' : 'Control+Shift',
    add_to_snippets_hotkey_key: 'KeyS',
    clipboard_poll_interval_ms: 100,
    min_similarity_score: 0.2,
    max_embeddings_in_memory: 50000,
    content_truncate_length: 50,
    image_preview_max_width: 120,
    image_preview_max_height: 80,
    max_history_fetch: 10000,
    focus_delay_ms: 50,
    semantic_search_debounce_ms: 300,
  })

  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Refs for global keydown
  const showExtensionsRef = useRef(showExtensions)
  showExtensionsRef.current = showExtensions
  const viewModeRef = useRef(viewMode)
  viewModeRef.current = viewMode

  // Semantic search hook
  const { results: semanticResults, loading: semanticLoading, error: semanticError } = useSemanticSearch(
    semanticMode ? searchQuery : '',
    50,
    settings.semantic_search_debounce_ms,
    settings.min_similarity_score
  )

  // Derived state
  const searchLower = useMemo(() => searchQuery.toLowerCase(), [searchQuery])

  // Debounced search query for filtering (150ms delay)
  const debouncedSearchLower = useDebouncedValue(searchLower, 150)

  // Get today's date string for filtering
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])

  // Get date 7 days ago for week filtering
  const weekAgoStr = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  }, [])

  // Filter items by smart list type
  const smartListFilteredItems = useMemo(() => {
    if (semanticMode && semanticResults.length > 0 && searchQuery.length > 0) {
      // In semantic mode, use semantic results
      let results = semanticResults.map(r => r.item)
      // Apply smart list filter to semantic results too
      if (smartListFilter === 'text') {
        results = results.filter(item => item.item_type === 'text')
      } else if (smartListFilter === 'image') {
        results = results.filter(item => item.item_type === 'image')
      } else if (smartListFilter === 'file') {
        results = results.filter(item => item.item_type === 'file')
      } else if (smartListFilter === 'today') {
        results = results.filter(item => item.created_at.startsWith(todayStr))
      } else if (smartListFilter === 'week') {
        results = results.filter(item => item.created_at >= weekAgoStr)
      }
      return results
    }

    // Apply smart list filter
    let filtered = items
    if (smartListFilter === 'text') {
      filtered = items.filter(item => item.item_type === 'text')
    } else if (smartListFilter === 'image') {
      filtered = items.filter(item => item.item_type === 'image')
    } else if (smartListFilter === 'file') {
      filtered = items.filter(item => item.item_type === 'file')
    } else if (smartListFilter === 'today') {
      filtered = items.filter(item => item.created_at.startsWith(todayStr))
    } else if (smartListFilter === 'week') {
      filtered = items.filter(item => item.created_at >= weekAgoStr)
    }

    // Then apply search filter
    if (searchLower) {
      filtered = filtered.filter(item => item.content.toLowerCase().includes(searchLower))
    }

    return filtered
  }, [items, smartListFilter, searchLower, semanticMode, semanticResults, searchQuery, todayStr, weekAgoStr])

  // Alias for backward compatibility
  const filteredItems = smartListFilteredItems

  // Calculate counts for smart list badges
  const smartListCounts = useMemo(() => {
    const todayItems = items.filter(item => item.created_at.startsWith(todayStr))
    const weekItems = items.filter(item => item.created_at >= weekAgoStr)

    return {
      all: items.length,
      today: todayItems.length,
      week: weekItems.length,
      text: items.filter(item => item.item_type === 'text').length,
      image: items.filter(item => item.item_type === 'image').length,
      file: items.filter(item => item.item_type === 'file').length,
    }
  }, [items, todayStr, weekAgoStr])

  // Map item id to semantic score for quick lookup
  const semanticScoreMap = useMemo(() => {
    if (semanticMode && semanticResults.length > 0) {
      return new Map(semanticResults.map(r => [r.item.id, r.score]))
    }
    return new Map<number, number>()
  }, [semanticMode, semanticResults])

  // Cached filtered snippets - used in list render, empty state, and StatusBar
  const filteredSnippets = useMemo(() =>
    snippets.filter(s =>
      debouncedSearchLower.length === 0 ||
      s.content.toLowerCase().includes(debouncedSearchLower) ||
      (s.alias && s.alias.toLowerCase().includes(debouncedSearchLower))
    ),
    [snippets, debouncedSearchLower]
  )

  // Virtual scrolling for history list - fixed height per item type
  const historyVirtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: () => listRef.current,
    estimateSize: (index) => {
      const item = filteredItems[index]
      if (item?.item_type === 'image') return IMAGE_ITEM_HEIGHT
      if (item?.item_type === 'file') return FILE_ITEM_HEIGHT
      return TEXT_ITEM_HEIGHT
    },
    overscan: 5,
  })

  // Virtual scrolling for snippets list - fixed height
  const snippetsVirtualizer = useVirtualizer({
    count: filteredSnippets.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => SNIPPET_ITEM_HEIGHT,
    overscan: 5,
  })

  // Copy item to clipboard
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

  // Delete item
  const deleteItem = useCallback(async (itemId: number) => {
    try {
      await invoke('delete_history_item', { itemId })
      // Remove from list
      setItems(prev => prev.filter(item => item.id !== itemId))
      // Clear selection if deleted item was selected
      if (selectedId === itemId) {
        setSelectedId(null)
      }
    } catch (error) {
      console.error('Failed to delete item:', error)
    }
  }, [selectedId])

  // Load snippets
  const loadSnippets = useCallback(async () => {
    try {
      const result = await invoke<Snippet[]>('get_snippets')
      setSnippets(result)
    } catch (error) {
      console.error('[PowerClip] Failed to load snippets:', error)
    }
  }, [])

  // Copy snippet to clipboard
  const copySnippet = useCallback(async (snippet: Snippet) => {
    try {
      // Create a ClipboardItem-like object for the copy_to_clipboard command
      const item = {
        id: snippet.id,
        item_type: 'text',
        content: snippet.content,
        hash: '',
        created_at: snippet.created_at
      }
      await invoke('copy_to_clipboard', { item })
      await invoke('hide_window')
      if (settings.auto_paste_enabled) {
        await invoke('simulate_paste')
      }
    } catch (error) {
      console.error('Failed to copy snippet:', error)
    }
  }, [settings.auto_paste_enabled])

  // Delete snippet
  const deleteSnippet = useCallback(async (snippetId: number) => {
    try {
      await invoke('delete_snippet', { id: snippetId })
      setSnippets(prev => prev.filter(s => s.id !== snippetId))
      if (selectedSnippetId === snippetId) {
        setSelectedSnippetId(null)
      }
    } catch (error) {
      console.error('Failed to delete snippet:', error)
    }
  }, [selectedSnippetId])

  // Add to snippets
  const handleAddToSnippets = useCallback((item: ClipboardItem) => {
    setAddDialogItem(item)
  }, [])

  // Confirm add snippet
  const handleConfirmAddSnippet = useCallback(async (content: string, alias: string | null) => {
    try {
      await invoke('add_snippet', { content, alias })
      await loadSnippets()
    } catch (error) {
      console.error('Failed to add snippet:', error)
    }
    setAddDialogItem(null)
  }, [loadSnippets])

  // Update snippet
  const handleUpdateSnippet = useCallback(async (id: number, content: string, alias: string | null) => {
    try {
      await invoke('update_snippet', { id, content, alias })
      await loadSnippets()
    } catch (error) {
      console.error('Failed to update snippet:', error)
    }
    setEditingSnippet(null)
  }, [loadSnippets])

  // Handle edit snippet
  const handleEditSnippet = useCallback((snippet: Snippet) => {
    setEditingSnippet(snippet)
  }, [])

  // Handle add new snippet from snippets view
  const handleAddNewSnippet = useCallback((content: string, alias: string | null) => {
    invoke('add_snippet', { content, alias })
      .then(() => loadSnippets())
      .catch(error => console.error('Failed to add snippet:', error))
    setShowAddSnippetDialog(false)
  }, [loadSnippets])

  // Paste queue functions
  const addToPasteQueue = useCallback(async (item: ClipboardItem) => {
    try {
      const count = await invoke<number>('add_to_paste_queue', { item })
      setPasteQueueCount(count)
    } catch (error) {
      console.error('[PowerClip] Failed to add to paste queue:', error)
    }
  }, [])

  const pasteNextInQueue = useCallback(async () => {
    try {
      const item = await invoke<ClipboardItem | null>('paste_next_in_queue')
      if (item) {
        const count = await invoke<number>('get_paste_queue_count')
        setPasteQueueCount(count)
      }
    } catch (error) {
      console.error('[PowerClip] Failed to paste next in queue:', error)
    }
  }, [])

  // Load settings
  const loadSettings = useCallback(() => {
    invoke<SettingsType>('get_settings')
      .then(s => {
        setSettings(s)
        setSettingsError(null) // Clear any previous error on success
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
    if (semanticStatus?.api_configured && settings.semantic_search_enabled) {
      setSemanticMode(prev => !prev)
    }
  }, [semanticStatus, settings.semantic_search_enabled])

  // Global keyboard events
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showExtensionsRef.current) return

      // Cmd+, to open config file
      if (e.key === ',' && (isDarwin ? e.metaKey : e.ctrlKey)) {
        e.preventDefault()
        invoke('open_settings_file').catch(() => {})
        return
      }

      // Cmd/Ctrl+P to toggle view mode
      if (e.key === 'p' && (isDarwin ? e.metaKey : e.ctrlKey)) {
        e.preventDefault()
        setViewMode(prev => prev === 'history' ? 'snippets' : 'history')
        setSearchQuery('')
        setSelectedId(null)
        setSelectedSnippetId(null)
        return
      }

      // Cmd/Ctrl+' to paste next item in queue
      if (e.key === '\'' && (isDarwin ? e.metaKey : e.ctrlKey)) {
        e.preventDefault()
        pasteNextInQueue()
        return
      }

      // Esc: Close extensions or hide window
      if (e.key === 'Escape') {
        e.preventDefault()
        if (addDialogItem) {
          setAddDialogItem(null)
          return
        }
        if (editingSnippet) {
          setEditingSnippet(null)
          return
        }
        if (showAddSnippetDialog) {
          setShowAddSnippetDialog(false)
          return
        }
        setSearchQuery('')
        invoke('hide_window').catch(() => {})
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [addDialogItem, editingSnippet, showAddSnippetDialog])

  // List keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showExtensionsRef.current) return

    // Handle snippets mode
    if (viewModeRef.current === 'snippets') {
      const idx = filteredSnippets.findIndex(s => s.id === selectedSnippetId)

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          if (idx > 0) setSelectedSnippetId(filteredSnippets[idx - 1].id)
          break
        case 'ArrowDown':
          e.preventDefault()
          if (idx < filteredSnippets.length - 1) setSelectedSnippetId(filteredSnippets[idx + 1].id)
          break
        case 'Enter':
          e.preventDefault()
          if (selectedSnippetId !== null) {
            const snippet = filteredSnippets.find(s => s.id === selectedSnippetId)
            if (snippet) copySnippet(snippet)
          }
          break
        case '/':
          e.preventDefault()
          inputRef.current?.focus()
          break
        default:
          if (e.key >= '1' && e.key <= '9') {
            const snippet = filteredSnippets[parseInt(e.key) - 1]
            if (snippet) copySnippet(snippet)
          }
      }
      return
    }

    // Handle history mode
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
  }, [filteredItems, filteredSnippets, selectedId, selectedSnippetId, settings.extensions.length, copyItem, copySnippet])

  // Load history (returns data without setting state - caller decides when to set)
  const fetchHistory = useCallback(async (): Promise<ClipboardItem[] | null> => {
    try {
      const result = await invoke<ClipboardItem[]>('get_history', { limit: settings.max_history_fetch })
      return result
    } catch (error) {
      console.error('[PowerClip] Failed to load history:', error)
      return null
    }
  }, [settings.max_history_fetch])

  // Load history and set state (for initial load and item additions)
  const loadHistory = useCallback(async (): Promise<ClipboardItem[] | null> => {
    const result = await fetchHistory()
    if (result) {
      setItems(result)

      // Load images asynchronously in batch
      const imageItems = result.filter(i => i.item_type === 'image')
      if (imageItems.length > 0) {
        Promise.all(
          imageItems.map(item =>
            invoke<string>('get_image_asset_url', { relativePath: item.content })
              .then(url => [item.content, url] as [string, string])
              .catch(() => null)
          )
        ).then(entries => {
          const validEntries = entries.filter((e): e is [string, string] => e !== null)
          if (validEntries.length > 0) {
            setImageCache(prev => {
              const newCache = { ...prev }
              validEntries.forEach(([key, url]) => { newCache[key] = url })
              return newCache
            })
          }
        })
      }
    }
    return result
  }, [fetchHistory])

  // Initialize
  useEffect(() => {
    loadSettings()
    loadHistory()
    loadSemanticStatus()
    loadSnippets()

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
  }, [loadSettings, loadHistory, loadSemanticStatus, loadSnippets])

  // Listen for settings file changes
  useEffect(() => {
    const handler = () => loadSettings()
    window.addEventListener('powerclip:settings-changed', handler)
    return () => window.removeEventListener('powerclip:settings-changed', handler)
  }, [loadSettings])

  // Listen for settings errors
  useEffect(() => {
    const handler = (e: Event) => {
      const error = (e as CustomEvent<string>).detail
      setSettingsError(error)
      console.error('[PowerClip] Settings error:', error)
    }
    window.addEventListener('powerclip:settings-error', handler)
    return () => window.removeEventListener('powerclip:settings-error', handler)
  }, [])

  // Listen for paste queue changes
  useEffect(() => {
    const handler = (e: Event) => {
      const count = (e as CustomEvent<number>).detail
      setPasteQueueCount(count)
    }
    window.addEventListener('powerclip:paste-queue-changed', handler)
    return () => window.removeEventListener('powerclip:paste-queue-changed', handler)
  }, [])

  // Listen for add-to-snippets hotkey
  useEffect(() => {
    const handleAddToSnippetsHotkey = async () => {
    console.log('[PowerClip] Add to snippets hotkey triggered')
      try {
        // Get current clipboard content
        const content = await navigator.clipboard.readText()
        if (content && content.trim()) {
          // Add to snippets with empty alias
          const result = await invoke<Snippet>('add_snippet', {
            content: content.trim(),
            alias: null
          })
          console.log('[PowerClip] Added to snippets:', result.id)

          // Show a brief notification (optional - could use toast)
          // For now, just reload snippets
          loadSnippets()
        }
      } catch (error) {
        console.error('[PowerClip] Failed to add to snippets via hotkey:', error)
      }
    }

    window.addEventListener('powerclip:add-to-snippets-hotkey', handleAddToSnippetsHotkey)
    return () => window.removeEventListener('powerclip:add-to-snippets-hotkey', handleAddToSnippetsHotkey)
  }, [loadSnippets])

  // Reset on window show
  useEffect(() => {
    const handler = async () => {
      setShowExtensions(false)
      setViewMode('history')
      setSearchQuery('')
      setSelectedSnippetId(null)
      setSmartListFilter('all')
      loadSnippets()

      // Force virtualizer to reset by changing the list key
      setListKey(k => k + 1)

      const items = await fetchHistory()

      // Update state synchronously
      flushSync(() => {
        if (items && items.length > 0) {
          setItems(items)
          setSelectedId(items[0].id)
        } else {
          setItems([])
          setSelectedId(null)
        }
      })

      // Reset scroll position after state update and DOM recreation
      // Multiple attempts to ensure it works
      const resetScroll = () => {
        if (listRef.current) {
          listRef.current.scrollTop = 0
        }
      }

      requestAnimationFrame(resetScroll)
      setTimeout(resetScroll, 10)
      setTimeout(resetScroll, 50)
      setTimeout(resetScroll, 100)

      // Load images asynchronously
      if (items) {
        const imageItems = items.filter(i => i.item_type === 'image')
        if (imageItems.length > 0) {
          Promise.all(
            imageItems.map(item =>
              invoke<string>('get_image_asset_url', { relativePath: item.content })
                .then(url => [item.content, url] as [string, string])
                .catch(() => null)
            )
          ).then(entries => {
            const validEntries = entries.filter((e): e is [string, string] => e !== null)
            if (validEntries.length > 0) {
              setImageCache(prev => {
                const newCache = { ...prev }
                validEntries.forEach(([key, url]) => { newCache[key] = url })
                return newCache
              })
            }
          })
        }
      }

      setTimeout(() => inputRef.current?.focus(), settings.focus_delay_ms)
    }
    window.addEventListener('powerclip:window-shown', handler)
    return () => window.removeEventListener('powerclip:window-shown', handler)
  }, [fetchHistory, loadSnippets, settings.focus_delay_ms])

  // Reset scroll when listKey changes (window is shown)
  useEffect(() => {
    if (listKey > 0) {
      // Use multiple attempts to ensure scroll reset works
      const resetScroll = () => {
        if (listRef.current) {
          listRef.current.scrollTop = 0
        }
      }
      resetScroll()
      requestAnimationFrame(resetScroll)
      setTimeout(resetScroll, 10)
      setTimeout(resetScroll, 50)
    }
  }, [listKey])

  // Scroll to selected item when using arrow keys (not on window show)
  useEffect(() => {
    if (viewMode === 'history' && selectedId !== null) {
      const idx = filteredItems.findIndex(item => item.id === selectedId)
      if (idx >= 0 && idx !== 0) {
        historyVirtualizer.scrollToIndex(idx, { align: 'auto' })
      }
    } else if (viewMode === 'snippets' && selectedSnippetId !== null) {
      const idx = filteredSnippets.findIndex(s => s.id === selectedSnippetId)
      if (idx >= 0 && idx !== 0) {
        snippetsVirtualizer.scrollToIndex(idx, { align: 'auto' })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedSnippetId, viewMode])

  // Initial focus
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), settings.focus_delay_ms)
    return () => clearTimeout(t)
  }, [settings.focus_delay_ms])

  return (
    <div className="window-wrapper w-full h-full flex flex-col text-white relative" style={{ opacity: settings.window_opacity }}>
      <WindowDragHandler>
        <div className="flex items-center gap-2 px-4 py-3 bg-secondary">
          <Search className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={viewMode === 'snippets' ? "Search quick commands..." : semanticMode ? "Semantic search..." : "Search..."}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground no-drag text-foreground"
          />
          {semanticLoading && (
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 text-accent" />
          )}
          {semanticError && semanticMode && (
            <Badge variant="destructive" className="flex-shrink-0" title={semanticError}>
              <AlertCircle className="w-3 h-3 mr-1" />
              Search Error
            </Badge>
          )}
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="no-drag p-1 rounded hover:bg-white/10 button-press text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <SemanticToggle
            enabled={settings.semantic_search_enabled && viewMode === 'history'}
            active={semanticMode}
            status={semanticStatus}
            onToggle={handleSemanticToggle}
            onRefreshStatus={loadSemanticStatus}
          />
          {/* Paste queue indicator */}
          {pasteQueueCount > 0 && (
            <button
              onClick={() => pasteNextInQueue()}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono no-drag button-press bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
              title={`Paste Queue: ${pasteQueueCount} items (${isDarwin ? 'Cmd' : 'Ctrl'}+' to paste next)`}
            >
              <List className="w-3 h-3" />
              <span>{pasteQueueCount}</span>
            </button>
          )}
          <button
            onClick={() => { setViewMode(prev => prev === 'history' ? 'snippets' : 'history'); setSearchQuery(''); setSelectedId(null); setSelectedSnippetId(null); }}
            className={cn(
              "p-1.5 rounded hover:bg-white/10 transition-colors flex-shrink-0 no-drag mode-switch-animate",
              viewMode === 'snippets' && "bg-white/10 text-accent",
              viewMode !== 'snippets' && "text-muted-foreground"
            )}
            title={`Toggle quick commands (${isDarwin ? 'Cmd' : 'Ctrl'}+P)`}
          >
            <Star className="w-4 h-4" fill={viewMode === 'snippets' ? 'currentColor' : 'none'} />
          </button>
          {viewMode === 'snippets' && (
            <button
              onClick={() => setShowAddSnippetDialog(true)}
              className="p-1.5 rounded hover:bg-white/10 transition-colors flex-shrink-0 no-drag button-press text-muted-foreground hover:text-foreground"
              title="Add new quick command"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => invoke('open_settings_file').catch(() => {})}
            className="p-1.5 rounded hover:bg-white/10 transition-colors flex-shrink-0 no-drag button-press text-muted-foreground hover:text-foreground"
            title="Edit config file (Cmd+,)"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </WindowDragHandler>

      {showExtensions && viewMode === 'history' && (
        <ExtensionSelector
          extensions={settings.extensions}
          selectedItem={filteredItems.find(i => i.id === selectedId) || null}
          onClose={() => setShowExtensions(false)}
          onCloseWindow={() => { setShowExtensions(false); setSearchQuery(''); invoke('hide_window').catch(() => {}) }}
        />
      )}

      {/* Smart Lists Filter - only show in history mode */}
      {viewMode === 'history' && (
        <SmartLists
          activeFilter={smartListFilter}
          onFilterChange={setSmartListFilter}
          counts={smartListCounts}
        />
      )}

      {/* Add Snippet Dialog */}
      {addDialogItem && (
        <AddSnippetDialog
          item={addDialogItem}
          onConfirm={handleConfirmAddSnippet}
          onCancel={() => setAddDialogItem(null)}
        />
      )}

      {/* Edit Snippet Dialog */}
      {editingSnippet && (
        <SnippetDialog
          mode="edit"
          snippet={editingSnippet}
          onConfirm={(content, alias) => handleUpdateSnippet(editingSnippet.id, content, alias)}
          onCancel={() => setEditingSnippet(null)}
        />
      )}

      {/* Add New Snippet Dialog */}
      {showAddSnippetDialog && (
        <SnippetDialog
          mode="add"
          onConfirm={handleAddNewSnippet}
          onCancel={() => setShowAddSnippetDialog(false)}
        />
      )}

      <ul key={listKey} ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin bg-background" onKeyDown={handleKeyDown} tabIndex={0}>
        {viewMode === 'history' ? (
          <>
            {filteredItems.length > 0 ? (
              <div style={{ height: `${historyVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                {historyVirtualizer.getVirtualItems().map(virtualRow => {
                  const item = filteredItems[virtualRow.index]
                  return (
                    <ClipboardListItem
                      key={item.id}
                      item={item}
                      index={virtualRow.index}
                      isSelected={selectedId === item.id}
                      imageCache={imageCache}
                      semanticScore={semanticScoreMap.get(item.id)}
                      contentTruncateLength={settings.content_truncate_length}
                      imagePreviewMaxWidth={settings.image_preview_max_width}
                      imagePreviewMaxHeight={settings.image_preview_max_height}
                      onSelect={setSelectedId}
                      onCopy={copyItem}
                      onDelete={deleteItem}
                      onAddToSnippets={handleAddToSnippets}
                      onAddToQueue={addToPasteQueue}
                      style={{ position: 'absolute', transform: `translateY(${virtualRow.start}px)`, width: '100%' }}
                      data-index={virtualRow.index}
                    />
                  )
                })}
              </div>
            ) : (
              <EmptyState hasSearchQuery={searchQuery.length > 0} semanticMode={semanticMode} />
            )}
          </>
        ) : (
          <>
            {filteredSnippets.length > 0 ? (
              <div style={{ height: `${snippetsVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                {snippetsVirtualizer.getVirtualItems().map(virtualRow => {
                  const snippet = filteredSnippets[virtualRow.index]
                  return (
                    <SnippetListItem
                      key={snippet.id}
                      snippet={snippet}
                      index={virtualRow.index}
                      isSelected={selectedSnippetId === snippet.id}
                      onSelect={setSelectedSnippetId}
                      onCopy={copySnippet}
                      onDelete={deleteSnippet}
                      onEdit={handleEditSnippet}
                      style={{ position: 'absolute', transform: `translateY(${virtualRow.start}px)`, width: '100%' }}
                      data-index={virtualRow.index}
                    />
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <Star className="w-12 h-12 mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery.length > 0 ? 'No matching quick commands' : 'No quick commands yet'}
                </p>
                <p className="text-xs mt-1 text-muted-foreground">
                  {searchQuery.length > 0 ? 'Try a different search term' : 'Click the star icon on a history item to add'}
                </p>
              </div>
            )}
          </>
        )}
      </ul>

      <StatusBar
        totalCount={viewMode === 'snippets' ? snippets.length : items.length}
        filteredCount={viewMode === 'snippets' ? filteredSnippets.length : filteredItems.length}
        hasSearchQuery={searchQuery.length > 0}
        isDarwin={isDarwin}
        semanticMode={semanticMode}
        viewMode={viewMode}
        hotkeyModifiers={settings.hotkey_modifiers}
        hotkeyKey={settings.hotkey_key}
        settingsError={settingsError}
      />
      <ResizeHandle />

      {/* Quick Menu */}
      <QuickMenu
        items={items}
        imageCache={imageCache}
      />
    </div>
  )
}

export default App
