/**
 * Tests for utility helper functions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatTime, formatContent, formatFilePaths, getPreview } from '../utils/helpers'

// ─── formatTime ────────────────────────────────────────────────────────────

describe('formatTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "Just now" for timestamps less than 1 minute ago', () => {
    const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString()
    expect(formatTime(thirtySecondsAgo)).toBe('Just now')
  })

  it('returns "Just now" for timestamps exactly 0 seconds ago', () => {
    expect(formatTime(new Date().toISOString())).toBe('Just now')
  })

  it('returns minutes ago for 1–59 minutes', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(formatTime(fiveMinutesAgo)).toBe('5 min ago')

    const oneMinuteAgo = new Date(Date.now() - 60_001).toISOString()
    expect(formatTime(oneMinuteAgo)).toBe('1 min ago')

    const fiftyNineMinutesAgo = new Date(Date.now() - 59 * 60_000).toISOString()
    expect(formatTime(fiftyNineMinutesAgo)).toBe('59 min ago')
  })

  it('returns singular "1 hour ago" for exactly 60 minutes', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString()
    expect(formatTime(oneHourAgo)).toBe('1 hour ago')
  })

  it('returns plural "N hours ago" for 2–23 hours', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString()
    expect(formatTime(twoHoursAgo)).toBe('2 hours ago')

    const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60_000).toISOString()
    expect(formatTime(twentyThreeHoursAgo)).toBe('23 hours ago')
  })

  it('returns "Yesterday" for timestamps 1–2 days ago', () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60_000 - 60_000).toISOString()
    expect(formatTime(oneDayAgo)).toBe('Yesterday')
  })

  it('returns "N days ago" for 2–6 days', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString()
    expect(formatTime(threeDaysAgo)).toBe('3 days ago')

    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60_000).toISOString()
    expect(formatTime(sixDaysAgo)).toBe('6 days ago')
  })

  it('returns a locale date string for timestamps 7+ days ago', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString()
    const result = formatTime(twoWeeksAgo)
    // Should be a locale-formatted date, not a relative string
    expect(result).not.toMatch(/ago|now|Yesterday/)
    expect(result.length).toBeGreaterThan(3)
  })

  it('handles legacy "YYYY-MM-DD HH:MM:SS" format (space instead of T)', () => {
    // Build a timestamp 5 minutes ago using the space-separator legacy format
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000)
    // Format as "YYYY-MM-DD HH:MM:SS" in local time (legacy storage format)
    const pad = (n: number) => String(n).padStart(2, '0')
    const legacyTimestamp =
      `${fiveMinutesAgo.getFullYear()}-${pad(fiveMinutesAgo.getMonth() + 1)}-${pad(fiveMinutesAgo.getDate())}` +
      ` ${pad(fiveMinutesAgo.getHours())}:${pad(fiveMinutesAgo.getMinutes())}:${pad(fiveMinutesAgo.getSeconds())}`
    expect(formatTime(legacyTimestamp)).toBe('5 min ago')
  })

  it('returns the original string for completely invalid timestamps', () => {
    expect(formatTime('not-a-date')).toBe('not-a-date')
  })

  it('handles future timestamps gracefully (returns "Just now")', () => {
    const futureTimestamp = new Date(Date.now() + 10 * 60_000).toISOString()
    // diff is negative, minutes < 1 → "Just now"
    expect(formatTime(futureTimestamp)).toBe('Just now')
  })
})

// ─── formatFilePaths ───────────────────────────────────────────────────────

describe('formatFilePaths', () => {
  it('returns "No files" for an empty array', () => {
    expect(formatFilePaths(JSON.stringify([]))).toBe('No files')
  })

  it('returns the filename for a single Unix path', () => {
    expect(formatFilePaths(JSON.stringify(['/home/user/documents/report.pdf']))).toBe('report.pdf')
  })

  it('returns the filename for a single Windows path', () => {
    expect(formatFilePaths(JSON.stringify(['C:\\Users\\user\\Documents\\report.pdf']))).toBe('report.pdf')
  })

  it('truncates long single filenames with ellipsis prefix', () => {
    const longFilename = 'a'.repeat(60) + '.txt'
    const result = formatFilePaths(JSON.stringify([`/home/user/${longFilename}`]))
    expect(result.startsWith('...')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(50)
  })

  it('does not truncate filenames within the limit', () => {
    expect(formatFilePaths(JSON.stringify(['/home/user/short.txt']))).toBe('short.txt')
  })

  it('shows first filename and count for multiple files', () => {
    const files = [
      '/home/user/file1.txt',
      '/home/user/file2.txt',
      '/home/user/file3.txt',
    ]
    const result = formatFilePaths(JSON.stringify(files))
    expect(result).toContain('+2 more')
    expect(result).toContain('file1.txt')
  })

  it('truncates first filename when displaying multiple files', () => {
    const longFirst = 'a'.repeat(25) + '.txt'
    const files = [`/home/${longFirst}`, '/home/second.txt']
    const result = formatFilePaths(JSON.stringify(files))
    expect(result).toContain('+1 more')
    expect(result.length).toBeLessThan(longFirst.length + 20)
  })

  it('falls back gracefully on invalid JSON', () => {
    const result = formatFilePaths('not-json')
    expect(result).toBe('not-json'.slice(0, 50))
  })

  it('uses the custom truncateLength parameter', () => {
    const files = ['/home/user/a'.repeat(10) + '.txt']
    const defaultResult = formatFilePaths(JSON.stringify(files))
    const shortResult = formatFilePaths(JSON.stringify(files), 10)
    expect(shortResult.length).toBeLessThanOrEqual(defaultResult.length)
  })
})

// ─── formatContent ─────────────────────────────────────────────────────────

describe('formatContent', () => {
  it('truncates long text with ellipsis', () => {
    const longText = 'a'.repeat(100)
    const result = formatContent(longText, 'text')
    expect(result).toHaveLength(53) // 50 chars + "..."
    expect(result.endsWith('...')).toBe(true)
  })

  it('does not truncate short text', () => {
    const short = 'Hello, world!'
    expect(formatContent(short, 'text')).toBe(short)
  })

  it('replaces newlines with spaces in text', () => {
    const multiline = 'line1\nline2\nline3'
    const result = formatContent(multiline, 'text')
    expect(result).toBe('line1 line2 line3')
  })

  it('formats file type via formatFilePaths', () => {
    const files = JSON.stringify(['/home/user/doc.pdf'])
    const result = formatContent(files, 'file')
    expect(result).toBe('doc.pdf')
  })

  it('returns image placeholder for image type', () => {
    const hash = 'abc123hash456'
    const result = formatContent(hash, 'image')
    expect(result.startsWith('[Image]')).toBe(true)
  })

  it('respects custom truncateLength', () => {
    const text = 'a'.repeat(30)
    const result = formatContent(text, 'text', 20)
    expect(result).toBe('a'.repeat(20) + '...')
  })
})

// ─── getPreview ────────────────────────────────────────────────────────────

describe('getPreview', () => {
  it('returns full content when within maxLength', () => {
    const short = 'Hello!'
    expect(getPreview(short)).toBe(short)
  })

  it('truncates content that exceeds maxLength', () => {
    const long = 'x'.repeat(250)
    const result = getPreview(long)
    expect(result.endsWith('...')).toBe(true)
    expect(result.length).toBe(203) // 200 + "..."
  })

  it('respects custom maxLength', () => {
    const text = 'abcdefgh'
    const result = getPreview(text, 5)
    expect(result).toBe('abcde...')
  })

  it('returns the string unchanged when exactly at maxLength', () => {
    const text = 'a'.repeat(200)
    expect(getPreview(text)).toBe(text)
    expect(getPreview(text).endsWith('...')).toBe(false)
  })
})
