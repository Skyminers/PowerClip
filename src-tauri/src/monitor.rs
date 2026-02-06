//! Clipboard monitor - Background monitoring using arboard
//!
//! This module provides efficient clipboard monitoring by polling the clipboard
//! using arboard. The actual clipboard check is done via Tauri commands
//! invoked on the main thread.

use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::logger;
use crate::CLIPBOARD_POLL_INTERVAL_MS;

/// Start the clipboard monitor thread
///
/// This function spawns a background thread that periodically checks the clipboard.
/// The actual clipboard check is dispatched to the main thread using Tauri events.
#[inline]
pub fn start_clipboard_monitor(app: AppHandle) {
    // Clone app handle for use in thread
    let app = app.app_handle().clone();

    thread::spawn(move || {
        logger::info("Monitor", &format!("Clipboard monitor started (interval: {}ms)", CLIPBOARD_POLL_INTERVAL_MS));

        loop {
            thread::sleep(Duration::from_millis(CLIPBOARD_POLL_INTERVAL_MS));

            // Emit event to trigger clipboard check
            // This will be handled by the event listener in setup
            let _ = app.emit("powerclip:check-clipboard", ());
        }
    });
}
