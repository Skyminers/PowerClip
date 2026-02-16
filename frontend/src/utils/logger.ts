/**
 * 日志工具
 * 使用后端提供的日志系统
 */

import { PowerClipLogger } from '../types'

export const logger: PowerClipLogger = {
  debug: (module: string, message: string) => window.powerclipLogger?.debug(module, message),
  info: (module: string, message: string) => window.powerclipLogger?.info(module, message),
  warning: (module: string, message: string) => window.powerclipLogger?.warning(module, message),
  error: (module: string, message: string) => window.powerclipLogger?.error(module, message),
}
