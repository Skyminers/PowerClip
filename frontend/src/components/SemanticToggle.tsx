/**
 * AI semantic search button and popup panel
 * Click to show panel with status and setup guide for API-based embedding.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Lightbulb, Loader2, Check } from 'lucide-react'
import type { SemanticStatus } from '../types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface SemanticToggleProps {
  enabled: boolean
  active: boolean
  status: SemanticStatus | null
  onToggle: () => void
  onRefreshStatus: () => void
}

type SetupStep = 'enable' | 'configure_api' | 'indexing' | 'ready'

function getSetupStep(enabled: boolean, status: SemanticStatus | null): SetupStep {
  if (!enabled) return 'enable'
  if (!status) return 'enable'
  if (!status.api_configured) return 'configure_api'
  if (status.indexing_in_progress) return 'indexing'
  return 'ready'
}

export function SemanticToggle({
  enabled,
  active,
  status,
  onToggle,
  onRefreshStatus,
}: SemanticToggleProps) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const step = getSetupStep(enabled, status)
  const isReady = step === 'ready'

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  // Periodically refresh status during indexing
  useEffect(() => {
    if (!open) return
    if (step !== 'indexing') return
    const interval = setInterval(onRefreshStatus, 2000)
    return () => clearInterval(interval)
  }, [open, step, onRefreshStatus])

  // Refresh status when enabled changes
  useEffect(() => {
    if (enabled) onRefreshStatus()
  }, [enabled, onRefreshStatus])

  const handleButtonClick = useCallback(() => {
    if (isReady) {
      onToggle()
    } else {
      onRefreshStatus()
      setOpen(prev => !prev)
    }
  }, [isReady, onToggle, onRefreshStatus])

  const handleOpenSettings = useCallback(() => {
    invoke('open_settings_file').catch(() => {})
  }, [])

  const handleStartIndexing = useCallback(() => {
    invoke('start_bulk_indexing')
      .then(() => setTimeout(onRefreshStatus, 500))
      .catch(() => {})
  }, [onRefreshStatus])

  const dotColor = (() => {
    switch (step) {
      case 'ready': return active ? '#fff' : '#4ade80'
      case 'indexing': return '#facc15'
      default: return 'var(--muted-foreground)'
    }
  })()

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all no-drag",
          active ? "bg-primary text-white" : "border border-border bg-transparent text-muted-foreground",
          !enabled && "opacity-50"
        )}
        onClick={handleButtonClick}
        title={isReady ? (active ? 'Disable AI search' : 'Enable AI search') : 'AI search setup'}
      >
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors"
          style={{ backgroundColor: dotColor }}
        />
        <Lightbulb className="w-3.5 h-3.5" />
        <span>AI</span>
      </button>

      {/* Popup panel */}
      {open && (
        <div
          ref={panelRef}
          className="no-drag absolute top-[calc(100%+8px)] right-0 w-80 bg-popover rounded-lg shadow-lg z-50 overflow-hidden animate-fade-in"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08)' }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 mb-1">
              <Lightbulb className="w-4 h-4 text-accent" />
              <span className="text-sm font-semibold text-foreground">AI Semantic Search</span>
            </div>
            <span className="text-xs text-muted-foreground leading-relaxed">
              Search clipboard content using natural language via embedding API
            </span>
          </div>

          {/* Step content */}
          <div className="p-3">
            {step === 'enable' && (
              <StepCard
                stepNum={1}
                title="Enable AI Search"
                description='Set "semantic_search_enabled": true in settings, then save the file.'
                action="Open Settings File"
                onAction={handleOpenSettings}
              />
            )}

            {step === 'configure_api' && (
              <div>
                <StepLabel stepNum={2} title="Configure Embedding API" />
                <p className="text-xs text-muted-foreground leading-relaxed ml-7 mb-2.5">
                  Set your API credentials in the settings file:
                </p>
                <div className="ml-7 p-2.5 bg-muted rounded-md text-[10px] text-muted-foreground font-mono leading-relaxed mb-2.5">
                  <div><span className="text-accent">"embedding_api_url"</span>: "https://api.openai.com/v1"</div>
                  <div><span className="text-accent">"embedding_api_key"</span>: "sk-..."</div>
                  <div><span className="text-accent">"embedding_api_model"</span>: "text-embedding-3-small"</div>
                </div>
                <Button
                  size="sm"
                  onClick={handleOpenSettings}
                  className="ml-7"
                >
                  Open Settings File
                </Button>
                <p className="text-[10px] text-muted-foreground leading-relaxed mt-2 ml-7">
                  Compatible with OpenAI, Azure OpenAI, and any OpenAI-compatible API.
                </p>
              </div>
            )}

            {step === 'indexing' && (
              <div>
                <StepLabel stepNum={3} title={`Indexing history (${status?.indexed_count ?? 0}/${status?.total_text_count ?? 0})`} />
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Indexing runs in background, you can close this</span>
                </div>
              </div>
            )}

            {step === 'ready' && (
              <div>
                <div className="flex items-center gap-2 p-2 rounded-md bg-green-500/10 mb-2.5">
                  <Check className="w-3 h-3 text-green-400" />
                  <span className="text-xs text-green-400 font-medium">AI Search Ready</span>
                </div>
                <span className="text-xs text-muted-foreground leading-relaxed">
                  {status?.indexed_count ?? 0} text records indexed. Click AI button to toggle search mode.
                </span>
                <div className="flex gap-2 mt-2.5">
                  <Button
                    size="sm"
                    className="flex-1"
                    variant={active ? "outline" : "default"}
                    onClick={() => { onToggle(); setOpen(false) }}
                  >
                    {active ? 'Disable AI Search' : 'Enable AI Search'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleStartIndexing}
                    title="Index any clipboard items not yet embedded"
                  >
                    Re-index
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border flex justify-end">
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---- Sub-components ---- */

function StepLabel({ stepNum, title }: { stepNum: number; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="w-5 h-5 rounded-full bg-primary text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
        {stepNum}
      </span>
      <span className="text-xs font-medium text-foreground">{title}</span>
    </div>
  )
}

function StepCard({
  stepNum, title, description, action, onAction,
}: {
  stepNum: number
  title: string
  description: string
  action: string
  onAction: () => void
}) {
  return (
    <div>
      <StepLabel stepNum={stepNum} title={title} />
      <p className="text-xs text-muted-foreground leading-relaxed ml-7 mb-2.5">
        {description}
      </p>
      <Button
        size="sm"
        onClick={onAction}
        className="ml-7"
      >
        {action}
      </Button>
    </div>
  )
}
