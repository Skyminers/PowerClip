/**
 * Window drag area wrapper
 * Uses data-tauri-drag-region attribute + startDragging API
 */

import { getCurrentWindow } from '@tauri-apps/api/window'

export function WindowDragHandler({ children }: { children: React.ReactNode }) {
  const handleMouseDown = async (e: React.MouseEvent) => {
    // Only allow left-click drag
    if (e.button !== 0) return

    const target = e.target as HTMLElement

    // Don't trigger drag on interactive elements
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.closest('input') ||
      target.closest('button')
    ) {
      return
    }

    try {
      await getCurrentWindow().startDragging()
    } catch {
      // Drag may fail if window is not focused
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
