/**
 * Helper functions collection
 */

/** Format time as relative time */
export function formatTime(createdAt: string): string {
  try {
    // Timestamps are stored as ISO 8601 ("YYYY-MM-DDTHH:MM:SS").
    // The replace is a no-op for current data and a fallback for legacy records.
    const date = new Date(createdAt.replace(' ', 'T'))
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

/** Format file paths for display */
export function formatFilePaths(content: string, truncateLength: number = 50): string {
  try {
    const paths: string[] = JSON.parse(content)
    if (paths.length === 0) return 'No files'
    // Support both Unix (/) and Windows (\) path separators
    const basename = (p: string) => p.split(/[/\\]/).filter(Boolean).pop() || p
    if (paths.length === 1) {
      const filename = basename(paths[0])
      return filename.length > truncateLength
        ? '...' + filename.slice(-(truncateLength - 3))
        : filename
    }
    // Multiple files - show count and first filename
    const firstFile = basename(paths[0])
    const truncated = firstFile.length > 20 ? firstFile.slice(0, 20) + '...' : firstFile
    return `${truncated} +${paths.length - 1} more`
  } catch {
    return content.slice(0, truncateLength)
  }
}

/** Format content for display */
export function formatContent(content: string, type: string, truncateLength: number = 50): string {
  if (type === 'file') {
    return formatFilePaths(content, truncateLength)
  }
  if (type === 'text') {
    const text = content.replace(/\n/g, ' ')
    return text.length > truncateLength
      ? text.slice(0, truncateLength) + '...'
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
