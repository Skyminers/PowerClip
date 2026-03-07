//! Logger module - Simple logging to file
//!
//! Provides structured logging to file with configurable log levels.

use std::fs::OpenOptions;
use std::io::Write;
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

/// Log level enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Debug,
    Info,
    Warning,
    Error,
}

impl LogLevel {
    #[inline]
    fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Debug => "DEBUG",
            LogLevel::Info => "INFO",
            LogLevel::Warning => "WARNING",
            LogLevel::Error => "ERROR",
        }
    }

    /// Get the effective log level based on build type
    #[inline]
    pub fn effective() -> Self {
        if cfg!(debug_assertions) {
            Self::Debug
        } else {
            Self::Info
        }
    }
}

/// Internal logger state
struct LoggerInner {
    level: LogLevel,
    file: std::fs::File,
}

/// Thread-safe logger wrapper
struct Logger {
    inner: Mutex<LoggerInner>,
}

impl Logger {
    /// Get the global logger instance
    fn global() -> &'static Logger {
        static LOGGER: OnceLock<Logger> = OnceLock::new();
        LOGGER.get_or_init(|| {
            // Use config module for path
            let log_path = crate::config::log_path();
            let data_dir = crate::config::data_dir();

            // Ensure log directory exists
            let _ = std::fs::create_dir_all(data_dir);

            // Open log file
            let file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&log_path)
                .expect("Failed to open log file");

            let level = LogLevel::effective();

            Logger {
                inner: Mutex::new(LoggerInner { level, file }),
            }
        })
    }

    /// Log a message with the given level
    fn log(&self, level: LogLevel, module: &str, message: &str) {
        let mut inner = self.inner.lock().unwrap();

        // Check if this level should be logged
        if (level as u8) < (inner.level as u8) {
            return;
        }

        // Format log line - use SystemTime to avoid timezone issues during shutdown
        let timestamp = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| format!("{:.3}", d.as_secs_f64()))
            .unwrap_or_else(|_| "0.000".to_string());
        let log_line = format!(
            "[{}] [{}] [{}] {}\n",
            timestamp,
            level.as_str(),
            module,
            message
        );

        // Write to file
        let _ = inner.file.write_all(log_line.as_bytes());
        let _ = inner.file.flush();
    }
}

// ============================================================================
// Public Logging API
// ============================================================================

/// Log a debug message
#[inline]
pub fn debug(module: &str, message: &str) {
    Logger::global().log(LogLevel::Debug, module, message);
}

/// Log an info message
#[inline]
pub fn info(module: &str, message: &str) {
    Logger::global().log(LogLevel::Info, module, message);
}

/// Log a warning message
#[inline]
pub fn warning(module: &str, message: &str) {
    Logger::global().log(LogLevel::Warning, module, message);
}

/// Log an error message
#[inline]
pub fn error(module: &str, message: &str) {
    Logger::global().log(LogLevel::Error, module, message);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_level_as_str() {
        assert_eq!(LogLevel::Debug.as_str(), "DEBUG");
        assert_eq!(LogLevel::Info.as_str(), "INFO");
        assert_eq!(LogLevel::Warning.as_str(), "WARNING");
        assert_eq!(LogLevel::Error.as_str(), "ERROR");
    }

    #[test]
    fn test_log_level_ordering() {
        // LogLevel values are ordered: Debug < Info < Warning < Error
        assert!((LogLevel::Debug as u8) < (LogLevel::Info as u8));
        assert!((LogLevel::Info as u8) < (LogLevel::Warning as u8));
        assert!((LogLevel::Warning as u8) < (LogLevel::Error as u8));
    }

    #[test]
    fn test_log_level_effective() {
        let level = LogLevel::effective();
        // In debug builds, should be Debug; in release, should be Info
        if cfg!(debug_assertions) {
            assert_eq!(level, LogLevel::Debug);
        } else {
            assert_eq!(level, LogLevel::Info);
        }
    }

    #[test]
    fn test_log_functions_dont_panic() {
        // These should not panic even if called multiple times
        debug("TestModule", "Test debug message");
        info("TestModule", "Test info message");
        warning("TestModule", "Test warning message");
        error("TestModule", "Test error message");
    }

    #[test]
    fn test_log_with_empty_strings() {
        debug("", "");
        info("", "");
        warning("", "");
        error("", "");
    }

    #[test]
    fn test_log_with_unicode() {
        debug("测试模块", "测试消息 🎉");
        info("模块", "消息 你好世界");
    }

    #[test]
    fn test_log_with_special_characters() {
        debug("Module", "Message with\nnewline");
        info("Module", "Message with\ttab");
        error("Module", "Message with \"quotes\" and 'apostrophes'");
    }

    #[test]
    fn test_log_with_long_message() {
        let long_message = "x".repeat(10000);
        info("Module", &long_message);
    }
}
