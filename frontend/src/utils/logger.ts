/**
 * Logging system for PowerClip frontend
 */

import type { LogLevel, LogEntry, PowerClipLogger } from '../types'

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

// Logger API exposed on window for global access
declare global {
  interface Window {
    powerclipLogger: PowerClipLogger
  }
}

export const logger: PowerClipLogger = {
  debug: (module: string, message: string) => log('DEBUG', module, message),
  info: (module: string, message: string) => log('INFO', module, message),
  warning: (module: string, message: string) => log('WARNING', module, message),
  error: (module: string, message: string) => log('ERROR', module, message),
  getLogs: () => [...logs],
  clearLogs: () => { logs.length = 0 },
}

/** Initialize the global logger on window. Call once at app startup. */
export function initLogger(): void {
  window.powerclipLogger = logger
}
