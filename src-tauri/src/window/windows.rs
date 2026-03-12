//! Windows native API utilities
//!
//! Provides Windows-specific window management via Win32 API.

use std::ffi::c_void;

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{BringWindowToTop, SetForegroundWindow};

use crate::logger;

/// Force bring a window to foreground by its handle.
/// Returns true if both operations succeeded.
pub fn bring_to_foreground(hwnd: *mut c_void) -> bool {
    unsafe {
        let hwnd = HWND(hwnd);
        let bring_result = BringWindowToTop(hwnd);
        let foreground_result = SetForegroundWindow(hwnd);

        let success = bring_result.is_ok() && foreground_result.as_bool();
        if !success {
            logger::warning(
                "Window",
                &format!(
                    "bring_to_foreground partially failed: BringWindowToTop={}, SetForegroundWindow={}",
                    bring_result.is_ok(),
                    foreground_result.as_bool()
                ),
            );
        }
        success
    }
}
