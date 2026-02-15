export interface ClipboardItem {
  id: number;
  item_type: string;
  content: string;
  hash: string;
  created_at: string;
}

export interface Settings {
  auto_cleanup_enabled: boolean;
  max_items: number;
  hotkey_modifiers: string;
  hotkey_key: string;
  display_limit: number;
  preview_max_length: number;
  window_opacity: number;
}

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
  module: string;
  message: string;
}

export interface PowerClipLogger {
  debug: (module: string, message: string) => void;
  info: (module: string, message: string) => void;
  warning: (module: string, message: string) => void;
  error: (module: string, message: string) => void;
  getLogs: () => LogEntry[];
  clearLogs: () => void;
}
