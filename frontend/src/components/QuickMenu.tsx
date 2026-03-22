/**
 * Quick Menu Component
 * A minimal popup for quick access to recent clipboard items
 * Apple-inspired design with subtle interactions
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { FileText, Image, File } from 'lucide-react'
import type { ClipboardItem, ImageCache } from '../types'
import { formatContent, formatTime } from '../utils/helpers'
import { cn } from '@/lib/utils'

interface QuickMenuProps {
  items: ClipboardItem[]
  imageCache: ImageCache
}

export function QuickMenu({ items, imageCache }: QuickMenuProps) {
  const [visible, setVisible] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)

  // Show quick menu
  const show = useCallback(async () => {
    await invoke('show_quick_menu')
    setVisible(true)
    setSelectedIndex(0)
  }, [])

  // Hide quick menu
  const hide = useCallback(async () => {
    await invoke('hide_quick_menu')
    setVisible(false)
  }, [])

  // Listen for quick menu events
  useEffect(() => {
    const unlisten = listen('powerclip:show-quick-menu', () => {
      show()
    })

    const unlistenHide = listen('powerclip:hide-quick-menu', () => {
      setVisible(false)
    })

    return () => {
      unlisten.then(fn => fn())
      unlistenHide.then(fn => fn())
    }
  }, [show])

  // Handle keyboard navigation
  useEffect(() => {
    if (!visible) return

    const handleKeyDown = async (e: KeyboardEvent) => {
      const displayItems = items.slice(0, 8)

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault()
          const nextIndex = await invoke<number>('quick_menu_select_next', {
            totalItems: displayItems.length
          })
          setSelectedIndex(nextIndex)
          break

        case 'ArrowUp':
        case 'k':
          e.preventDefault()
          const prevIndex = await invoke<number>('quick_menu_select_prev', {
            totalItems: displayItems.length
          })
          setSelectedIndex(prevIndex)
          break

        case 'Enter':
          e.preventDefault()
          if (displayItems.length > 0) {
            try {
              await invoke('quick_menu_copy_selected', { items: displayItems })
              setVisible(false)
            } catch (err) {
              console.error('Failed to copy selected:', err)
            }
          }
          break

        case 'Escape':
          e.preventDefault()
          hide()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, items, hide])

  // Hide on blur
  useEffect(() => {
    if (!visible) return

    const handleBlur = () => {
      hide()
    }

    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [visible, hide])

  if (!visible) return null

  const displayItems = items.slice(0, 8)

  // Get icon based on item type
  const ItemIcon = (item: ClipboardItem) => {
    if (item.item_type === 'image') return Image
    if (item.item_type === 'file') return File
    return FileText
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)'
      }}
      onClick={hide}
    >
      <div
        ref={menuRef}
        className="rounded-xl overflow-hidden"
        style={{
          width: '400px',
          maxHeight: '400px',
          backgroundColor: 'var(--background)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.1)',
          animation: 'scaleIn 0.15s ease'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{
            backgroundColor: 'var(--secondary)',
            borderBottom: '1px solid var(--border)'
          }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            Quick Menu
          </span>
          <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            ↑↓ Navigate · Enter Select · Esc Close
          </span>
        </div>

        {/* Items list */}
        <div className="overflow-y-auto scrollbar-thin" style={{ maxHeight: '350px' }}>
          {displayItems.length === 0 ? (
            <div
              className="px-4 py-10 text-center text-sm"
              style={{ color: 'var(--muted-foreground)' }}
            >
              No items in clipboard
            </div>
          ) : (
            displayItems.map((item, index) => {
              const Icon = ItemIcon(item)
              const isSelected = index === selectedIndex

              return (
                <div
                  key={item.id}
                  className={cn(
                    "px-4 py-3 flex items-center gap-3 cursor-pointer transition-all duration-150",
                    isSelected && "selected-indicator"
                  )}
                  style={{
                    backgroundColor: isSelected ? 'var(--selected)' : 'transparent'
                  }}
                  onClick={async () => {
                    setSelectedIndex(index)
                    try {
                      await invoke('quick_menu_copy_selected', { items: displayItems })
                      setVisible(false)
                    } catch (err) {
                      console.error('Failed to copy selected:', err)
                    }
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  {/* Type icon */}
                  <div style={{
                    width: 20,
                    height: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isSelected ? 1 : 0.6
                  }}>
                    <Icon
                      className="w-4 h-4"
                      style={{
                        color: isSelected ? 'var(--foreground)' : 'var(--muted-foreground)'
                      }}
                    />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {item.item_type === 'image' ? (
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs"
                          style={{ color: 'var(--muted-foreground)' }}
                        >
                          Image
                        </span>
                        {imageCache[item.content] && (
                          <img
                            src={imageCache[item.content]}
                            alt="Preview"
                            style={{
                              maxWidth: '60px',
                              maxHeight: '32px',
                              objectFit: 'contain',
                              borderRadius: 4
                            }}
                          />
                        )}
                      </div>
                    ) : (
                      <p
                        className="text-sm truncate"
                        style={{
                          color: 'var(--foreground)',
                          lineHeight: 1.4
                        }}
                      >
                        {formatContent(item.content, item.item_type, 50)}
                      </p>
                    )}
                  </div>

                  {/* Time */}
                  <span
                    className="text-xs flex-shrink-0"
                    style={{ color: 'var(--muted-foreground)' }}
                  >
                    {formatTime(item.created_at)}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
