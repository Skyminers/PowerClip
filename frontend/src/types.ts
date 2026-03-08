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
  // Add to snippets hotkey settings
  add_to_snippets_hotkey_enabled: boolean;
  add_to_snippets_hotkey_modifiers: string;
  add_to_snippets_hotkey_key: string;
  // Advanced settings
  clipboard_poll_interval_ms: number;
  min_similarity_score: number;
  max_embeddings_in_memory: number;
  content_truncate_length: number;
  image_preview_max_width: number;
  image_preview_max_height: number;
  max_history_fetch: number;
  focus_delay_ms: number;
  semantic_search_debounce_ms: number;
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

/// Snippet item for quick commands
export interface Snippet {
  id: number;
  content: string;
  alias: string | null;
  created_at: string;
  updated_at: string;
}
