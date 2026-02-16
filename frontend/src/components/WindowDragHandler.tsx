/**
 * 窗口拖拽区域包装器
 */

import { getCurrentWindow } from '@tauri-apps/api/window'

export function WindowDragHandler({ children }: { children: React.ReactNode }) {
  const handleDragStart = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    // 不在交互元素上触发拖拽
    if (
      target.closest('.resize-handle') ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('input')
    ) {
      return
    }
    try {
      await getCurrentWindow().startDragging()
    } catch (error) {
      console.error('Failed to start dragging:', error)
    }
  }

  return (
    <div onMouseDown={handleDragStart} data-tauri-drag-region>
      {children}
    </div>
  )
}
