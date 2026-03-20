/**
 * Smart Lists Component
 * Quick filters for clipboard items by type and time period
 */

import { memo } from 'react'
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
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto bg-secondary border-b border-border">
      {options.map((option) => {
        const isActive = activeFilter === option.id
        const count = counts ? counts[option.id] : undefined

        return (
          <button
            key={option.id}
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
  )
})
