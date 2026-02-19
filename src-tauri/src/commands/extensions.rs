//! Extension commands - Run external commands with clipboard content

use std::process::Stdio;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

use crate::logger;

/// Run an extension command, piping `content` to its stdin.
///
/// Returns `Ok(stdout_output)` on success, `Err(message)` on failure/timeout.
#[tauri::command]
pub async fn run_extension(command: String, content: String, timeout: i64) -> Result<String, String> {
    logger::info("Extension", &format!("Running: {}", command));

    let mut child = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", &command])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
    } else {
        Command::new("sh")
            .args(["-c", &command])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
    }
    .map_err(|e| format!("Failed to spawn process: {}", e))?;

    // Write content to stdin then close it
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(content.as_bytes())
            .await
            .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        // stdin is dropped here, closing the pipe
    }

    match timeout {
        0 => {
            // Fire and forget
            logger::info("Extension", "Fire-and-forget mode, returning immediately");
            Ok(String::new())
        }
        t if t < 0 => {
            // Wait indefinitely
            let output = child
                .wait_with_output()
                .await
                .map_err(|e| format!("Failed to wait for process: {}", e))?;
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                logger::info("Extension", &format!("Process succeeded, stdout {} bytes", stdout.len()));
                Ok(stdout)
            } else {
                Err(format!("Process exited with code {:?}", output.status.code()))
            }
        }
        t => {
            // Wait with timeout: read stdout manually since wait_with_output takes ownership
            let mut stdout_buf = Vec::new();
            if let Some(mut stdout) = child.stdout.take() {
                let _ = stdout.read_to_end(&mut stdout_buf).await;
            }
            let duration = std::time::Duration::from_millis(t as u64);
            match tokio::time::timeout(duration, child.wait()).await {
                Ok(Ok(status)) => {
                    if status.success() {
                        let stdout = String::from_utf8_lossy(&stdout_buf).to_string();
                        logger::info("Extension", &format!("Process succeeded, stdout {} bytes", stdout.len()));
                        Ok(stdout)
                    } else {
                        Err(format!("Process exited with code {:?}", status.code()))
                    }
                }
                Ok(Err(e)) => Err(format!("Failed to wait for process: {}", e)),
                Err(_) => {
                    logger::info("Extension", "Process timed out, killing");
                    let _ = child.kill().await;
                    Err("Extension timed out".to_string())
                }
            }
        }
    }
}
