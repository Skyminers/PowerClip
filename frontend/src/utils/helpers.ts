/**
 * Helper functions collection
 */

import { CONTENT_TRUNCATE_LENGTH } from '../constants'

/** Format time as relative time */
export function formatTime(createdAt: string): string {
  try {
    const date = new Date(createdAt)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes} min ago`
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hours ago`
    return date.toLocaleDateString()
  } catch {
    return createdAt
  }
}

/** Format content for display */
export function formatContent(content: string, type: string): string {
  if (type === 'text') {
    const text = content.replace(/\n/g, ' ')
    return text.length > CONTENT_TRUNCATE_LENGTH
      ? text.slice(0, CONTENT_TRUNCATE_LENGTH) + '...'
      : text
  }
  return `[Image] ${content.slice(0, 12)}...`
}

/** Generate preview text */
export function getPreview(content: string, maxLength: number = 200): string {
  return content.length > maxLength
    ? content.slice(0, maxLength) + '...'
    : content
}
