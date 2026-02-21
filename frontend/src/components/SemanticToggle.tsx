/**
 * AI 语义搜索按钮与弹出面板
 * 点击按钮弹出面板，展示状态、引导设置、一键下载等
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

interface ManualDownloadInfo {
  url: string
  target_path: string
  filename: string
}

type SetupStep = 'enable' | 'download' | 'downloading' | 'loading' | 'ready'

function getSetupStep(enabled: boolean, status: SemanticStatus | null): SetupStep {
  if (!enabled) return 'enable'
  if (!status) return 'enable'
  if (status.download_progress !== null) return 'downloading'
  if (!status.model_downloaded) return 'download'
  // Model loads on-demand, so if downloaded we're ready
  // Only show loading during active indexing
  if (status.indexing_in_progress) return 'loading'
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
  const [manualInfo, setManualInfo] = useState<ManualDownloadInfo | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const step = getSetupStep(enabled, status)
  const isReady = step === 'ready'

  // 点击外部关闭面板
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
        setShowManual(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  // 定时刷新状态（下载/加载中）
  useEffect(() => {
    if (!open) return
    if (step !== 'downloading' && step !== 'loading') return
    const interval = setInterval(onRefreshStatus, 1000)
    return () => clearInterval(interval)
  }, [open, step, onRefreshStatus])

  // 当 enabled 变化或面板打开时刷新状态
  useEffect(() => {
    if (enabled) {
      onRefreshStatus()
    }
  }, [enabled, onRefreshStatus])

  // Load manual download info
  useEffect(() => {
    if (showManual && !manualInfo) {
      invoke<ManualDownloadInfo>('get_manual_download_info')
        .then(setManualInfo)
        .catch(() => {})
    }
  }, [showManual, manualInfo])

  const handleButtonClick = useCallback(() => {
    if (isReady) {
      onToggle()
    } else {
      // 先刷新一次状态再打开面板
      onRefreshStatus()
      setDownloadError(null)
      setShowManual(false)
      setOpen(prev => !prev)
    }
  }, [isReady, onToggle, onRefreshStatus])

  const handleEnableClick = useCallback(() => {
    invoke('open_settings_file').catch(() => {})
  }, [])

  const handleDownloadClick = useCallback(() => {
    setDownloadError(null)
    invoke('download_model')
      .then(() => {
        // 延迟刷新，让后端有时间更新状态
        setTimeout(onRefreshStatus, 500)
      })
      .catch((e) => {
        setDownloadError(typeof e === 'string' ? e : String(e))
      })
  }, [onRefreshStatus])

  const handleCancelDownload = useCallback(() => {
    invoke('cancel_model_download').catch(() => {})
    setTimeout(onRefreshStatus, 300)
  }, [onRefreshStatus])

  const handleCheckManualDownload = useCallback(() => {
    onRefreshStatus()
  }, [onRefreshStatus])

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }, [])

  // 按钮样式
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

  // 指示灯颜色
  const dotColor = (() => {
    switch (step) {
      case 'ready': return active ? '#fff' : '#4ade80'
      case 'downloading':
      case 'loading': return '#facc15'
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
        title={isReady ? (active ? '关闭AI搜索' : '开启AI搜索') : '设置AI搜索'}
      >
        {/* 状态指示灯 */}
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

      {/* 弹出面板 */}
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
          {/* 头部 */}
          <div style={{
            padding: '14px 16px 10px',
            borderBottom: `1px solid ${colors.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <svg style={{ width: 16, height: 16, color: colors.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span style={{ color: colors.text, fontSize: 13, fontWeight: 600 }}>AI 语义搜索</span>
            </div>
            <span style={{ color: colors.textMuted, fontSize: 11, lineHeight: '1.5' }}>
              使用本地 AI 模型，根据语义理解搜索剪贴板内容
            </span>
          </div>

          {/* 步骤内容 */}
          <div style={{ padding: '12px 16px' }}>
            {step === 'enable' && (
              <StepCard
                stepNum={1}
                title="启用 AI 搜索"
                description='在设置文件中将 "semantic_search_enabled" 设为 true，保存后自动生效'
                action="打开设置文件"
                onAction={handleEnableClick}
              />
            )}

            {step === 'download' && !showManual && !downloadError && (
              <div>
                <StepCard
                  stepNum={2}
                  title="下载 AI 模型"
                  description="需要下载 EmbeddingGemma 模型（约 236MB），模型完全本地运行，不传输任何数据"
                  action="开始下载"
                  onAction={handleDownloadClick}
                />
                <button
                  onClick={() => setShowManual(true)}
                  style={{
                    marginTop: 10,
                    marginLeft: 28,
                    background: 'none',
                    border: 'none',
                    color: colors.accent,
                    fontSize: 11,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  网络问题？手动下载
                </button>
              </div>
            )}

            {(step === 'download' && (showManual || downloadError)) && (
              <div>
                <StepLabel stepNum={2} title="手动下载模型" />
                {downloadError && (
                  <div style={{
                    marginBottom: 10,
                    padding: '8px 10px',
                    backgroundColor: 'rgba(248, 113, 113, 0.15)',
                    borderRadius: 6,
                    color: '#fca5a5',
                    fontSize: 11,
                  }}>
                    下载失败: {downloadError}
                  </div>
                )}
                <p style={{
                  color: colors.textMuted, fontSize: 11, lineHeight: '1.6',
                  margin: '6px 0 10px 0',
                }}>
                  如果自动下载失败，请手动下载模型文件并放入指定位置：
                </p>

                {manualInfo && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      marginBottom: 8,
                    }}>
                      <span style={{ color: colors.text, fontSize: 11, fontWeight: 500 }}>下载地址:</span>
                      <button
                        onClick={() => copyToClipboard(manualInfo.url)}
                        style={{
                          background: 'none', border: 'none',
                          color: colors.accent, fontSize: 10,
                          cursor: 'pointer', padding: 0,
                        }}
                      >
                        复制
                      </button>
                    </div>
                    <div style={{
                      padding: '8px 10px',
                      backgroundColor: colors.bgHover,
                      borderRadius: 4,
                      fontSize: 9,
                      color: colors.textMuted,
                      wordBreak: 'break-all',
                      lineHeight: '1.4',
                    }}>
                      {manualInfo.url}
                    </div>

                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      marginBottom: 8, marginTop: 10,
                    }}>
                      <span style={{ color: colors.text, fontSize: 11, fontWeight: 500 }}>保存位置:</span>
                      <button
                        onClick={() => copyToClipboard(manualInfo.target_path)}
                        style={{
                          background: 'none', border: 'none',
                          color: colors.accent, fontSize: 10,
                          cursor: 'pointer', padding: 0,
                        }}
                      >
                        复制
                      </button>
                    </div>
                    <div style={{
                      padding: '8px 10px',
                      backgroundColor: colors.bgHover,
                      borderRadius: 4,
                      fontSize: 10,
                      color: colors.textMuted,
                      wordBreak: 'break-all',
                      lineHeight: '1.4',
                    }}>
                      {manualInfo.target_path}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleCheckManualDownload}
                    style={{
                      flex: 1, padding: '8px 0',
                      borderRadius: 6, border: 'none',
                      backgroundColor: colors.accent, color: '#fff',
                      fontSize: 12, fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    已完成，检查文件
                  </button>
                  {!downloadError && (
                    <button
                      onClick={() => { setShowManual(false); setDownloadError(null) }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6, border: `1px solid ${colors.border}`,
                        backgroundColor: 'transparent', color: colors.textMuted,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      返回
                    </button>
                  )}
                </div>
              </div>
            )}

            {step === 'downloading' && (
              <div>
                <StepLabel stepNum={2} title="正在下载模型..." />
                <ProgressBar progress={status?.download_progress ?? 0} />
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 8,
                }}>
                  <span style={{ color: colors.textMuted, fontSize: 10 }}>
                    {Math.round((status?.download_progress ?? 0) * 100)}%
                  </span>
                  <button
                    onClick={handleCancelDownload}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#f87171',
                      fontSize: 10,
                      cursor: 'pointer',
                    }}
                  >
                    取消下载
                  </button>
                </div>
                <span style={{ color: colors.textMuted, fontSize: 10, marginTop: 4, display: 'block' }}>
                  下载在后台进行，可关闭此窗口
                </span>
              </div>
            )}

            {step === 'loading' && (
              <div>
                <StepLabel stepNum={3} title={
                  status?.indexing_in_progress
                    ? `正在索引历史记录 (${status.indexed_count}/${status.total_text_count})`
                    : '正在加载模型...'
                } />
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  marginTop: 8, color: colors.textMuted, fontSize: 11,
                }}>
                  <svg style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} fill="none" viewBox="0 0 24 24">
                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>首次加载可能需要几秒钟</span>
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
                  <span style={{ color: '#4ade80', fontSize: 12, fontWeight: 500 }}>AI 搜索已就绪</span>
                </div>
                <span style={{ color: colors.textMuted, fontSize: 11, lineHeight: '1.5' }}>
                  已索引 {status?.indexed_count ?? 0} 条文本记录。点击 AI 按钮即可切换搜索模式。
                </span>
                <button
                  onClick={() => { onToggle(); setOpen(false) }}
                  style={{
                    marginTop: 10, width: '100%', padding: '8px 0',
                    borderRadius: 6, border: 'none',
                    backgroundColor: active ? colors.bgHover : colors.accent,
                    color: '#fff', fontSize: 12, fontWeight: 500,
                    cursor: 'pointer', transition: 'background-color 0.15s',
                  }}
                >
                  {active ? '关闭 AI 搜索' : '开启 AI 搜索'}
                </button>
              </div>
            )}
          </div>

          {/* 底部关闭 */}
          <div style={{
            padding: '8px 16px 10px',
            borderTop: `1px solid ${colors.border}`,
            display: 'flex', justifyContent: 'flex-end',
          }}>
            <button
              onClick={() => { setOpen(false); setShowManual(false) }}
              style={{
                background: 'none', border: 'none',
                color: colors.textMuted, fontSize: 11,
                cursor: 'pointer', padding: '2px 8px',
              }}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---- 子组件 ---- */

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

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div style={{
      marginTop: 10, height: 4, borderRadius: 2,
      backgroundColor: colors.bgHover, overflow: 'hidden',
    }}>
      <div style={{
        height: '100%', borderRadius: 2,
        backgroundColor: colors.accent,
        width: `${Math.min(progress * 100, 100)}%`,
        transition: 'width 0.3s ease',
      }} />
    </div>
  )
}
