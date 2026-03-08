/**
 * PowerClip - Main Application Component
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { ClipboardItem, Settings, ImageCache, SemanticStatus, Snippet } from './types'
import { theme } from './theme'
import { isDarwin } from './utils/platform'
import { useSemanticSearch } from './hooks/useSemanticSearch'

import {
  ResizeHandle,
  WindowDragHandler,
  EmptyState,
  StatusBar,
  ClipboardListItem,
  ExtensionSelector,
  SemanticToggle,
  SnippetListItem,
  AddSnippetDialog
} from './components'

const colors = theme.colors

function App() {

  // State
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [imageCache, setImageCache] = useState<ImageCache>({})
  const [showExtensions, setShowExtensions] = useState(false)
  const [semanticMode, setSemanticMode] = useState(false)
  const [semanticStatus, setSemanticStatus] = useState<SemanticStatus | null>(null)

  // Snippets state
  const [viewMode, setViewMode] = useState<'history' | 'snippets'>('history')
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [selectedSnippetId, setSelectedSnippetId] = useState<number | null>(null)
  const [addDialogItem, setAddDialogItem] = useState<ClipboardItem | null>(null)

  const [settings, setSettings] = useState<Settings>({
    auto_cleanup_enabled: false,
    max_items: 100,
    hotkey_modifiers: isDarwin ? 'Meta+Shift' : 'Control+Shift',
    hotkey_key: 'KeyV',
    window_opacity: 0.95,
    auto_paste_enabled: false,
    extensions: [],
    semantic_search_enabled: false,
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

  // Load settings
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
        setSearchQuery('')
        invoke('hide_window').catch(() => {})
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [addDialogItem])

  // List keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showExtensionsRef.current) return

    // Handle snippets mode
    if (viewModeRef.current === 'snippets') {
      const filteredSnippets = snippets.filter(s =>
        searchQuery.length === 0 ||
        s.content.toLowerCase().includes(searchLower) ||
        (s.alias && s.alias.toLowerCase().includes(searchLower))
      )
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
  }, [filteredItems, selectedId, selectedSnippetId, snippets, searchLower, searchQuery, settings.extensions.length, copyItem, copySnippet])

  // Load history
  const loadHistory = useCallback(async () => {
    try {
      const result = await invoke<ClipboardItem[]>('get_history', { limit: settings.max_history_fetch })
      setItems(result)

      // Load images asynchronously without blocking
      result.filter(i => i.item_type === 'image').forEach(item => {
        invoke<string>('get_image_asset_url', { relativePath: item.content })
          .then(url => setImageCache(prev => ({ ...prev, [item.content]: url })))
          .catch((error) => console.error('[PowerClip] Failed to load image:', error))
      })
    } catch (error) {
      console.error('[PowerClip] Failed to load history:', error)
    }
  }, [settings.max_history_fetch])

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
    const handler = () => {
      setShowExtensions(false)
      setViewMode('history')
      loadHistory()
      loadSnippets()
      if (listRef.current) listRef.current.scrollTop = 0
      setTimeout(() => inputRef.current?.focus(), settings.focus_delay_ms)
    }
    window.addEventListener('powerclip:window-shown', handler)
    return () => window.removeEventListener('powerclip:window-shown', handler)
  }, [loadHistory, loadSnippets, settings.focus_delay_ms])

  // Scroll to selected item
  useEffect(() => {
    const targetId = viewMode === 'snippets' ? selectedSnippetId : selectedId
    if (targetId !== null && listRef.current) {
      listRef.current.querySelector(`[data-id="${targetId}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedId, selectedSnippetId, viewMode])

  // Initial focus
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), settings.focus_delay_ms)
    return () => clearTimeout(t)
  }, [settings.focus_delay_ms])

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
            placeholder={viewMode === 'snippets' ? "Search quick commands..." : semanticMode ? "Semantic search..." : "Search..."}
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
              Search Error
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
            enabled={settings.semantic_search_enabled && viewMode === 'history'}
            active={semanticMode}
            status={semanticStatus}
            onToggle={handleSemanticToggle}
            onRefreshStatus={loadSemanticStatus}
          />
          <button
            onClick={() => { setViewMode(prev => prev === 'history' ? 'snippets' : 'history'); setSearchQuery(''); setSelectedId(null); setSelectedSnippetId(null); }}
            className={`p-1.5 rounded hover:bg-white/10 transition-colors flex-shrink-0 no-drag ${viewMode === 'snippets' ? 'bg-white/10' : ''}`}
            title={`Toggle quick commands (${isDarwin ? 'Cmd' : 'Ctrl'}+P)`}
            style={{ color: viewMode === 'snippets' ? colors.accent : colors.textMuted }}
          >
            <svg className="w-4 h-4" fill={viewMode === 'snippets' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>
          <button
            onClick={() => invoke('open_settings_file').catch(() => {})}
            className="p-1.5 rounded hover:bg-white/10 transition-colors flex-shrink-0 no-drag"
            title="Edit config file (Cmd+,)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
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

      {/* Add Snippet Dialog */}
      {addDialogItem && (
        <AddSnippetDialog
          item={addDialogItem}
          onConfirm={handleConfirmAddSnippet}
          onCancel={() => setAddDialogItem(null)}
        />
      )}

      <ul ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin" style={{ backgroundColor: colors.bg }} onKeyDown={handleKeyDown} tabIndex={0}>
        {viewMode === 'history' ? (
          <>
            {filteredItems.map((item, index) => (
              <ClipboardListItem
                key={item.id}
                item={item}
                index={index}
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
              />
            ))}
            {filteredItems.length === 0 && <EmptyState hasSearchQuery={searchQuery.length > 0} semanticMode={semanticMode} />}
          </>
        ) : (
          <>
            {snippets
              .filter(s =>
                searchQuery.length === 0 ||
                s.content.toLowerCase().includes(searchLower) ||
                (s.alias && s.alias.toLowerCase().includes(searchLower))
              )
              .map((snippet, index) => (
                <SnippetListItem
                  key={snippet.id}
                  snippet={snippet}
                  index={index}
                  isSelected={selectedSnippetId === snippet.id}
                  onSelect={setSelectedSnippetId}
                  onCopy={copySnippet}
                  onDelete={deleteSnippet}
                />
              ))}
            {snippets.filter(s =>
              searchQuery.length === 0 ||
              s.content.toLowerCase().includes(searchLower) ||
              (s.alias && s.alias.toLowerCase().includes(searchLower))
            ).length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <svg className="w-12 h-12 mb-4" style={{ color: colors.textMuted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                <p className="text-sm" style={{ color: colors.textMuted }}>
                  {searchQuery.length > 0 ? 'No matching quick commands' : 'No quick commands yet'}
                </p>
                <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
                  {searchQuery.length > 0 ? 'Try a different search term' : 'Click the star icon on a history item to add'}
                </p>
              </div>
            )}
          </>
        )}
      </ul>

      <StatusBar
        totalCount={viewMode === 'snippets' ? snippets.length : items.length}
        filteredCount={viewMode === 'snippets' ? snippets.filter(s =>
          searchQuery.length === 0 ||
          s.content.toLowerCase().includes(searchLower) ||
          (s.alias && s.alias.toLowerCase().includes(searchLower))
        ).length : filteredItems.length}
        hasSearchQuery={searchQuery.length > 0}
        isDarwin={isDarwin}
        semanticMode={semanticMode}
        viewMode={viewMode}
      />
      <ResizeHandle />
    </div>
  )
}

export default App
