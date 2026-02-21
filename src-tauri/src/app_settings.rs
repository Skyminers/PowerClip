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

  // ---- AI 语义搜索 ----
  // 启用后可使用自然语言搜索剪贴板内容（例如搜索"昨天复制的网址"）
  // 首次启用需要下载 EmbeddingGemma 模型（约 236MB），模型完全本地运行
  // 开启后点击搜索栏旁的 AI 按钮，按引导完成设置
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
                name: "转为大写".to_string(),
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
