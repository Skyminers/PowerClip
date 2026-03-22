/**
 * Window drag area wrapper
 * Uses data-tauri-drag-region attribute + startDragging API
 * Cross-platform: works on macOS and Windows
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

    // Also check for elements with no-drag class
    if (target.closest('.no-drag')) {
      return
    }

    try {
      const window = getCurrentWindow()
      // On Windows, we need to ensure the window is focused before dragging
      // This helps with the drag behavior on Windows
      await window.setFocus()
      await window.startDragging()
    } catch (error) {
      // Log for debugging but don't break the app
      console.debug('Window drag failed:', error)
    }
  }

  return (
    <div
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      style={{ WebkitAppRegion: 'drag', cursor: 'move' } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
