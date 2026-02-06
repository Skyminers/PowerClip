//! Logger module - Simple logging to file

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use chrono::Local;

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
}

struct LoggerInner {
    level: LogLevel,
    file: std::fs::File,
}

struct Logger {
    inner: Mutex<LoggerInner>,
}

impl Logger {
    fn global() -> &'static Logger {
        static LOGGER: OnceLock<Logger> = OnceLock::new();
        LOGGER.get_or_init(|| {
            let data_dir = dirs::data_dir()
                .unwrap_or(PathBuf::from("."))
                .join("PowerClip");
            let log_file = data_dir.join("powerclip.log");

            let _ = std::fs::create_dir_all(&data_dir);

            let file = OpenOptions::new()
                .create(true)
                .append(true)
                .write(true)
                .open(&log_file)
                .expect("Failed to open log file");

            let level = if cfg!(debug_assertions) {
                LogLevel::Debug
            } else {
                LogLevel::Info
            };

            Logger {
                inner: Mutex::new(LoggerInner { level, file }),
            }
        })
    }

    fn log(&self, level: LogLevel, module: &str, message: &str) {
        let mut inner = self.inner.lock().unwrap();

        if (level as u8) < (inner.level as u8) {
            return;
        }

        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
        let log_line = format!(
            "[{}] [{}] [{}] {}\n",
            timestamp,
            level.as_str(),
            module,
            message
        );

        let _ = inner.file.write_all(log_line.as_bytes());
        let _ = inner.file.flush();
    }
}

// Global logging functions
#[inline]
pub fn debug(module: &str, message: &str) {
    Logger::global().log(LogLevel::Debug, module, message);
}

#[inline]
pub fn info(module: &str, message: &str) {
    Logger::global().log(LogLevel::Info, module, message);
}

#[inline]
pub fn warning(module: &str, message: &str) {
    Logger::global().log(LogLevel::Warning, module, message);
}

#[inline]
pub fn error(module: &str, message: &str) {
    Logger::global().log(LogLevel::Error, module, message);
}
