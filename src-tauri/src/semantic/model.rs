//! Model download and loading for semantic search

use std::fs::File;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::{Emitter, Manager};

use crate::config::{models_dir, MIN_MODEL_SIZE_BYTES, SEMANTIC_MODEL_FILENAME, SEMANTIC_MODEL_URL};
use crate::logger;

use super::SemanticModel;
use super::SemanticState;

/// Global flag to cancel download
static DOWNLOAD_CANCELLED: std::sync::OnceLock<Arc<AtomicBool>> = std::sync::OnceLock::new();

fn get_download_cancelled() -> &'static Arc<AtomicBool> {
    DOWNLOAD_CANCELLED.get_or_init(|| Arc::new(AtomicBool::new(false)))
}

/// Get the model file path
pub fn model_path() -> std::path::PathBuf {
    models_dir().join(SEMANTIC_MODEL_FILENAME)
}

/// Get model download URL
pub fn get_model_url() -> &'static str {
    SEMANTIC_MODEL_URL
}

/// Cancel ongoing download
pub fn cancel_download() {
    if let Some(flag) = DOWNLOAD_CANCELLED.get() {
        flag.store(true, Ordering::SeqCst);
    }
}

/// Check if model file exists and has reasonable size
pub fn check_model_file() -> Result<bool, String> {
    let path = model_path();
    if !path.exists() {
        return Ok(false);
    }

    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.len() < MIN_MODEL_SIZE_BYTES {
        return Err(format!(
            "Model file exists but appears incomplete ({} bytes, expected at least {})",
            metadata.len(),
            MIN_MODEL_SIZE_BYTES
        ));
    }

    Ok(true)
}

/// Download the model with progress reporting
pub fn download_model(app: tauri::AppHandle) -> Result<(), String> {
    let semantic_state = app.state::<SemanticState>();

    // Check if already downloading
    {
        let status = semantic_state.status.read().map_err(|e| e.to_string())?;
        if status.download_progress.is_some() {
            return Err("Download already in progress".to_string());
        }
    }

    // Check if model already exists
    if check_model_file()? {
        if let Ok(mut status) = semantic_state.status.write() {
            status.model_downloaded = true;
            status.download_progress = None;
        }
        return Ok(());
    }

    // Reset cancel flag
    get_download_cancelled().store(false, Ordering::SeqCst);

    // Update status to indicate download starting
    if let Ok(mut status) = semantic_state.status.write() {
        status.download_progress = Some(0.0);
    }

    let path = model_path();
    let parent = path.parent().ok_or("Invalid model path")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;

    // Emit download started
    let _ = app.emit("powerclip:semantic-download-started", ());

    // Start download in background thread
    let app_clone = app.clone();
    let path_clone = path.clone();
    let cancel_flag = get_download_cancelled().clone();

    std::thread::spawn(move || {
        match download_model_sync(&app_clone, &path_clone, &cancel_flag) {
            Ok(_) => {
                logger::info("Semantic", "Model download completed");

                // Update status
                if let Some(state) = app_clone.try_state::<SemanticState>() {
                    if let Ok(mut status) = state.status.write() {
                        status.model_downloaded = true;
                        status.download_progress = None;
                    }

                    // Start bulk indexing if semantic is enabled
                    if let Ok(status) = state.status.read() {
                        if status.enabled {
                            logger::info("Semantic", "Starting bulk indexing after model download");
                            super::embedding::index_all_items(app_clone.clone());
                        }
                    }
                }

                let _ = app_clone.emit("powerclip:semantic-download-complete", ());
            }
            Err(e) => {
                logger::error("Semantic", &format!("Model download failed: {}", e));

                // Update status
                if let Some(state) = app_clone.try_state::<SemanticState>() {
                    if let Ok(mut status) = state.status.write() {
                        status.download_progress = None;
                    }
                }

                let _ = app_clone.emit("powerclip:semantic-download-error", e.clone());
            }
        }
    });

    Ok(())
}

/// Synchronous download implementation
fn download_model_sync(
    app: &tauri::AppHandle,
    path: &std::path::Path,
    cancel_flag: &Arc<AtomicBool>,
) -> Result<(), String> {
    // Build request with timeout
    let response = ureq::AgentBuilder::new()
        .timeout_read(Duration::from_secs(30))
        .timeout_write(Duration::from_secs(30))
        .build()
        .get(SEMANTIC_MODEL_URL)
        .call()
        .map_err(|e| {
            let err_msg = e.to_string();
            if err_msg.contains("timeout") || err_msg.contains("timed out") {
                "Connection timeout - please check your network or try manual download".to_string()
            } else if err_msg.contains("dns") || err_msg.contains("resolve") {
                "DNS resolution failed - please check your network".to_string()
            } else if err_msg.contains("connection refused") || err_msg.contains("connect") {
                "Connection failed - server may be unreachable".to_string()
            } else {
                format!("Network error: {} - try manual download", err_msg)
            }
        })?;

    let status = response.status();
    if status != 200 {
        return Err(format!("HTTP error {} - try manual download", status));
    }

    let content_length = response.header("Content-Length")
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    let mut file = File::create(path).map_err(|e| format!("Failed to create file: {}", e))?;

    let mut reader = response.into_reader();
    let mut buffer = [0u8; 8192];
    let mut downloaded: u64 = 0;
    let mut last_reported_progress = 0.0;
    let mut no_progress_count = 0;

    loop {
        // Check for cancellation
        if cancel_flag.load(Ordering::SeqCst) {
            // Delete partial file
            let _ = std::fs::remove_file(path);
            return Err("Download cancelled".to_string());
        }

        let bytes_read = match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                no_progress_count += 1;
                if no_progress_count > 100 {
                    return Err("Download stalled - please try manual download".to_string());
                }
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            Err(e) => {
                // Delete partial file on error
                let _ = std::fs::remove_file(path);
                return Err(format!("Read error: {} - try manual download", e));
            }
        };

        no_progress_count = 0;
        file.write_all(&buffer[..bytes_read]).map_err(|e| {
            let _ = std::fs::remove_file(path);
            format!("Write error: {}", e)
        })?;
        downloaded += bytes_read as u64;

        // Report progress
        if content_length > 0 {
            let progress = downloaded as f64 / content_length as f64;

            // Only emit if progress changed by at least 1%
            if (progress - last_reported_progress).abs() >= 0.01 || progress >= 1.0 {
                last_reported_progress = progress;

                if let Some(state) = app.try_state::<SemanticState>() {
                    if let Ok(mut status) = state.status.write() {
                        status.download_progress = Some(progress);
                    }
                }

                let _ = app.emit("powerclip:semantic-download-progress", progress);
            }
        }
    }

    file.flush().map_err(|e| format!("Flush error: {}", e))?;

    // Verify file size
    let metadata = std::fs::metadata(path).map_err(|e| format!("Failed to verify file: {}", e))?;
    if metadata.len() < MIN_MODEL_SIZE_BYTES {
        let _ = std::fs::remove_file(path);
        return Err("Downloaded file is too small - may be corrupted".to_string());
    }

    Ok(())
}

/// Load the model into memory
pub fn load_model() -> Result<SemanticModel, String> {
    let path = model_path();

    if !path.exists() {
        return Err("Model file not found".to_string());
    }

    logger::info("Semantic", "Loading model...");

    let backend = llama_cpp_2::llama_backend::LlamaBackend::init()
        .map_err(|e| format!("Failed to init backend: {}", e))?;

    let model_params = llama_cpp_2::model::params::LlamaModelParams::default();

    let model = llama_cpp_2::model::LlamaModel::load_from_file(
        &backend,
        &path,
        &model_params,
    ).map_err(|e| format!("Failed to load model: {}", e))?;

    logger::info("Semantic", "Model loaded successfully");

    Ok(SemanticModel { backend, model })
}

/// Ensure model is loaded (lazy loading)
pub fn ensure_model_loaded(state: &SemanticState) -> Result<(), String> {
    let mut model_guard = state.model.lock().map_err(|e| e.to_string())?;

    if model_guard.is_none() {
        let model = load_model()?;
        *model_guard = Some(model);

        if let Ok(mut status) = state.status.write() {
            status.model_loaded = true;
        }
    }

    Ok(())
}

/// Unload the model from memory
#[allow(dead_code)]
pub fn unload_model(state: &SemanticState) {
    if let Ok(mut model_guard) = state.model.lock() {
        *model_guard = None;
    }

    if let Ok(mut status) = state.status.write() {
        status.model_loaded = false;
    }

    logger::info("Semantic", "Model unloaded");
}
