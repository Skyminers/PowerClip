/**
 * 辅助函数集合
 */

import { CONTENT_TRUNCATE_LENGTH } from '../constants'

/** 格式化时间为相对时间 */
export function formatTime(createdAt: string): string {
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

/** 格式化内容为简短显示 */
export function formatContent(content: string, type: string): string {
  if (type === 'text') {
    const text = content.replace(/\n/g, ' ')
    return text.length > CONTENT_TRUNCATE_LENGTH
      ? text.slice(0, CONTENT_TRUNCATE_LENGTH) + '...'
      : text
  }
  return `[图片] ${content.slice(0, 12)}...`
}

/** 生成预览文本 */
export function getPreview(content: string, maxLength: number = 200): string {
  return content.length > maxLength
    ? content.slice(0, maxLength) + '...'
    : content
}
