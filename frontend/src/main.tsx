import React from 'react'
import ReactDOM from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import App from './App'
import './index.css'

// ============== Logging System ==============
type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'

interface LogEntry {
  timestamp: string
  level: LogLevel
  module: string
  message: string
}

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
}

const currentLevel: LogLevel = import.meta.env.DEV ? 'DEBUG' : 'INFO'

const logs: LogEntry[] = []

function getTimestamp(): string {
  const now = new Date()
  return now.toISOString().replace('T', ' ').slice(0, 23)
}

function formatLog(entry: LogEntry): string {
  return `[${entry.timestamp}] [${entry.level}] [${entry.module}] ${entry.message}`
}

function log(level: LogLevel, module: string, message: string): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) {
    return
  }

  const entry: LogEntry = {
    timestamp: getTimestamp(),
    level,
    module,
    message,
  }

  logs.push(entry)

  // Keep only last 1000 logs in memory
  if (logs.length > 1000) {
    logs.shift()
  }

  // Output to console
  const formatted = formatLog(entry)
  switch (level) {
    case 'DEBUG':
      console.debug(formatted)
      break
    case 'INFO':
      console.info(formatted)
      break
    case 'WARNING':
      console.warn(formatted)
      break
    case 'ERROR':
      console.error(formatted)
      break
  }
}

// Logger API
window.powerclipLogger = {
  debug: (module: string, message: string) => log('DEBUG', module, message),
  info: (module: string, message: string) => log('INFO', module, message),
  warning: (module: string, message: string) => log('WARNING', module, message),
  error: (module: string, message: string) => log('ERROR', module, message),
  getLogs: () => [...logs],
  clearLogs: () => { logs.length = 0 },
}

// ============== Application ==============

// Set transparent background
document.documentElement.style.backgroundColor = 'transparent'
document.body.style.backgroundColor = 'transparent'
document.documentElement.style.borderRadius = '16px'
document.body.style.borderRadius = '16px'

// Initialize React app
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Keyboard shortcut listener
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.close()
  }
})

// Clipboard check function - called by Rust backend monitor thread
(window as any).__powerclip_check_clipboard = async () => {
  try {
    // Invoke Rust command to check clipboard
    await invoke('check_clipboard')
  } catch (e) {
    // Ignore errors - clipboard might be empty or inaccessible
  }
}

// Log application startup
console.info('[PowerClip] Frontend initialized')
