export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'

export type ImageCache = Record<string, string>

export interface ClipboardItem {
  id: number;
  item_type: string;
  content: string;
  hash: string;
  created_at: string;
}

export interface Extension {
  name: string;
  command: string;
  timeout: number;
  close_on_success: boolean;
}

export interface Settings {
  auto_cleanup_enabled: boolean;
  max_items: number;
  hotkey_modifiers: string;
  hotkey_key: string;
  window_opacity: number;
  auto_paste_enabled: boolean;
  extensions: Extension[];
  semantic_search_enabled: boolean;
}

/// Status of the semantic search feature
export interface SemanticStatus {
  model_downloaded: boolean;
  model_loaded: boolean;
  download_progress: number | null;
  indexed_count: number;
  total_text_count: number;
  indexing_in_progress: boolean;
  enabled: boolean;
}

/// Result item from semantic search
export interface SemanticSearchResult {
  item: ClipboardItem;
  score: number;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
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
