/**
 * AI semantic search button and popup panel
 * Apple-inspired design with subtle interactions and clean visuals
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

  // Status dot color and glow
  const getDotStyle = () => {
    switch (step) {
      case 'ready':
        return {
          backgroundColor: active ? '#fff' : '#4ade80',
          boxShadow: active ? '0 0 8px rgba(255,255,255,0.5)' : '0 0 6px rgba(74,222,128,0.5)'
        }
      case 'indexing':
        return {
          backgroundColor: '#facc15',
          boxShadow: '0 0 6px rgba(250,204,21,0.5)'
        }
      default:
        return {
          backgroundColor: 'var(--muted-foreground)',
          boxShadow: 'none'
        }
    }
  }

  return (
    <div className="relative">
      {/* Main button - icon only with status dot */}
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "relative flex items-center justify-center w-8 h-8 rounded-md transition-all duration-150 no-drag",
          "hover:bg-white/10 active:scale-95",
          active && "bg-accent/20",
          !enabled && "opacity-50"
        )}
        onClick={handleButtonClick}
        title={isReady ? (active ? 'Disable AI search' : 'Enable AI search') : 'AI search setup'}
      >
        <Lightbulb
          className="w-4 h-4"
          style={{
            color: active ? 'var(--accent)' : 'var(--muted-foreground)',
            transition: 'color 0.15s ease'
          }}
        />
        {/* Status dot */}
        <span
          className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full transition-all duration-200"
          style={getDotStyle()}
        />
      </button>

      {/* Popup panel */}
      {open && (
        <div
          ref={panelRef}
          className="no-drag absolute top-[calc(100%+8px)] right-0 w-80 rounded-xl z-50 overflow-hidden"
          style={{
            backgroundColor: 'var(--popover)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            animation: 'fadeIn 0.15s ease'
          }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2.5 mb-1">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center"
                style={{ backgroundColor: 'rgba(137, 180, 250, 0.15)' }}
              >
                <Lightbulb className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              </div>
              <span className="text-sm font-semibold text-foreground">AI Semantic Search</span>
            </div>
            <span className="text-xs text-muted-foreground leading-relaxed">
              Search clipboard content using natural language
            </span>
          </div>

          {/* Step content */}
          <div className="p-4">
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
                <p className="text-xs text-muted-foreground leading-relaxed ml-7 mb-3">
                  Set your API credentials in the settings file:
                </p>
                <div
                  className="ml-7 p-3 rounded-lg text-[10px] font-mono leading-relaxed mb-3"
                  style={{
                    backgroundColor: 'var(--muted)',
                    color: 'var(--muted-foreground)'
                  }}
                >
                  <div><span style={{ color: 'var(--accent)' }}>"embedding_api_url"</span>: "https://api.openai.com/v1"</div>
                  <div><span style={{ color: 'var(--accent)' }}>"embedding_api_key"</span>: "sk-..."</div>
                  <div><span style={{ color: 'var(--accent)' }}>"embedding_api_model"</span>: "text-embedding-3-small"</div>
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
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground ml-7">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#facc15' }} />
                  <span>Indexing runs in background, you can close this</span>
                </div>
                {/* Progress bar */}
                <div
                  className="ml-7 mt-3 h-1 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'var(--muted)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      backgroundColor: '#facc15',
                      width: status?.total_text_count
                        ? `${((status.indexed_count ?? 0) / status.total_text_count) * 100}%`
                        : '0%'
                    }}
                  />
                </div>
              </div>
            )}

            {step === 'ready' && (
              <div>
                <div
                  className="flex items-center gap-2 p-2.5 rounded-lg mb-3"
                  style={{ backgroundColor: 'rgba(74, 222, 128, 0.1)' }}
                >
                  <Check className="w-3.5 h-3.5" style={{ color: '#4ade80' }} />
                  <span className="text-xs font-medium" style={{ color: '#4ade80' }}>AI Search Ready</span>
                </div>
                <span className="text-xs text-muted-foreground leading-relaxed">
                  {status?.indexed_count ?? 0} text records indexed. Click AI button to toggle search mode.
                </span>
                <div className="flex gap-2 mt-3">
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
          <div className="px-4 py-2.5 border-t border-border flex justify-end">
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
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
    <div className="flex items-center gap-2 mb-1.5">
      <span
        className="w-5 h-5 rounded-full text-[11px] font-semibold flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: 'var(--accent)',
          color: 'var(--primary-foreground)'
        }}
      >
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
      <p className="text-xs text-muted-foreground leading-relaxed ml-7 mb-3">
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
