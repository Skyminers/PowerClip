//! Clipboard monitor - Background monitoring using arboard
//!
//! This module provides efficient clipboard monitoring by polling the clipboard
//! using arboard. The actual clipboard check is done via Tauri commands
//! invoked on the main thread.

use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::config::CLIPBOARD_POLL_INTERVAL_MS;
use crate::logger;

/// Global flag to control monitor thread
static MONITOR_RUNNING: AtomicBool = AtomicBool::new(false);

/// Start the clipboard monitor thread
///
/// This function spawns a background thread that periodically checks the clipboard.
/// The actual clipboard check is dispatched to the main thread using Tauri events.
///
/// The thread will gracefully exit when `stop_clipboard_monitor()` is called.
#[inline]
pub fn start_clipboard_monitor(app: AppHandle) {
    // Don't start if already running
    if MONITOR_RUNNING.swap(true, Ordering::SeqCst) {
        logger::warning("Monitor", "Clipboard monitor already running");
        return;
    }

    // Clone app handle for use in thread
    let app = app.app_handle().clone();

    thread::spawn(move || {
        logger::info("Monitor", &format!(
            "Clipboard monitor started (interval: {}ms)",
            CLIPBOARD_POLL_INTERVAL_MS
        ));

        while MONITOR_RUNNING.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_millis(CLIPBOARD_POLL_INTERVAL_MS));

            // Emit event to trigger clipboard check
            // This will be handled by the event listener in setup
            let _ = app.emit("powerclip:check-clipboard", ());
        }

        logger::info("Monitor", "Clipboard monitor stopped");
    });
}

/// Stop the clipboard monitor thread gracefully
///
/// This function signals the monitor thread to exit and waits for it to complete.
#[inline]
#[allow(dead_code)]
pub fn stop_clipboard_monitor() {
    MONITOR_RUNNING.store(false, Ordering::SeqCst);
}

/// Check if the clipboard monitor is running
#[inline]
#[allow(dead_code)]
pub fn is_monitor_running() -> bool {
    MONITOR_RUNNING.load(Ordering::SeqCst)
}
