//! Clipboard monitor - Background polling thread

use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use crate::config::CLIPBOARD_POLL_INTERVAL_MS;
use crate::logger;

static MONITOR_RUNNING: AtomicBool = AtomicBool::new(false);

/// Start the clipboard monitor thread.
///
/// Polls clipboard at a fixed interval and emits Tauri events to trigger
/// the actual clipboard check on the main thread.
pub fn start_clipboard_monitor(app: AppHandle) {
    if MONITOR_RUNNING.swap(true, Ordering::SeqCst) {
        logger::warning("Monitor", "Clipboard monitor already running");
        return;
    }

    thread::spawn(move || {
        logger::info("Monitor", &format!("Started (interval: {}ms)", CLIPBOARD_POLL_INTERVAL_MS));

        while MONITOR_RUNNING.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_millis(CLIPBOARD_POLL_INTERVAL_MS));
            let _ = app.emit("powerclip:check-clipboard", ());
        }
    });
}
