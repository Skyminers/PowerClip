//! Clipboard monitor - Background polling thread

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use crate::config::CLIPBOARD_POLL_INTERVAL_MS;
use crate::logger;

static MONITOR_RUNNING: AtomicBool = AtomicBool::new(false);
/// Current polling interval in milliseconds (hot-reloadable from settings).
static POLL_INTERVAL_MS: AtomicU64 = AtomicU64::new(CLIPBOARD_POLL_INTERVAL_MS);

/// Update the clipboard polling interval (called when settings change).
pub fn set_poll_interval(ms: u64) {
    POLL_INTERVAL_MS.store(ms, Ordering::Relaxed);
}

/// Start the clipboard monitor thread.
///
/// Polls clipboard at the configured interval (see `set_poll_interval`) and
/// emits Tauri events to trigger the actual clipboard check on the main thread.
pub fn start_clipboard_monitor(app: AppHandle) {
    if MONITOR_RUNNING.swap(true, Ordering::SeqCst) {
        logger::warning("Monitor", "Clipboard monitor already running");
        return;
    }

    thread::spawn(move || {
        logger::info("Monitor", &format!("Started (interval: {}ms)", POLL_INTERVAL_MS.load(Ordering::Relaxed)));

        while MONITOR_RUNNING.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_millis(POLL_INTERVAL_MS.load(Ordering::Relaxed)));
            let _ = app.emit("powerclip:check-clipboard", ());
        }
    });
}
