/**
 * 日志工具
 * 使用后端提供的日志系统
 */

export const logger = {
  debug: (module: string, message: string) => (window as any).powerclipLogger?.debug(module, message),
  info: (module: string, message: string) => (window as any).powerclipLogger?.info(module, message),
  warning: (module: string, message: string) => (window as any).powerclipLogger?.warning(module, message),
  error: (module: string, message: string) => (window as any).powerclipLogger?.error(module, message),
}
