//! Extension commands - Run external commands with clipboard content

use std::process::Stdio;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::logger;

/// CREATE_NO_WINDOW flag to prevent console window from appearing
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Check if the command is a PowerShell command that should be run directly.
/// PowerShell commands with pipes or special characters don't work well through cmd /C.
#[cfg(target_os = "windows")]
fn is_powershell_command(command: &str) -> bool {
    let lower = command.to_lowercase();
    lower.starts_with("powershell ") || lower.starts_with("pwsh ")
}

/// Simple command line parser for PowerShell commands.
/// Handles basic quoting with double quotes.
#[cfg(target_os = "windows")]
fn parse_command_simple(command: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let chars: Vec<char> = command.chars().collect();

    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];

        if c == '"' {
            in_quotes = !in_quotes;
        } else if c == ' ' && !in_quotes {
            if !current.is_empty() {
                parts.push(current.clone());
                current.clear();
            }
        } else {
            current.push(c);
        }
        i += 1;
    }

    if !current.is_empty() {
        parts.push(current);
    }

    parts
}

/// Run an extension command, piping `content` to its stdin.
///
/// Returns `Ok(stdout_output)` on success, `Err(message)` on failure/timeout.
#[tauri::command]
pub async fn run_extension(command: String, content: String, timeout: i64) -> Result<String, String> {
    logger::info("Extension", &format!("Running: {}", command));

    #[cfg(target_os = "windows")]
    let mut child = {
        // On Windows, we need to handle PowerShell commands differently.
        // PowerShell commands with pipes ($input | ...) don't work correctly through cmd /C
        // because cmd.exe interprets the pipe character before PowerShell sees it.
        if is_powershell_command(&command) {
            // Parse PowerShell command: "powershell -Command \"...\""
            // We need to extract the arguments and run PowerShell directly
            let parts = parse_command_simple(&command);

            if parts.is_empty() {
                return Err("Empty command".to_string());
            }

            let program = &parts[0];
            let args = &parts[1..];

            // Build the PowerShell command with proper arguments
            let mut cmd = Command::new(program);
            cmd.args(args)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .creation_flags(CREATE_NO_WINDOW);

            cmd.spawn()
                .map_err(|e| format!("Failed to spawn process: {}", e))?
        } else {
            // For non-PowerShell commands, use cmd /C
            Command::new("cmd")
                .args(["/C", &command])
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("Failed to spawn process: {}", e))?
        }
    };

    #[cfg(not(target_os = "windows"))]
    let mut child = {
        Command::new("sh")
            .args(["-c", &command])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn process: {}", e))?
    };

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
            // Wait with timeout
            // Take stdout before timeout so we can kill the process if needed
            let mut stdout_reader = child.stdout.take();
            let duration = std::time::Duration::from_millis(t as u64);

            let wait_result = tokio::time::timeout(duration, child.wait()).await;

            match wait_result {
                Ok(Ok(status)) => {
                    // Process completed within timeout, read stdout
                    let mut stdout_buf = Vec::new();
                    if let Some(ref mut out) = stdout_reader {
                        let _ = out.read_to_end(&mut stdout_buf).await;
                    }
                    if status.success() {
                        let output = String::from_utf8_lossy(&stdout_buf).to_string();
                        logger::info("Extension", &format!("Process succeeded, stdout {} bytes", output.len()));
                        Ok(output)
                    } else {
                        Err(format!("Process exited with code {:?}", status.code()))
                    }
                }
                Ok(Err(e)) => Err(format!("Failed to wait for process: {}", e)),
                Err(_) => {
                    // Timeout - kill the process
                    logger::info("Extension", "Process timed out, killing");
                    let _ = child.kill().await;
                    Err("Extension timed out".to_string())
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "windows")]
    #[test]
    fn test_is_powershell_command() {
        assert!(is_powershell_command("powershell -Command \"echo hello\""));
        assert!(is_powershell_command("PowerShell -Command \"echo hello\""));
        assert!(is_powershell_command("POWERSHELL -Command \"echo hello\""));
        assert!(is_powershell_command("pwsh -Command \"echo hello\""));
        assert!(is_powershell_command("pwsh -c \"echo hello\""));

        assert!(!is_powershell_command("cmd /C echo hello"));
        assert!(!is_powershell_command("echo hello"));
        assert!(!is_powershell_command("notepad"));
        assert!(!is_powershell_command("my-script.bat"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn test_is_powershell_command_with_pipes() {
        // The command from settings.json
        assert!(is_powershell_command("powershell -Command \"$input | ForEach-Object { $_.ToUpper() }\""));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn test_parse_command_simple() {
        // Basic command
        let parts = parse_command_simple("powershell -Command \"echo hello\"");
        assert_eq!(parts, vec!["powershell", "-Command", "echo hello"]);

        // Command with pipes
        let parts = parse_command_simple("powershell -Command \"$input | ForEach-Object { $_.ToUpper() }\"");
        assert_eq!(parts, vec!["powershell", "-Command", "$input | ForEach-Object { $_.ToUpper() }"]);

        // Command with multiple spaces
        let parts = parse_command_simple("powershell   -Command   \"test\"");
        assert_eq!(parts, vec!["powershell", "-Command", "test"]);

        // Empty command
        let parts = parse_command_simple("");
        assert!(parts.is_empty());

        // Command without quotes
        let parts = parse_command_simple("echo hello world");
        assert_eq!(parts, vec!["echo", "hello", "world"]);
    }

    #[tokio::test]
    async fn test_run_extension_fire_and_forget() {
        #[cfg(target_os = "windows")]
        let cmd = "echo test";
        #[cfg(not(target_os = "windows"))]
        let cmd = "echo test";

        let result = run_extension(cmd.to_string(), "input".to_string(), 0).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "");
    }

    #[tokio::test]
    async fn test_run_extension_with_output() {
        #[cfg(target_os = "windows")]
        let cmd = "echo hello";
        #[cfg(not(target_os = "windows"))]
        let cmd = "echo hello";

        let result = run_extension(cmd.to_string(), "".to_string(), 5000).await;
        assert!(result.is_ok());
        let output = result.unwrap();
        assert!(output.contains("hello") || output.contains("hello\r\n") || output == "hello\n");
    }

    #[tokio::test]
    async fn test_run_extension_with_stdin() {
        #[cfg(target_os = "windows")]
        // On Windows, use PowerShell to read from stdin and output
        let cmd = "powershell -Command \"$input\"";
        #[cfg(not(target_os = "windows"))]
        let cmd = "cat";

        let result = run_extension(cmd.to_string(), "test input".to_string(), 5000).await;
        assert!(result.is_ok());
        let output = result.unwrap();
        assert!(output.contains("test input"), "Expected output to contain 'test input', got: {}", output);
    }

    #[tokio::test]
    async fn test_run_extension_timeout() {
        #[cfg(target_os = "windows")]
        let cmd = "timeout /t 10";  // Windows sleep for 10 seconds
        #[cfg(not(target_os = "windows"))]
        let cmd = "sleep 10";

        let result = run_extension(cmd.to_string(), "".to_string(), 100).await; // 100ms timeout
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("timed out"));
    }

    #[tokio::test]
    async fn test_run_extension_invalid_command() {
        #[cfg(target_os = "windows")]
        let cmd = "nonexistent_command_12345_xyz";
        #[cfg(not(target_os = "windows"))]
        let cmd = "nonexistent_command_12345_xyz";

        let result = run_extension(cmd.to_string(), "".to_string(), 5000).await;
        assert!(result.is_err());
    }
}
