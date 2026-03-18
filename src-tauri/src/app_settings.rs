//! Application settings - User preferences persistence

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{Emitter, Manager};

use crate::config::settings_path;
use crate::logger;

/// Track previous semantic search enabled state to detect changes
static PREV_SEMANTIC_ENABLED: AtomicBool = AtomicBool::new(false);

/// A user-configured extension that processes clipboard content via an external command.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Extension {
    pub name: String,
    pub command: String,
    pub timeout: i64,
    pub close_on_success: bool,
}

/// Application settings shared between backend and frontend.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppSettings {
    pub auto_cleanup_enabled: bool,
    pub max_items: i64,
    pub hotkey_modifiers: String,
    pub hotkey_key: String,
    pub window_opacity: f64,
    pub auto_paste_enabled: bool,
    #[serde(default)]
    pub extensions: Vec<Extension>,
    #[serde(default)]
    pub semantic_search_enabled: bool,
    // Hotkey for quickly adding clipboard content to snippets
    #[serde(default = "default_add_to_snippets_enabled")]
    pub add_to_snippets_hotkey_enabled: bool,
    #[serde(default = "default_add_to_snippets_modifiers")]
    pub add_to_snippets_hotkey_modifiers: String,
    #[serde(default = "default_add_to_snippets_key")]
    pub add_to_snippets_hotkey_key: String,
    // ---- Advanced Settings ----
    /// Clipboard polling interval in milliseconds (lower = more responsive but higher CPU)
    #[serde(default = "default_clipboard_poll_interval_ms")]
    pub clipboard_poll_interval_ms: u64,
    /// Minimum similarity score for semantic search (0.0 - 1.0, lower = more results)
    #[serde(default = "default_min_similarity_score")]
    pub min_similarity_score: f32,
    /// Maximum embeddings to keep in memory (affects memory usage)
    #[serde(default = "default_max_embeddings_in_memory")]
    pub max_embeddings_in_memory: usize,
    /// Maximum characters to show in list item preview
    #[serde(default = "default_content_truncate_length")]
    pub content_truncate_length: usize,
    /// Maximum image preview width in pixels
    #[serde(default = "default_image_preview_max_width")]
    pub image_preview_max_width: u32,
    /// Maximum image preview height in pixels
    #[serde(default = "default_image_preview_max_height")]
    pub image_preview_max_height: u32,
    /// Maximum history items to fetch from database
    #[serde(default = "default_max_history_fetch")]
    pub max_history_fetch: usize,
    /// Delay before focusing search input (milliseconds)
    #[serde(default = "default_focus_delay_ms")]
    pub focus_delay_ms: u64,
    /// Debounce delay for semantic search (milliseconds)
    #[serde(default = "default_semantic_search_debounce_ms")]
    pub semantic_search_debounce_ms: u64,
    // ---- Embedding API ----
    /// Base URL of the OpenAI-compatible embeddings API
    #[serde(default = "default_embedding_api_url")]
    pub embedding_api_url: String,
    /// API key for the embeddings API
    #[serde(default)]
    pub embedding_api_key: String,
    /// Embedding model name (e.g. "text-embedding-3-small")
    #[serde(default = "default_embedding_api_model")]
    pub embedding_api_model: String,
    /// Embedding vector dimension returned by the model (e.g. 1536)
    #[serde(default = "default_embedding_api_dim")]
    pub embedding_api_dim: usize,
}

fn default_add_to_snippets_enabled() -> bool {
    true
}

fn default_add_to_snippets_modifiers() -> String {
    if cfg!(target_os = "macos") {
        "Meta+Shift".to_string()
    } else {
        "Control+Shift".to_string()
    }
}

fn default_add_to_snippets_key() -> String {
    "KeyS".to_string()
}

fn default_clipboard_poll_interval_ms() -> u64 {
    100
}

fn default_min_similarity_score() -> f32 {
    0.2
}

fn default_max_embeddings_in_memory() -> usize {
    50_000
}

fn default_content_truncate_length() -> usize {
    50
}

fn default_image_preview_max_width() -> u32 {
    120
}

fn default_image_preview_max_height() -> u32 {
    80
}

fn default_max_history_fetch() -> usize {
    10_000
}

fn default_focus_delay_ms() -> u64 {
    50
}

fn default_semantic_search_debounce_ms() -> u64 {
    300
}

fn default_embedding_api_url() -> String {
    "https://api.openai.com/v1".to_string()
}

fn default_embedding_api_model() -> String {
    "text-embedding-3-small".to_string()
}

fn default_embedding_api_dim() -> usize {
    1536
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_cleanup_enabled: false,
            max_items: 100,
            hotkey_modifiers: if cfg!(target_os = "macos") {
                "Meta+Shift".to_string()
            } else {
                "Control+Shift".to_string()
            },
            hotkey_key: "KeyV".to_string(),
            window_opacity: 0.95,
            auto_paste_enabled: false,
            extensions: vec![],
            semantic_search_enabled: false,
            add_to_snippets_hotkey_enabled: true,
            add_to_snippets_hotkey_modifiers: default_add_to_snippets_modifiers(),
            add_to_snippets_hotkey_key: default_add_to_snippets_key(),
            clipboard_poll_interval_ms: default_clipboard_poll_interval_ms(),
            min_similarity_score: default_min_similarity_score(),
            max_embeddings_in_memory: default_max_embeddings_in_memory(),
            content_truncate_length: default_content_truncate_length(),
            image_preview_max_width: default_image_preview_max_width(),
            image_preview_max_height: default_image_preview_max_height(),
            max_history_fetch: default_max_history_fetch(),
            focus_delay_ms: default_focus_delay_ms(),
            semantic_search_debounce_ms: default_semantic_search_debounce_ms(),
            embedding_api_url: default_embedding_api_url(),
            embedding_api_key: String::new(),
            embedding_api_model: default_embedding_api_model(),
            embedding_api_dim: default_embedding_api_dim(),
        }
    }
}

/// Generate initial settings file content with comments for user guidance.
fn initial_settings_content() -> String {
    let platform_hotkey = if cfg!(target_os = "macos") { "Meta+Shift" } else { "Control+Shift" };
    let platform_ext = if cfg!(target_os = "windows") {
        r#"{
      "name": "To Uppercase",
      "command": "powershell -Command \"$input | ForEach-Object { $_.ToUpper() }\"",
      "timeout": -1,
      "close_on_success": true
    }"#
    } else {
        r#"{
      "name": "To Uppercase",
      "command": "tr '[:lower:]' '[:upper:]'",
      "timeout": -1,
      "close_on_success": true
    }"#
    };

    format!(r#"// PowerClip Configuration
// Changes take effect immediately after saving

{{
  // Auto-delete old items when limit is reached
  "auto_cleanup_enabled": false,

  // Maximum clipboard items to keep (1-10000, recommended: 100-500)
  "max_items": 100,

  // Hotkey modifiers: Meta (Cmd on macOS), Control, Alt, Shift
  // Combine with +, e.g. "Meta+Shift" or "Control+Alt"
  "hotkey_modifiers": "{platform_hotkey}",

  // Hotkey key: KeyA-KeyZ, Digit0-Digit9, F1-F12, etc.
  "hotkey_key": "KeyV",

  // Window opacity: 0.5 (transparent) to 1.0 (opaque)
  "window_opacity": 0.95,

  // Auto-paste after selecting an item
  "auto_paste_enabled": false,

  // ---- AI Semantic Search ----
  // Enable to search clipboard content using natural language (e.g., "URL copied yesterday")
  // Requires an OpenAI-compatible embeddings API - configure the fields below
  "semantic_search_enabled": false,

  // Embeddings API base URL (OpenAI-compatible)
  "embedding_api_url": "https://api.openai.com/v1",
  // Your API key
  "embedding_api_key": "",
  // Embedding model name
  "embedding_api_model": "text-embedding-3-small",
  // Dimension of embeddings returned by the model (must match the model)
  "embedding_api_dim": 1536,

  // ---- Quick Add to Snippets Hotkey ----
  // Quickly add current clipboard content to snippets (Quick Commands)
  // Press the hotkey while clipboard contains text to add it to snippets
  "add_to_snippets_hotkey_enabled": true,
  "add_to_snippets_hotkey_modifiers": "{platform_hotkey}",
  "add_to_snippets_hotkey_key": "KeyS",

  // ---- Advanced Settings ----
  // Clipboard polling interval in milliseconds (lower = more responsive but higher CPU usage)
  // Recommended: 50-200, Default: 100
  "clipboard_poll_interval_ms": 100,

  // Minimum similarity score for semantic search (0.0 - 1.0)
  // Lower values = more results but potentially less relevant
  // Recommended: 0.1-0.5, Default: 0.2
  "min_similarity_score": 0.2,

  // Maximum embeddings to keep in memory for semantic search
  // Higher = more items searchable but more memory usage
  // Each embedding uses ~3KB, Default: 50000 (~150MB max)
  "max_embeddings_in_memory": 50000,

  // Maximum characters to show in list item preview
  // Recommended: 30-100, Default: 50
  "content_truncate_length": 50,

  // Image preview dimensions in pixels
  "image_preview_max_width": 120,
  "image_preview_max_height": 80,

  // Maximum history items to fetch from database
  // Higher = more history shown but slower initial load
  // Recommended: 1000-20000, Default: 10000
  "max_history_fetch": 10000,

  // UI timing settings (in milliseconds)
  // Delay before focusing search input after window shows
  "focus_delay_ms": 50,
  // Debounce delay for semantic search to avoid excessive API calls
  "semantic_search_debounce_ms": 300,

  // Extensions (press Tab on selected item to trigger)
  // - name: Display name in extension selector
  // - command: Shell command (clipboard content via stdin)
  // - timeout: -1=wait forever, 0=fire-and-forget, >0=timeout in ms
  // - close_on_success: Close window after successful execution
  "extensions": [
    {platform_ext}
  ]
}}
"#)
}

/// Save settings to file.
pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

/// Strip comment lines (// ...) from JSON content for parsing.
fn strip_comments(content: &str) -> String {
    content
        .lines()
        .filter(|line| !line.trim().starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Load settings from file.
/// Returns (settings, error_message) where error_message is Some if defaults were used due to parse error.
pub fn load_settings() -> Result<(AppSettings, Option<String>), String> {
    let path = settings_path();

    if !path.exists() {
        // Write initial settings with comments
        fs::write(&path, initial_settings_content()).map_err(|e| e.to_string())?;
        // Parse and return default settings
        return Ok((AppSettings::default(), None));
    }

    let content = fs::read_to_string(&path).map_err(|e| {
        format!("Failed to read settings file: {}. Using defaults.", e)
    })?;
    let json = strip_comments(&content);

    // Try to parse as JSON first
    let raw: serde_json::Value = match serde_json::from_str(&json) {
        Ok(v) => v,
        Err(e) => {
            let error_msg = format!("Settings JSON parse error: {}. Using defaults.", e);
            logger::error("Settings", &error_msg);
            return Ok((AppSettings::default(), Some(error_msg)));
        }
    };

    let extensions_missing = raw.get("extensions").is_none();

    // Try to deserialize into AppSettings
    let settings: AppSettings = match serde_json::from_value(raw) {
        Ok(s) => s,
        Err(e) => {
            let error_msg = format!("Settings validation error: {}. Using defaults.", e);
            logger::error("Settings", &error_msg);
            return Ok((AppSettings::default(), Some(error_msg)));
        }
    };

    let mut final_settings = settings;

    if extensions_missing {
        // Add default extensions but don't overwrite the file (preserve comments)
        final_settings.extensions = vec![
            Extension {
                name: "To Uppercase".to_string(),
                command: if cfg!(target_os = "windows") {
                    "powershell -Command \"$input | ForEach-Object { $_.ToUpper() }\"".to_string()
                } else {
                    "tr '[:lower:]' '[:upper:]'".to_string()
                },
                timeout: -1,
                close_on_success: true,
            },
        ];
    }

    Ok((final_settings, None))
}

/// Load settings, returning only the settings (for backward compatibility).
pub fn load_settings_simple() -> Result<AppSettings, String> {
    load_settings().map(|(s, _)| s)
}

/// Initialize the semantic enabled state tracker.
/// Call this at startup with the initial settings value.
pub fn init_semantic_tracker(enabled: bool) {
    PREV_SEMANTIC_ENABLED.store(enabled, Ordering::SeqCst);
}

/// Check if semantic search was just enabled (transitioned from false to true).
/// Returns true if the value changed from false to true.
fn check_semantic_enabled_transition(new_enabled: bool) -> bool {
    let prev = PREV_SEMANTIC_ENABLED.swap(new_enabled, Ordering::SeqCst);
    // Transition from false to true
    !prev && new_enabled
}

/// Start watching the settings file for changes.
pub fn start_settings_watcher(app_handle: tauri::AppHandle) -> Result<(), String> {
    let path = settings_path();
    let parent = path.parent().ok_or("Cannot get settings directory")?;

    // Store filename for case-insensitive comparison (macOS is case-insensitive)
    let filename = path.file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_lowercase())
        .ok_or("Cannot get settings filename")?;

    if !path.exists() {
        fs::write(&path, initial_settings_content()).map_err(|e| e.to_string())?;
    }

    let app = app_handle.clone();

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                // Only process modify events on the settings file
                if matches!(event.kind, EventKind::Modify(_)) {
                    // Check if any path matches settings.json (case-insensitive)
                    let is_settings = event.paths.iter().any(|p| {
                        p.file_name()
                            .and_then(|n| n.to_str())
                            .map(|n| n.to_lowercase() == filename)
                            .unwrap_or(false)
                    });

                    if is_settings {
                        logger::info("Settings", "Settings file modified, reloading...");

                        match load_settings() {
                            Ok((settings, error_msg)) => {
                                // Emit error to frontend if settings had issues
                                if let Some(err) = &error_msg {
                                    let _ = app.emit("powerclip:settings-error", err.clone());
                                }

                                // Re-register hotkey
                                if let Some(hotkey_state) = app.try_state::<crate::HotkeyState>() {
                                    if let Ok(guard) = hotkey_state.manager.lock() {
                                        if let Some(window) = app.get_webview_window("main") {
                                            let _ = crate::hotkey::register_hotkey_with_settings(
                                                &guard,
                                                &hotkey_state.current_hotkey,
                                                &hotkey_state.handler_installed,
                                                &window,
                                                &settings.hotkey_modifiers,
                                                &settings.hotkey_key,
                                            );

                                            // Re-register add-to-snippets hotkey
                                            let _ = crate::hotkey::register_add_to_snippets_hotkey(
                                                &guard,
                                                &hotkey_state.add_to_snippets_hotkey,
                                                settings.add_to_snippets_hotkey_enabled,
                                                &settings.add_to_snippets_hotkey_modifiers,
                                                &settings.add_to_snippets_hotkey_key,
                                            );
                                        }
                                    }
                                }

                                // Sync semantic search enabled state
                                if let Some(sem_state) = app.try_state::<crate::semantic::SemanticState>() {
                                    if let Ok(mut status) = sem_state.status.write() {
                                        status.enabled = settings.semantic_search_enabled;
                                        status.api_configured = !settings.embedding_api_key.is_empty()
                                            && !settings.embedding_api_url.is_empty();
                                    }

                                    // Check if semantic search was just enabled
                                    if check_semantic_enabled_transition(settings.semantic_search_enabled) {
                                        logger::info("Settings", "Semantic search enabled, triggering bulk indexing...");

                                        // Start bulk indexing if API is configured
                                        let api_configured = !settings.embedding_api_key.is_empty()
                                            && !settings.embedding_api_url.is_empty();

                                        if api_configured {
                                            let app_clone = app.clone();
                                            std::thread::spawn(move || {
                                                std::thread::sleep(std::time::Duration::from_millis(500));
                                                crate::semantic::embedding::index_all_items(app_clone);
                                            });
                                        } else {
                                            logger::info("Settings", "API not configured yet, skipping bulk indexing");
                                        }
                                    }
                                }

                                // Notify frontend
                                let _ = app.emit("powerclip:settings-changed", ());
                                logger::info("Settings", "Settings reloaded and event emitted");
                            }
                            Err(e) => {
                                logger::error("Settings", &format!("Failed to load settings: {}", e));
                                let _ = app.emit("powerclip:settings-error", e);
                            }
                        }
                    }
                }
            }
        },
        notify::Config::default().with_poll_interval(Duration::from_millis(500)),
    ).map_err(|e| e.to_string())?;

    watcher.watch(parent, RecursiveMode::NonRecursive).map_err(|e| e.to_string())?;
    Box::leak(Box::new(watcher));

    logger::info("Settings", &format!("Watching: {:?}", path));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_settings() {
        let settings = AppSettings::default();

        assert!(!settings.auto_cleanup_enabled);
        assert_eq!(settings.max_items, 100);
        assert_eq!(settings.hotkey_key, "KeyV");
        assert!((settings.window_opacity - 0.95).abs() < 0.001);
        assert!(!settings.auto_paste_enabled);
        assert!(settings.extensions.is_empty());
        assert!(!settings.semantic_search_enabled);
        // Check advanced settings defaults
        assert_eq!(settings.clipboard_poll_interval_ms, 100);
        assert!((settings.min_similarity_score - 0.2).abs() < 0.001);
        assert_eq!(settings.max_embeddings_in_memory, 50_000);
        assert_eq!(settings.content_truncate_length, 50);
        assert_eq!(settings.image_preview_max_width, 120);
        assert_eq!(settings.image_preview_max_height, 80);
        assert_eq!(settings.max_history_fetch, 10_000);
        assert_eq!(settings.focus_delay_ms, 50);
        assert_eq!(settings.semantic_search_debounce_ms, 300);
    }

    #[test]
    fn test_default_hotkey_modifiers() {
        let settings = AppSettings::default();

        #[cfg(target_os = "macos")]
        assert_eq!(settings.hotkey_modifiers, "Meta+Shift");

        #[cfg(not(target_os = "macos"))]
        assert_eq!(settings.hotkey_modifiers, "Control+Shift");
    }

    #[test]
    fn test_extension_equality() {
        let ext1 = Extension {
            name: "Test".to_string(),
            command: "echo".to_string(),
            timeout: -1,
            close_on_success: true,
        };

        let ext2 = Extension {
            name: "Test".to_string(),
            command: "echo".to_string(),
            timeout: -1,
            close_on_success: true,
        };

        let ext3 = Extension {
            name: "Different".to_string(),
            command: "echo".to_string(),
            timeout: -1,
            close_on_success: true,
        };

        assert_eq!(ext1, ext2);
        assert_ne!(ext1, ext3);
    }

    #[test]
    fn test_settings_equality() {
        let s1 = AppSettings::default();
        let s2 = AppSettings::default();

        assert_eq!(s1, s2);
    }

    #[test]
    fn test_settings_serialization() {
        let settings = AppSettings {
            auto_cleanup_enabled: true,
            max_items: 200,
            hotkey_modifiers: "Control+Alt".to_string(),
            hotkey_key: "KeyP".to_string(),
            window_opacity: 0.8,
            auto_paste_enabled: true,
            extensions: vec![Extension {
                name: "Test".to_string(),
                command: "cat".to_string(),
                timeout: 5000,
                close_on_success: false,
            }],
            semantic_search_enabled: true,
            add_to_snippets_hotkey_enabled: true,
            add_to_snippets_hotkey_modifiers: "Meta+Control".to_string(),
            add_to_snippets_hotkey_key: "KeyA".to_string(),
            clipboard_poll_interval_ms: 150,
            min_similarity_score: 0.3,
            max_embeddings_in_memory: 30000,
            content_truncate_length: 60,
            image_preview_max_width: 150,
            image_preview_max_height: 100,
            max_history_fetch: 5000,
            focus_delay_ms: 75,
            semantic_search_debounce_ms: 400,
            embedding_api_url: "https://api.openai.com/v1".to_string(),
            embedding_api_key: "sk-test".to_string(),
            embedding_api_model: "text-embedding-3-small".to_string(),
            embedding_api_dim: 1536,
        };

        // Serialize to JSON
        let json = serde_json::to_string(&settings).expect("Failed to serialize");

        // Deserialize back
        let deserialized: AppSettings =
            serde_json::from_str(&json).expect("Failed to deserialize");

        assert_eq!(settings, deserialized);
    }

    #[test]
    fn test_strip_comments() {
        let content = r#"// This is a comment
{
  // Another comment
  "key": "value"
}
// End comment"#;

        let stripped = strip_comments(content);

        assert!(!stripped.contains("This is a comment"));
        assert!(!stripped.contains("Another comment"));
        assert!(!stripped.contains("End comment"));
        assert!(stripped.contains("key"));
        assert!(stripped.contains("value"));
    }

    #[test]
    fn test_strip_comments_preserves_code() {
        let content = r#"{
  "url": "https://example.com"
}"#;

        let stripped = strip_comments(content);

        assert!(stripped.contains("https://example.com"));
    }

    #[test]
    fn test_initial_settings_content() {
        let content = initial_settings_content();

        // Should contain JSON keys
        assert!(content.contains("auto_cleanup_enabled"));
        assert!(content.contains("max_items"));
        assert!(content.contains("hotkey_modifiers"));
        assert!(content.contains("hotkey_key"));
        assert!(content.contains("window_opacity"));
        assert!(content.contains("auto_paste_enabled"));
        assert!(content.contains("semantic_search_enabled"));
        assert!(content.contains("extensions"));

        // Should contain comments
        assert!(content.contains("//"));
    }

    #[test]
    fn test_check_semantic_enabled_transition_false_to_true() {
        // Reset the state
        PREV_SEMANTIC_ENABLED.store(false, std::sync::atomic::Ordering::SeqCst);

        // Transition from false to true should return true
        let result = check_semantic_enabled_transition(true);
        assert!(result);

        // Now state is true, transition true to true should return false
        let result = check_semantic_enabled_transition(true);
        assert!(!result);

        // Transition true to false should return false
        let result = check_semantic_enabled_transition(false);
        assert!(!result);

        // Transition false to true again should return true
        let result = check_semantic_enabled_transition(true);
        assert!(result);
    }

    #[test]
    fn test_init_semantic_tracker() {
        init_semantic_tracker(true);
        assert!(PREV_SEMANTIC_ENABLED.load(std::sync::atomic::Ordering::SeqCst));

        init_semantic_tracker(false);
        assert!(!PREV_SEMANTIC_ENABLED.load(std::sync::atomic::Ordering::SeqCst));
    }

    #[test]
    fn test_initial_settings_content_is_valid_json() {
        let content = initial_settings_content();
        let stripped = strip_comments(&content);

        // Must be valid JSON after stripping comments
        let parsed: serde_json::Value =
            serde_json::from_str(&stripped).expect("initial_settings_content must produce valid JSON after stripping comments");

        // Verify key fields are present
        assert!(parsed.get("hotkey_modifiers").is_some(), "hotkey_modifiers missing");
        assert!(parsed.get("hotkey_key").is_some(), "hotkey_key missing");
        assert!(parsed.get("extensions").is_some(), "extensions missing");
        assert!(parsed.get("semantic_search_debounce_ms").is_some(), "semantic_search_debounce_ms missing");
    }

    #[test]
    fn test_initial_settings_content_deserializes_to_app_settings() {
        let content = initial_settings_content();
        let stripped = strip_comments(&content);

        // Must deserialize into AppSettings successfully
        let settings: AppSettings =
            serde_json::from_str(&stripped).expect("initial_settings_content must deserialize into AppSettings");

        // Verify settings match expected defaults
        assert_eq!(settings.hotkey_key, "KeyV");
        assert_eq!(settings.max_items, 100);
        assert!(!settings.auto_cleanup_enabled);
        assert!(!settings.auto_paste_enabled);
        assert!((settings.window_opacity - 0.95).abs() < 0.001);
        assert_eq!(settings.semantic_search_debounce_ms, 300);
        assert!(!settings.extensions.is_empty(), "extensions should contain default extension");
    }

    #[test]
    fn test_custom_hotkey_settings_not_overridden_by_defaults() {
        // Simulate a user-configured settings JSON with custom hotkeys
        let json = r#"{
            "auto_cleanup_enabled": false,
            "max_items": 100,
            "hotkey_modifiers": "Alt+Shift",
            "hotkey_key": "KeyX",
            "window_opacity": 0.95,
            "auto_paste_enabled": false,
            "semantic_search_enabled": false,
            "extensions": []
        }"#;

        let settings: AppSettings =
            serde_json::from_str(json).expect("Failed to parse custom settings");

        // Custom hotkey values must be preserved, not overridden by platform defaults
        assert_eq!(settings.hotkey_modifiers, "Alt+Shift");
        assert_eq!(settings.hotkey_key, "KeyX");
    }

    #[test]
    fn test_custom_snippets_hotkey_settings_preserved() {
        let json = r#"{
            "auto_cleanup_enabled": false,
            "max_items": 100,
            "hotkey_modifiers": "Control+Shift",
            "hotkey_key": "KeyV",
            "window_opacity": 0.95,
            "auto_paste_enabled": false,
            "semantic_search_enabled": false,
            "add_to_snippets_hotkey_enabled": false,
            "add_to_snippets_hotkey_modifiers": "Alt",
            "add_to_snippets_hotkey_key": "KeyQ",
            "extensions": []
        }"#;

        let settings: AppSettings =
            serde_json::from_str(json).expect("Failed to parse custom settings");

        assert!(!settings.add_to_snippets_hotkey_enabled);
        assert_eq!(settings.add_to_snippets_hotkey_modifiers, "Alt");
        assert_eq!(settings.add_to_snippets_hotkey_key, "KeyQ");
    }

    #[test]
    fn test_settings_with_comments_parsed_correctly() {
        // Simulate a settings file with comments and custom hotkeys
        let content = r#"// PowerClip Configuration
{
  // Custom hotkey
  "auto_cleanup_enabled": false,
  "max_items": 200,
  "hotkey_modifiers": "Meta+Alt",
  "hotkey_key": "KeyP",
  "window_opacity": 0.8,
  "auto_paste_enabled": true,
  "semantic_search_enabled": false,
  // Extensions
  "extensions": []
}"#;

        let stripped = strip_comments(content);
        let settings: AppSettings =
            serde_json::from_str(&stripped).expect("Failed to parse settings with comments");

        assert_eq!(settings.hotkey_modifiers, "Meta+Alt");
        assert_eq!(settings.hotkey_key, "KeyP");
        assert_eq!(settings.max_items, 200);
        assert!(settings.auto_paste_enabled);
    }
}
