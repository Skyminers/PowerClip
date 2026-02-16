/**
 * 状态栏组件
 * 显示剪贴板统计和快捷键提示
 */

import { theme } from '../theme'

const colors = theme.colors

export function StatusBar({
  totalCount,
  filteredCount,
  hasSearchQuery,
  isDarwin
}: {
  totalCount: number
  filteredCount: number
  hasSearchQuery: boolean
  isDarwin: boolean
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2 text-xs" style={{ backgroundColor: colors.bgSecondary }}>
      <div className="flex items-center gap-4" style={{ color: colors.textMuted }}>
        <span>{filteredCount} / {totalCount} 条</span>
        {hasSearchQuery && <span style={{ color: colors.accent }}>筛选模式</span>}
      </div>
      <div className="flex items-center gap-4" style={{ color: colors.textMuted }}>
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: colors.bgHover }}>/</kbd>搜索
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: colors.bgHover }}>Esc</kbd>关闭
        </span>
        <span>{isDarwin ? '⌘⇧V' : 'Ctrl+Shift+V'}</span>
      </div>
    </div>
  )
}
