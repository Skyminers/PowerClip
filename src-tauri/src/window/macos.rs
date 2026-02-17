//! macOS native API utilities
//!
//! Provides macOS-specific window management via Objective-C runtime.

use objc2::runtime::AnyObject;
use objc2::{class, msg_send};

/// Activate an application by its bundle identifier.
pub fn activate_app(bundle_id: &str) {
    unsafe {
        let workspace: *mut AnyObject = msg_send![class!(NSWorkspace), sharedWorkspace];
        let apps: *mut AnyObject = msg_send![workspace, runningApplications];
        let count: usize = msg_send![apps, count];

        for i in 0..count {
            let app: *mut AnyObject = msg_send![apps, objectAtIndex: i];
            let bid: *mut AnyObject = msg_send![app, bundleIdentifier];
            if bid.is_null() {
                continue;
            }
            let utf8: *const std::ffi::c_char = msg_send![bid, UTF8String];
            if utf8.is_null() {
                continue;
            }
            let current = std::ffi::CStr::from_ptr(utf8).to_string_lossy();
            if current == bundle_id {
                let _: bool = msg_send![app, activateWithOptions: 1usize];
                return;
            }
        }
    }
}

/// Get the bundle identifier of the currently frontmost application.
pub fn get_frontmost_bundle_id() -> Option<String> {
    unsafe {
        let workspace: *mut AnyObject = msg_send![class!(NSWorkspace), sharedWorkspace];
        let app: *mut AnyObject = msg_send![workspace, frontmostApplication];
        if app.is_null() {
            return None;
        }
        let bundle_id: *mut AnyObject = msg_send![app, bundleIdentifier];
        if bundle_id.is_null() {
            return None;
        }
        let utf8: *const std::ffi::c_char = msg_send![bundle_id, UTF8String];
        if utf8.is_null() {
            return None;
        }
        Some(std::ffi::CStr::from_ptr(utf8).to_string_lossy().into_owned())
    }
}
