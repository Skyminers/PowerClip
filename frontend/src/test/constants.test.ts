import { describe, it, expect } from 'vitest'
import {
  CONTENT_TRUNCATE_LENGTH,
  IMAGE_PREVIEW_MAX_WIDTH,
  IMAGE_PREVIEW_MAX_HEIGHT,
  MAX_HISTORY_FETCH,
  FOCUS_DELAY_MS,
  SEMANTIC_SEARCH_DEBOUNCE_MS,
  MAX_SHORTCUT_INDEX,
  WINDOW_MIN_WIDTH,
  WINDOW_MIN_HEIGHT,
  WINDOW_MAX_WIDTH,
  WINDOW_MAX_HEIGHT,
} from '../constants'

describe('constants', () => {
  describe('content display constants', () => {
    it('should have positive truncate length', () => {
      expect(CONTENT_TRUNCATE_LENGTH).toBeGreaterThan(0)
      expect(CONTENT_TRUNCATE_LENGTH).toBe(50)
    })

    it('should have positive image preview dimensions', () => {
      expect(IMAGE_PREVIEW_MAX_WIDTH).toBeGreaterThan(0)
      expect(IMAGE_PREVIEW_MAX_HEIGHT).toBeGreaterThan(0)
      expect(IMAGE_PREVIEW_MAX_WIDTH).toBe(120)
      expect(IMAGE_PREVIEW_MAX_HEIGHT).toBe(80)
    })
  })

  describe('history constants', () => {
    it('should have positive max history fetch', () => {
      expect(MAX_HISTORY_FETCH).toBeGreaterThan(0)
      expect(MAX_HISTORY_FETCH).toBe(10000)
    })
  })

  describe('timing constants', () => {
    it('should have positive focus delay', () => {
      expect(FOCUS_DELAY_MS).toBeGreaterThan(0)
      expect(FOCUS_DELAY_MS).toBe(50)
    })

    it('should have positive semantic search debounce', () => {
      expect(SEMANTIC_SEARCH_DEBOUNCE_MS).toBeGreaterThan(0)
      expect(SEMANTIC_SEARCH_DEBOUNCE_MS).toBe(300)
    })
  })

  describe('shortcut constants', () => {
    it('should have valid max shortcut index', () => {
      expect(MAX_SHORTCUT_INDEX).toBeGreaterThan(0)
      expect(MAX_SHORTCUT_INDEX).toBeLessThanOrEqual(9)
      expect(MAX_SHORTCUT_INDEX).toBe(9)
    })
  })

  describe('window constraint constants', () => {
    it('should have valid min window dimensions', () => {
      expect(WINDOW_MIN_WIDTH).toBeGreaterThan(0)
      expect(WINDOW_MIN_HEIGHT).toBeGreaterThan(0)
      expect(WINDOW_MIN_WIDTH).toBe(300)
      expect(WINDOW_MIN_HEIGHT).toBe(200)
    })

    it('should have valid max window dimensions (no upper limit by design)', () => {
      expect(WINDOW_MAX_WIDTH).toBeGreaterThan(WINDOW_MIN_WIDTH)
      expect(WINDOW_MAX_HEIGHT).toBeGreaterThan(WINDOW_MIN_HEIGHT)
      // Max dimensions are intentionally large (10000) to allow unlimited resizing
      expect(WINDOW_MAX_WIDTH).toBeGreaterThanOrEqual(800)
      expect(WINDOW_MAX_HEIGHT).toBeGreaterThanOrEqual(600)
    })

    it('should have min dimensions less than max dimensions', () => {
      expect(WINDOW_MIN_WIDTH).toBeLessThan(WINDOW_MAX_WIDTH)
      expect(WINDOW_MIN_HEIGHT).toBeLessThan(WINDOW_MAX_HEIGHT)
    })
  })
})
