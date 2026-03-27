/**
 * Smart Lists Component
 * Quick filters for clipboard items by type and time period
 * Apple-inspired design with subtle interactions
 */

import { memo, useRef, useEffect } from 'react'
import { List, Clock, Calendar, FileText, Image, Folder, Pin } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SmartListFilter = 'all' | 'pinned' | 'today' | 'week' | 'text' | 'image' | 'file'

interface SmartListOption {
  id: SmartListFilter
  label: string
  icon: React.ReactNode
  description: string
}

const options: SmartListOption[] = [
  {
    id: 'all',
    label: 'All',
    icon: <List className="w-3.5 h-3.5" />,
    description: 'All items'
  },
  {
    id: 'pinned',
    label: 'Pinned',
    icon: <Pin className="w-3.5 h-3.5" />,
    description: 'Pinned items'
  },
  {
    id: 'today',
    label: 'Today',
    icon: <Clock className="w-3.5 h-3.5" />,
    description: 'Items from today'
  },
  {
    id: 'week',
    label: 'Week',
    icon: <Calendar className="w-3.5 h-3.5" />,
    description: 'Items from this week'
  },
  {
    id: 'text',
    label: 'Text',
    icon: <FileText className="w-3.5 h-3.5" />,
    description: 'Text items only'
  },
  {
    id: 'image',
    label: 'Images',
    icon: <Image className="w-3.5 h-3.5" />,
    description: 'Image items only'
  },
  {
    id: 'file',
    label: 'Files',
    icon: <Folder className="w-3.5 h-3.5" />,
    description: 'File items only'
  }
]

interface SmartListsProps {
  activeFilter: SmartListFilter
  onFilterChange: (filter: SmartListFilter) => void
  counts?: {
    all: number
    pinned: number
    today: number
    week: number
    text: number
    image: number
    file: number
  }
}

export const SmartLists = memo(function SmartLists({
  activeFilter,
  onFilterChange,
  counts
}: SmartListsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<Map<SmartListFilter, HTMLButtonElement>>(new Map())

  // Scroll to active filter when it changes
  useEffect(() => {
    const activeButton = buttonRefs.current.get(activeFilter)
    if (activeButton && containerRef.current) {
      const container = containerRef.current
      const buttonRect = activeButton.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()

      // Check if button is outside visible area
      const isOutsideLeft = buttonRect.left < containerRect.left
      const isOutsideRight = buttonRect.right > containerRect.right

      if (isOutsideLeft || isOutsideRight) {
        activeButton.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        })
      }
    }
  }, [activeFilter])

  return (
    <div className="flex justify-center overflow-hidden bg-secondary border-b border-border">
      <div ref={containerRef} className="flex items-center gap-0.5 px-2 py-1.5 overflow-x-auto scrollbar-thin">
        {options.map((option) => {
          const isActive = activeFilter === option.id
          const count = counts ? counts[option.id] : undefined

          return (
            <button
              key={option.id}
              ref={(el) => { if (el) buttonRefs.current.set(option.id, el) }}
              onClick={() => onFilterChange(option.id)}
              className={cn(
                "relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap transition-all duration-150",
                "hover:bg-white/8 active:scale-[0.98]",
                isActive && "bg-white/12 text-foreground font-medium",
                !isActive && "text-muted-foreground hover:text-foreground"
              )}
              title={option.description}
            >
              {/* Active indicator - left accent bar */}
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
              )}

              {/* Icon */}
              <span style={{ opacity: isActive ? 1 : 0.7, transition: 'opacity 0.15s ease' }}>
                {option.icon}
              </span>

              {/* Label */}
              <span>{option.label}</span>

              {/* Count badge - subtle */}
              {count !== undefined && count > 0 && (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded",
                    "transition-colors duration-150",
                    isActive
                      ? "bg-white/15 text-foreground"
                      : "bg-white/8 text-muted-foreground"
                  )}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
})
