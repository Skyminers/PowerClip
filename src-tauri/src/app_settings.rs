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
  // First-time use requires downloading EmbeddingGemma model (~236MB), runs entirely locally
  // After enabling, click the AI button next to search bar to complete setup
  "semantic_search_enabled": false,

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
pub fn load_settings() -> Result<AppSettings, String> {
    let path = settings_path();

    if !path.exists() {
        // Write initial settings with comments
        fs::write(&path, initial_settings_content()).map_err(|e| e.to_string())?;
        // Parse and return default settings
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let json = strip_comments(&content);

    let raw: serde_json::Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    let extensions_missing = raw.get("extensions").is_none();

    let mut settings: AppSettings = serde_json::from_value(raw).map_err(|e| e.to_string())?;

    if extensions_missing {
        // Add default extensions but don't overwrite the file (preserve comments)
        settings.extensions = vec![
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

    Ok(settings)
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
                            Ok(settings) => {
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
                                        }
                                    }
                                }

                                // Sync semantic search enabled state
                                if let Some(sem_state) = app.try_state::<crate::semantic::SemanticState>() {
                                    if let Ok(mut status) = sem_state.status.write() {
                                        status.enabled = settings.semantic_search_enabled;
                                    }

                                    // Check if semantic search was just enabled
                                    if check_semantic_enabled_transition(settings.semantic_search_enabled) {
                                        logger::info("Settings", "Semantic search enabled, triggering bulk indexing...");

                                        // Check if model is downloaded
                                        let model_exists = crate::config::models_dir()
                                            .join(crate::config::SEMANTIC_MODEL_FILENAME)
                                            .exists();

                                        if model_exists {
                                            // Trigger bulk indexing in background
                                            let app_clone = app.clone();
                                            std::thread::spawn(move || {
                                                // Small delay to let the settings update propagate
                                                std::thread::sleep(std::time::Duration::from_millis(500));
                                                crate::semantic::embedding::index_all_items(app_clone);
                                            });
                                        } else {
                                            logger::info("Settings", "Model not downloaded yet, skipping bulk indexing");
                                        }
                                    }
                                }

                                // Notify frontend
                                let _ = app.emit("powerclip:settings-changed", ());
                                logger::info("Settings", "Settings reloaded and event emitted");
                            }
                            Err(e) => {
                                logger::error("Settings", &format!("Failed to load settings: {}", e));
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
}
