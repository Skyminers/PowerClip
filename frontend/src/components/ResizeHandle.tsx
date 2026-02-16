/**
 * 窗口调整大小手柄
 */

import { invoke } from '@tauri-apps/api/core'

export function ResizeHandle() {
  const handleMouseDown = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      const currentState = await invoke<{ width: number; height: number; x: number; y: number }>('get_window_state')
      const startX = e.clientX
      const startY = e.clientY
      const startWidth = currentState.width
      const startHeight = currentState.height

      const onMouseMove = async (moveEvent: MouseEvent) => {
        const newWidth = startWidth + (moveEvent.clientX - startX)
        const newHeight = startHeight + (moveEvent.clientY - startY)
        const clampedWidth = Math.max(300, Math.min(800, newWidth))
        const clampedHeight = Math.max(200, Math.min(600, newHeight))
        await invoke('resize_window', { width: clampedWidth, height: clampedHeight })
      }

      const onMouseUp = () => {
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

  return <div className="resize-handle" onMouseDown={handleMouseDown} title="拖拽调整大小" />
}
