import { describe, it, expect } from 'vitest'
import type {
  ClipboardItem,
  Extension,
  Settings,
  SemanticStatus,
  SemanticSearchResult,
  LogEntry,
  LogLevel,
  Snippet,
} from '../types'

describe('types', () => {
  describe('ClipboardItem', () => {
    it('should have required properties', () => {
      const item: ClipboardItem = {
        id: 1,
        item_type: 'text',
        content: 'test content',
        hash: 'abc123',
        created_at: '2024-01-01 12:00:00',
      }

      expect(item.id).toBe(1)
      expect(item.item_type).toBe('text')
      expect(item.content).toBe('test content')
      expect(item.hash).toBe('abc123')
      expect(item.created_at).toBe('2024-01-01 12:00:00')
    })
  })

  describe('Extension', () => {
    it('should have required properties', () => {
      const ext: Extension = {
        name: 'Test Extension',
        command: 'echo test',
        timeout: 5000,
        close_on_success: true,
      }

      expect(ext.name).toBe('Test Extension')
      expect(ext.command).toBe('echo test')
      expect(ext.timeout).toBe(5000)
      expect(ext.close_on_success).toBe(true)
    })
  })

  describe('Settings', () => {
    it('should have required properties', () => {
      const settings: Settings = {
        auto_cleanup_enabled: true,
        max_items: 100,
        hotkey_modifiers: 'Meta+Shift',
        hotkey_key: 'KeyV',
        window_opacity: 0.95,
        auto_paste_enabled: false,
        extensions: [],
        semantic_search_enabled: false,
      }

      expect(settings.auto_cleanup_enabled).toBe(true)
      expect(settings.max_items).toBe(100)
      expect(settings.hotkey_modifiers).toBe('Meta+Shift')
      expect(settings.hotkey_key).toBe('KeyV')
      expect(settings.window_opacity).toBeCloseTo(0.95)
      expect(settings.auto_paste_enabled).toBe(false)
      expect(settings.extensions).toEqual([])
      expect(settings.semantic_search_enabled).toBe(false)
    })
  })

  describe('SemanticStatus', () => {
    it('should have required properties', () => {
      const status: SemanticStatus = {
        model_downloaded: true,
        model_loaded: false,
        download_progress: 0.5,
        indexed_count: 100,
        total_text_count: 200,
        indexing_in_progress: false,
        enabled: true,
      }

      expect(status.model_downloaded).toBe(true)
      expect(status.model_loaded).toBe(false)
      expect(status.download_progress).toBe(0.5)
      expect(status.indexed_count).toBe(100)
      expect(status.total_text_count).toBe(200)
      expect(status.indexing_in_progress).toBe(false)
      expect(status.enabled).toBe(true)
    })

    it('should allow null download_progress', () => {
      const status: SemanticStatus = {
        model_downloaded: false,
        model_loaded: false,
        download_progress: null,
        indexed_count: 0,
        total_text_count: 0,
        indexing_in_progress: false,
        enabled: false,
      }

      expect(status.download_progress).toBeNull()
    })
  })

  describe('SemanticSearchResult', () => {
    it('should have required properties', () => {
      const result: SemanticSearchResult = {
        item: {
          id: 1,
          item_type: 'text',
          content: 'test',
          hash: 'abc',
          created_at: '2024-01-01',
        },
        score: 0.95,
      }

      expect(result.item.id).toBe(1)
      expect(result.score).toBeCloseTo(0.95)
    })
  })

  describe('LogEntry', () => {
    it('should have required properties', () => {
      const entry: LogEntry = {
        timestamp: '2024-01-01T12:00:00Z',
        level: 'INFO',
        module: 'TestModule',
        message: 'Test message',
      }

      expect(entry.timestamp).toBe('2024-01-01T12:00:00Z')
      expect(entry.level).toBe('INFO')
      expect(entry.module).toBe('TestModule')
      expect(entry.message).toBe('Test message')
    })
  })

  describe('LogLevel', () => {
    it('should accept valid log levels', () => {
      const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARNING', 'ERROR']

      levels.forEach((level) => {
        expect(['DEBUG', 'INFO', 'WARNING', 'ERROR']).toContain(level)
      })
    })
  })

  describe('Snippet', () => {
    it('should have required properties with alias', () => {
      const snippet: Snippet = {
        id: 1,
        content: 'docker exec -it container bash',
        alias: 'Docker bash',
        created_at: '2024-01-01 12:00:00',
        updated_at: '2024-01-01 12:00:00',
      }

      expect(snippet.id).toBe(1)
      expect(snippet.content).toBe('docker exec -it container bash')
      expect(snippet.alias).toBe('Docker bash')
    })

    it('should allow null alias', () => {
      const snippet: Snippet = {
        id: 1,
        content: 'some command',
        alias: null,
        created_at: '2024-01-01 12:00:00',
        updated_at: '2024-01-01 12:00:00',
      }

      expect(snippet.alias).toBeNull()
    })
  })
})
