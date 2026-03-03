/**
 * Window resize handle
 */

import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT, WINDOW_MAX_WIDTH, WINDOW_MAX_HEIGHT } from '../constants'

export function ResizeHandle() {
  const handleMouseDown = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      const window = getCurrentWindow()
      const currentState = await invoke<{ width: number; height: number; x: number; y: number }>('get_window_state')
      const startX = e.clientX
      const startY = e.clientY
      const startWidth = currentState.width
      const startHeight = currentState.height

      let lastWidth = startWidth
      let lastHeight = startHeight
      let rafId: number | null = null
      let pendingWidth = startWidth
      let pendingHeight = startHeight

      const onMouseMove = (moveEvent: MouseEvent) => {
        const newWidth = startWidth + (moveEvent.clientX - startX)
        const newHeight = startHeight + (moveEvent.clientY - startY)
        pendingWidth = Math.max(WINDOW_MIN_WIDTH, Math.min(WINDOW_MAX_WIDTH, newWidth))
        pendingHeight = Math.max(WINDOW_MIN_HEIGHT, Math.min(WINDOW_MAX_HEIGHT, newHeight))

        // Use requestAnimationFrame for smooth updates
        if (!rafId) {
          rafId = requestAnimationFrame(async () => {
            rafId = null
            if (pendingWidth !== lastWidth || pendingHeight !== lastHeight) {
              lastWidth = pendingWidth
              lastHeight = pendingHeight
              try {
                await window.setSize({
                  type: 'Physical',
                  data: { width: pendingWidth, height: pendingHeight }
                })
              } catch {
                // Ignore resize errors
              }
            }
          })
        }
      }

      const onMouseUp = () => {
        if (rafId) {
          cancelAnimationFrame(rafId)
        }
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        invoke('save_window_state').catch(console.error)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    } catch (error) {
      console.error('Failed to start resize:', error)
    }
  }

  return <div className="resize-handle" onMouseDown={handleMouseDown} title="Drag to resize" />
}
