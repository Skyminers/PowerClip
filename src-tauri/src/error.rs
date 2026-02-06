//! Error module - Unified error types for the application
//!
//! This module provides a comprehensive error enum that wraps all possible
//! error types in the application, making error handling more consistent.

use std::fmt;

/// Application error type that wraps all possible errors
#[derive(Debug)]
pub enum PowerClipError {
    /// Clipboard operation failed
    Clipboard(String),
    /// Database operation failed
    Database(String),
    /// File I/O operation failed
    Io(String),
    /// Hotkey registration failed
    Hotkey(String),
    /// Window operation failed
    Window(String),
    /// Configuration error
    Config(String),
    /// Image processing failed
    Image(String),
    /// JSON serialization/deserialization failed
    Json(String),
}

impl fmt::Display for PowerClipError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PowerClipError::Clipboard(msg) => write!(f, "Clipboard error: {}", msg),
            PowerClipError::Database(msg) => write!(f, "Database error: {}", msg),
            PowerClipError::Io(msg) => write!(f, "I/O error: {}", msg),
            PowerClipError::Hotkey(msg) => write!(f, "Hotkey error: {}", msg),
            PowerClipError::Window(msg) => write!(f, "Window error: {}", msg),
            PowerClipError::Config(msg) => write!(f, "Config error: {}", msg),
            PowerClipError::Image(msg) => write!(f, "Image error: {}", msg),
            PowerClipError::Json(msg) => write!(f, "JSON error: {}", msg),
        }
    }
}

impl std::error::Error for PowerClipError {}

/// Helper trait for converting common error types to PowerClipError
pub trait ToPowerClipError<T> {
    fn to_clipboard_error(self) -> Result<T, PowerClipError>;
    fn to_database_error(self) -> Result<T, PowerClipError>;
    fn to_io_error(self) -> Result<T, PowerClipError>;
    fn to_window_error(self) -> Result<T, PowerClipError>;
    fn to_image_error(self) -> Result<T, PowerClipError>;
    fn to_json_error(self) -> Result<T, PowerClipError>;
}

impl<T, E: fmt::Display> ToPowerClipError<T> for Result<T, E> {
    fn to_clipboard_error(self) -> Result<T, PowerClipError> {
        self.map_err(|e| PowerClipError::Clipboard(e.to_string()))
    }

    fn to_database_error(self) -> Result<T, PowerClipError> {
        self.map_err(|e| PowerClipError::Database(e.to_string()))
    }

    fn to_io_error(self) -> Result<T, PowerClipError> {
        self.map_err(|e| PowerClipError::Io(e.to_string()))
    }

    fn to_window_error(self) -> Result<T, PowerClipError> {
        self.map_err(|e| PowerClipError::Window(e.to_string()))
    }

    fn to_image_error(self) -> Result<T, PowerClipError> {
        self.map_err(|e| PowerClipError::Image(e.to_string()))
    }

    fn to_json_error(self) -> Result<T, PowerClipError> {
        self.map_err(|e| PowerClipError::Json(e.to_string()))
    }
}

/// Convenience function for simple error conversion
#[inline]
pub fn err<T>(msg: impl fmt::Display) -> Result<T, PowerClipError> {
    Err(PowerClipError::Config(msg.to_string()))
}
