//! Logger module - Simple logging to file
//!
//! Provides structured logging to file with configurable log levels.

use std::fs::OpenOptions;
use std::io::Write;
use std::sync::{Mutex, OnceLock};

use chrono::Local;

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
                .write(true)
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

        // Format log line
        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
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
