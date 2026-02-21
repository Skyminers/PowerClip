/**
 * 剪贴板列表项组件
 */

import { memo } from 'react'
import type { ClipboardItem, ImageCache } from '../types'
import { theme } from '../theme'
import { formatContent, formatTime, getPreview } from '../utils/helpers'
import { MAX_SHORTCUT_INDEX } from '../constants'
import { IconDocument, IconImage } from './icons'

const colors = theme.colors

/**
 * 格式化相似度分数为百分比
 * @param score 0.0 - 1.0 的相似度分数
 * @returns 0.00% - 100.00% 格式的字符串
 */
function formatScore(score: number): string {
  return (score * 100).toFixed(2) + '%'
}

export const ClipboardListItem = memo(function ClipboardListItem({
  item,
  index,
  isSelected,
  imageCache,
  semanticScore,
  onSelect,
  onCopy
}: {
  item: ClipboardItem
  index: number
  isSelected: boolean
  imageCache: ImageCache
  semanticScore?: number  // AI 搜索相似度分数 (0.0 - 1.0)
  onSelect: (id: number) => void
  onCopy: (item: ClipboardItem) => void
}) {
  return (
    <li
      data-id={item.id}
      className={`relative px-4 py-3 cursor-pointer transition-all duration-150 fade-in ${isSelected ? 'selected-pulse' : ''}`}
      style={{ backgroundColor: isSelected ? colors.selected : 'transparent' }}
      onClick={() => onSelect(item.id)}
      onDoubleClick={() => onCopy(item)}
    >
      <div className="flex items-start justify-between gap-3">
        {/* 内容区域 */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span
            className={`text-sm flex-shrink-0 mt-0.5 ${isSelected ? 'opacity-90' : ''}`}
            style={{ color: isSelected ? colors.text : colors.textMuted }}
          >
            {item.item_type === 'text' ? <IconDocument /> : <IconImage />}
          </span>
          <div className="flex-1 min-w-0">
            {item.item_type === 'text' ? (
              <>
                <p className="text-sm truncate" style={{ color: colors.text }}>
                  {formatContent(item.content, item.item_type)}
                </p>
                {isSelected && (
                  <p className="text-xs mt-1.5 line-clamp-2 opacity-70" style={{ color: colors.text }}>
                    {getPreview(item.content, 200)}
                  </p>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-xs" style={{ color: colors.textMuted }}>图片</p>
                {imageCache[item.content] ? (
                  <img
                    src={imageCache[item.content]}
                    alt="Clipboard image"
                    className="max-w-[120px] max-h-[80px] object-contain rounded border"
                    style={{ borderColor: colors.border }}
                  />
                ) : (
                  <span className="text-xs" style={{ color: colors.textMuted }}>加载中...</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 元数据区域 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* AI 搜索相似度分数 */}
          {semanticScore !== undefined && (
            <span
              className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{
                backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.15)',
                color: isSelected ? '#fff' : colors.accent
              }}
              title={`语义相似度: ${formatScore(semanticScore)}`}
            >
              {formatScore(semanticScore)}
            </span>
          )}
          {index < MAX_SHORTCUT_INDEX && (
            <span
              className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{
                backgroundColor: isSelected ? 'rgba(255,255,255,0.15)' : colors.bgSecondary,
                color: isSelected ? colors.text : colors.textMuted
              }}
            >
              {index + 1}
            </span>
          )}
          <span className="text-xs" style={{ color: colors.textMuted }}>
            {formatTime(item.created_at)}
          </span>
        </div>
      </div>
    </li>
  )
})
