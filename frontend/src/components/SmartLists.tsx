/**
 * Smart Lists Component
 * Quick filters for clipboard items by type and time period
 */

import { memo, useRef, useEffect } from 'react'
import { List, Clock, Calendar, FileText, Image, Folder } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export type SmartListFilter = 'all' | 'today' | 'week' | 'text' | 'image' | 'file'

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
      <div ref={containerRef} className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto scrollbar-thin">
        {options.map((option) => {
          const isActive = activeFilter === option.id
          const count = counts ? counts[option.id] : undefined

          return (
            <button
              key={option.id}
              ref={(el) => { if (el) buttonRefs.current.set(option.id, el) }}
              onClick={() => onFilterChange(option.id)}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded text-xs whitespace-nowrap transition-colors button-press",
                isActive ? "font-medium bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              title={option.description}
            >
              {option.icon}
              <span>{option.label}</span>
              {count !== undefined && count > 0 && (
                <Badge
                  variant="muted"
                  className={cn("text-[10px]", isActive && "bg-white/10")}
                >
                  {count > 99 ? '99+' : count}
                </Badge>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
})
