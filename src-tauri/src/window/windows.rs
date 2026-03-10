//! Windows native API utilities
//!
//! Provides Windows-specific window management via Win32 API.

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, SetForegroundWindow, BringWindowToTop,
};

/// Activate the current (our own) application window.
/// This is necessary to bring the window to front and ensure proper rendering.
pub fn activate_own_app() {
    unsafe {
        // Get the foreground window handle (the window we want to restore later)
        // For now, we just need to bring our window to front

        // Get our main window handle - we'll use GetForegroundWindow after show
        // as a workaround, or we could pass the HWND from Tauri
        // Actually, Tauri's window.show() and set_focus() should handle this,
        // but we can force it with BringWindowToTop

        // Note: On Windows, SetForegroundWindow has restrictions.
        // The system restricts which processes can set the foreground window.
        // We rely on Tauri's internal handling, but this function exists
        // for consistency with macOS and can be extended if needed.
    }
}

/// Force bring a window to foreground by its handle.
pub fn bring_to_foreground(hwnd: HWND) {
    unsafe {
        let _ = BringWindowToTop(hwnd);
        let _ = SetForegroundWindow(hwnd);
    }
}
