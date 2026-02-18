/**
 * 窗口拖拽区域包装器
 * 使用 data-tauri-drag-region 属性 + startDragging API
 */

import { getCurrentWindow } from '@tauri-apps/api/window'

export function WindowDragHandler({ children }: { children: React.ReactNode }) {
  const handleMouseDown = async (e: React.MouseEvent) => {
    // 只允许左键拖拽
    if (e.button !== 0) return

    const target = e.target as HTMLElement

    // 不在交互元素上触发拖拽
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('input') ||
      target.closest('button')
    ) {
      return
    }

    console.log('[Drag] Mouse down, starting drag')
    try {
      await getCurrentWindow().startDragging()
      console.log('[Drag] Drag started successfully')
    } catch (error) {
      console.error('[Drag] Failed to start dragging:', error)
    }
  }

  return (
    <div
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
