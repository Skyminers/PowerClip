/**
 * AI semantic search button and popup panel
 * Click to show panel with status and setup guide for API-based embedding.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { theme } from '../theme'
import type { SemanticStatus } from '../types'

const colors = theme.colors

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

  // Button style
  const buttonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    borderRadius: '6px',
    border: active ? 'none' : `1px solid ${colors.border}`,
    backgroundColor: active ? colors.accent : 'transparent',
    color: active ? '#fff' : isReady ? colors.text : colors.textMuted,
    cursor: 'pointer',
    opacity: !enabled ? 0.5 : 1,
    transition: 'all 0.15s ease',
    fontSize: '11px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    position: 'relative',
  }

  const dotColor = (() => {
    switch (step) {
      case 'ready': return active ? '#fff' : '#4ade80'
      case 'indexing': return '#facc15'
      default: return colors.textMuted
    }
  })()

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        type="button"
        style={buttonStyle}
        onClick={handleButtonClick}
        className="no-drag"
        title={isReady ? (active ? 'Disable AI search' : 'Enable AI search') : 'AI search setup'}
      >
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: dotColor,
          flexShrink: 0,
          transition: 'background-color 0.2s',
        }} />
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span>AI</span>
      </button>

      {/* Popup panel */}
      {open && (
        <div
          ref={panelRef}
          className="no-drag"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 320,
            backgroundColor: colors.bgSecondary,
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08)',
            zIndex: 100,
            overflow: 'hidden',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 16px 10px',
            borderBottom: `1px solid ${colors.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <svg style={{ width: 16, height: 16, color: colors.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span style={{ color: colors.text, fontSize: 13, fontWeight: 600 }}>AI Semantic Search</span>
            </div>
            <span style={{ color: colors.textMuted, fontSize: 11, lineHeight: '1.5' }}>
              Search clipboard content using natural language via embedding API
            </span>
          </div>

          {/* Step content */}
          <div style={{ padding: '12px 16px' }}>
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
                <p style={{
                  color: colors.textMuted, fontSize: 11, lineHeight: '1.6',
                  margin: '6px 0 10px 28px',
                }}>
                  Set your API credentials in the settings file:
                </p>
                <div style={{
                  marginLeft: 28,
                  padding: '8px 10px',
                  backgroundColor: colors.bgHover,
                  borderRadius: 6,
                  fontSize: 10,
                  color: colors.textMuted,
                  fontFamily: 'monospace',
                  lineHeight: '1.7',
                  marginBottom: 10,
                }}>
                  <div><span style={{ color: colors.accent }}>"embedding_api_url"</span>: "https://api.openai.com/v1"</div>
                  <div><span style={{ color: colors.accent }}>"embedding_api_key"</span>: "sk-..."</div>
                  <div><span style={{ color: colors.accent }}>"embedding_api_model"</span>: "text-embedding-3-small"</div>
                </div>
                <button
                  onClick={handleOpenSettings}
                  style={{
                    marginLeft: 28, padding: '6px 16px',
                    borderRadius: 6, border: 'none',
                    backgroundColor: colors.accent, color: '#fff',
                    fontSize: 12, fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Open Settings File
                </button>
                <p style={{
                  color: colors.textMuted, fontSize: 10, lineHeight: '1.5',
                  margin: '8px 0 0 28px',
                }}>
                  Compatible with OpenAI, Azure OpenAI, and any OpenAI-compatible API.
                </p>
              </div>
            )}

            {step === 'indexing' && (
              <div>
                <StepLabel stepNum={3} title={
                  `Indexing history (${status?.indexed_count ?? 0}/${status?.total_text_count ?? 0})`
                } />
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  marginTop: 8, color: colors.textMuted, fontSize: 11,
                }}>
                  <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} fill="none" viewBox="0 0 24 24">
                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Indexing runs in background, you can close this</span>
                </div>
              </div>
            )}

            {step === 'ready' && (
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 8,
                  backgroundColor: 'rgba(74, 222, 128, 0.1)',
                  marginBottom: 10,
                }}>
                  <span style={{ color: '#4ade80', fontSize: 12 }}>&#10003;</span>
                  <span style={{ color: '#4ade80', fontSize: 12, fontWeight: 500 }}>AI Search Ready</span>
                </div>
                <span style={{ color: colors.textMuted, fontSize: 11, lineHeight: '1.5' }}>
                  {status?.indexed_count ?? 0} text records indexed. Click AI button to toggle search mode.
                </span>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    onClick={() => { onToggle(); setOpen(false) }}
                    style={{
                      flex: 1, padding: '8px 0',
                      borderRadius: 6, border: 'none',
                      backgroundColor: active ? colors.bgHover : colors.accent,
                      color: '#fff', fontSize: 12, fontWeight: 500,
                      cursor: 'pointer', transition: 'background-color 0.15s',
                    }}
                  >
                    {active ? 'Disable AI Search' : 'Enable AI Search'}
                  </button>
                  <button
                    onClick={handleStartIndexing}
                    title="Index any clipboard items not yet embedded"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6, border: `1px solid ${colors.border}`,
                      backgroundColor: 'transparent', color: colors.textMuted,
                      fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    Re-index
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '8px 16px 10px',
            borderTop: `1px solid ${colors.border}`,
            display: 'flex', justifyContent: 'flex-end',
          }}>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'none', border: 'none',
                color: colors.textMuted, fontSize: 11,
                cursor: 'pointer', padding: '2px 8px',
              }}
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%',
        backgroundColor: colors.accent, color: '#fff',
        fontSize: 11, fontWeight: 600, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {stepNum}
      </span>
      <span style={{ color: colors.text, fontSize: 12, fontWeight: 500 }}>{title}</span>
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
      <p style={{
        color: colors.textMuted, fontSize: 11, lineHeight: '1.6',
        margin: '6px 0 10px 28px',
      }}>
        {description}
      </p>
      <button
        onClick={onAction}
        style={{
          marginLeft: 28, padding: '6px 16px',
          borderRadius: 6, border: 'none',
          backgroundColor: colors.accent, color: '#fff',
          fontSize: 12, fontWeight: 500,
          cursor: 'pointer', transition: 'background-color 0.15s',
        }}
      >
        {action}
      </button>
    </div>
  )
}
