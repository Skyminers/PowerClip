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
  ExtensionBar,
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
  const filteredItems = useMemo(() => {
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

    // Then apply search filter (debounced to avoid jank on large lists)
    if (debouncedSearchLower) {
      filtered = filtered.filter(item => item.content.toLowerCase().includes(debouncedSearchLower))
    }

    return filtered
  }, [items, smartListFilter, debouncedSearchLower, semanticMode, semanticResults, searchQuery, todayStr, weekAgoStr])

  // Calculate counts for smart list badges (single pass)
  const smartListCounts = useMemo(() => {
    const counts = { all: items.length, today: 0, week: 0, text: 0, image: 0, file: 0 }
    for (const item of items) {
      if (item.created_at.startsWith(todayStr)) counts.today++
      if (item.created_at >= weekAgoStr) counts.week++
      if (item.item_type === 'text') counts.text++
      else if (item.item_type === 'image') counts.image++
      else if (item.item_type === 'file') counts.file++
    }
    return counts
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
      setItems(prev => prev.filter(item => item.id !== itemId))
      setSelectedId(prev => prev === itemId ? null : prev)
    } catch (error) {
      console.error('Failed to delete item:', error)
    }
  }, [])

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
      setSelectedSnippetId(prev => prev === snippetId ? null : prev)
    } catch (error) {
      console.error('Failed to delete snippet:', error)
    }
  }, [])

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

  // Smart list filter tabs for keyboard navigation
  const smartListTabs: SmartListFilter[] = useMemo(() =>
    ['all', 'today', 'week', 'text', 'image', 'file'],
  [])

  // Input keyboard handler - only handles special keys, lets text input through
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // In search input, only handle navigation keys, let text input through
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        listRef.current?.focus()
        // Also move selection down when navigating from input
        if (viewModeRef.current === 'history' && filteredItems.length > 0) {
          if (selectedId === null) {
            setSelectedId(filteredItems[0].id)
          } else {
            const idx = filteredItems.findIndex(item => item.id === selectedId)
            if (idx < filteredItems.length - 1) {
              setSelectedId(filteredItems[idx + 1].id)
            }
          }
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        listRef.current?.focus()
        // Also move selection up when navigating from input
        if (viewModeRef.current === 'history' && filteredItems.length > 0) {
          if (selectedId === null) {
            setSelectedId(filteredItems[0].id)
          } else {
            const idx = filteredItems.findIndex(item => item.id === selectedId)
            if (idx > 0) {
              setSelectedId(filteredItems[idx - 1].id)
            }
          }
        }
        break
      // ArrowLeft/Right: let the browser handle cursor movement in the input
      case 'Enter':
        e.preventDefault()
        if (viewModeRef.current === 'snippets') {
          if (selectedSnippetId !== null) {
            const snippet = filteredSnippets.find(s => s.id === selectedSnippetId)
            if (snippet) copySnippet(snippet)
          } else if (filteredSnippets.length > 0) {
            copySnippet(filteredSnippets[0])
          }
        } else if (selectedId !== null) {
          const item = filteredItems.find(i => i.id === selectedId)
          if (item) copyItem(item)
        } else if (filteredItems.length > 0) {
          copyItem(filteredItems[0])
        }
        break
      case 'Escape':
        e.preventDefault()
        if (searchQuery) {
          setSearchQuery('')
        } else {
          invoke('hide_window').catch(() => {})
        }
        break
      // Let all other keys (including numbers) pass through for text input
    }
  }, [searchQuery, filteredItems, filteredSnippets, selectedId, selectedSnippetId, copyItem, copySnippet])

  // List keyboard navigation - handles navigation when list is focused
  const handleListKeyDown = useCallback((e: React.KeyboardEvent) => {
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
        case 'ArrowLeft':
        case 'ArrowRight':
          e.preventDefault()
          setViewMode('history')
          setSearchQuery('')
          // Auto-select first item in history
          if (filteredItems.length > 0) {
            setSelectedId(filteredItems[0].id)
          }
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
      case 'ArrowLeft':
        e.preventDefault()
        {
          const currentIdx = smartListTabs.indexOf(smartListFilter)
          const newIdx = currentIdx > 0 ? currentIdx - 1 : smartListTabs.length - 1
          setSmartListFilter(smartListTabs[newIdx])
        }
        break
      case 'ArrowRight':
        e.preventDefault()
        {
          const currentIdx = smartListTabs.indexOf(smartListFilter)
          const newIdx = currentIdx < smartListTabs.length - 1 ? currentIdx + 1 : 0
          setSmartListFilter(smartListTabs[newIdx])
        }
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
    }
  }, [filteredItems, filteredSnippets, selectedId, selectedSnippetId, settings.extensions.length, copyItem, copySnippet, smartListTabs, smartListFilter])

  // Load image URLs into cache for a batch of items
  const loadImageUrls = useCallback((imageItems: ClipboardItem[]) => {
    if (imageItems.length === 0) return
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
  }, [])

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
      loadImageUrls(result.filter(i => i.item_type === 'image'))
    }
    return result
  }, [fetchHistory, loadImageUrls])

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

  // Listen for add-to-snippets hotkey
  // The backend reads clipboard content and passes it as the event payload,
  // so this works even when the window is hidden and navigator.clipboard is unavailable.
  useEffect(() => {
    const handleAddToSnippetsHotkey = async (e: Event) => {
      const content = (e as CustomEvent<string>).detail
      if (content && content.trim()) {
        try {
          await invoke('add_snippet', {
            content: content.trim(),
            alias: null
          })
          loadSnippets()
        } catch (error) {
          console.error('[PowerClip] Failed to add to snippets via hotkey:', error)
        }
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

      // Scroll reset is handled by the listKey useEffect below

      if (items) {
        loadImageUrls(items.filter(i => i.item_type === 'image'))
      }

      setTimeout(() => inputRef.current?.focus(), settings.focus_delay_ms)
    }
    window.addEventListener('powerclip:window-shown', handler)
    return () => window.removeEventListener('powerclip:window-shown', handler)
  }, [fetchHistory, loadSnippets, loadImageUrls, settings.focus_delay_ms])

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
        <div className="flex items-center gap-3 px-4 py-3 bg-secondary">
          {/* Search icon */}
          <div style={{
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.6
          }}>
            <Search className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
          </div>

          {/* Search input */}
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={viewMode === 'snippets' ? "Search quick commands..." : semanticMode ? "Semantic search..." : "Search..."}
            className="flex-1 bg-transparent text-sm outline-none no-drag"
            style={{ color: 'var(--foreground)' }}
          />

          {/* Loading indicator */}
          {semanticLoading && (
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: 'var(--accent)' }} />
          )}

          {/* Error badge */}
          {semanticError && semanticMode && (
            <Badge variant="destructive" className="flex-shrink-0" title={semanticError}>
              <AlertCircle className="w-3 h-3 mr-1" />
              Search Error
            </Badge>
          )}

          {/* Clear search button */}
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="no-drag flex items-center justify-center rounded transition-all duration-150 hover:bg-white/10 active:scale-95"
              style={{ width: 28, height: 28, color: 'var(--muted-foreground)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted-foreground)'}
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* AI Search toggle */}
          <SemanticToggle
            enabled={settings.semantic_search_enabled && viewMode === 'history'}
            active={semanticMode}
            status={semanticStatus}
            onToggle={handleSemanticToggle}
            onRefreshStatus={loadSemanticStatus}
          />

          {/* Quick Commands toggle */}
          <button
            onClick={() => { setViewMode(prev => prev === 'history' ? 'snippets' : 'history'); setSearchQuery(''); setSelectedId(null); setSelectedSnippetId(null); }}
            className="no-drag flex items-center justify-center rounded transition-all duration-150 hover:bg-white/10 active:scale-95"
            style={{
              width: 32,
              height: 32,
              color: viewMode === 'snippets' ? 'var(--accent)' : 'var(--muted-foreground)',
              backgroundColor: viewMode === 'snippets' ? 'rgba(137, 180, 250, 0.15)' : 'transparent'
            }}
            title={`Toggle quick commands (${isDarwin ? 'Cmd' : 'Ctrl'}+P)`}
          >
            <Star className="w-4 h-4" fill={viewMode === 'snippets' ? 'currentColor' : 'none'} />
          </button>

          {/* Add snippet button */}
          {viewMode === 'snippets' && (
            <button
              onClick={() => setShowAddSnippetDialog(true)}
              className="no-drag flex items-center justify-center rounded transition-all duration-150 hover:bg-white/10 active:scale-95"
              style={{ width: 32, height: 32, color: 'var(--muted-foreground)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted-foreground)'}
              title="Add new quick command"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}

          {/* Settings button */}
          <button
            onClick={() => invoke('open_settings_file').catch(() => {})}
            className="no-drag flex items-center justify-center rounded transition-all duration-150 hover:bg-white/10 active:scale-95"
            style={{ width: 32, height: 32, color: 'var(--muted-foreground)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted-foreground)'}
            title="Edit config file (Cmd+,)"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </WindowDragHandler>

      {/* Extension Bar - inline, replaces smart list filters when active */}
      {showExtensions && viewMode === 'history' ? (
        <ExtensionBar
          extensions={settings.extensions}
          selectedItem={filteredItems.find(i => i.id === selectedId) || null}
          onClose={() => setShowExtensions(false)}
          onCloseWindow={() => { setShowExtensions(false); setSearchQuery(''); invoke('hide_window').catch(() => {}) }}
        />
      ) : viewMode === 'history' ? (
        <SmartLists
          activeFilter={smartListFilter}
          onFilterChange={setSmartListFilter}
          counts={smartListCounts}
        />
      ) : null}

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

      <ul key={listKey} ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin bg-background" onKeyDown={handleListKeyDown} tabIndex={0}>
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
                      isSelected={selectedSnippetId === snippet.id}
                      onSelect={setSelectedSnippetId}
                      onCopy={copySnippet}
                      onDelete={deleteSnippet}
                      onEdit={handleEditSnippet}
                      contentTruncateLength={settings.content_truncate_length}
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
        semanticMode={semanticMode}
        viewMode={viewMode}
        hotkeyModifiers={settings.hotkey_modifiers}
        hotkeyKey={settings.hotkey_key}
        settingsError={settingsError}
        hasExtensions={settings.extensions.length > 0}
        hasSelection={selectedId !== null}
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
