//! Paste simulation - Platform-specific keyboard event generation

/// Simulate paste action (Cmd+V on macOS, Ctrl+V on Windows).
#[tauri::command]
pub async fn simulate_paste() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::ffi::c_void;

        #[link(name = "CoreGraphics", kind = "framework")]
        extern "C" {
            fn CGEventSourceCreate(stateID: i32) -> *mut c_void;
            fn CGEventCreateKeyboardEvent(source: *mut c_void, keycode: u16, key_down: bool) -> *mut c_void;
            fn CGEventSetFlags(event: *mut c_void, flags: u64);
            fn CGEventPost(tap: u32, event: *mut c_void);
            fn CFRelease(cf: *mut c_void);
        }

        const HID_SYSTEM_STATE: i32 = 1;
        const HID_TAP: u32 = 0;
        const CMD_FLAG: u64 = 0x0000000000100000; // kCGEventFlagMaskCommand
        const V_KEYCODE: u16 = 9;

        unsafe {
            let source = CGEventSourceCreate(HID_SYSTEM_STATE);
            if source.is_null() {
                return Err("Failed to create CGEventSource".to_string());
            }

            let key_down = CGEventCreateKeyboardEvent(source, V_KEYCODE, true);
            let key_up = CGEventCreateKeyboardEvent(source, V_KEYCODE, false);

            if key_down.is_null() || key_up.is_null() {
                CFRelease(source);
                return Err("Failed to create keyboard event".to_string());
            }

            CGEventSetFlags(key_down, CMD_FLAG);
            CGEventSetFlags(key_up, CMD_FLAG);

            CGEventPost(HID_TAP, key_down);
            CGEventPost(HID_TAP, key_up);

            CFRelease(key_down);
            CFRelease(key_up);
            CFRelease(source);
        }
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
            KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL, VK_V,
        };

        let inputs = [
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT { wVk: VK_CONTROL, ..Default::default() },
                },
            },
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT { wVk: VK_V, ..Default::default() },
                },
            },
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT { wVk: VK_V, dwFlags: KEYEVENTF_KEYUP, ..Default::default() },
                },
            },
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT { wVk: VK_CONTROL, dwFlags: KEYEVENTF_KEYUP, ..Default::default() },
                },
            },
        ];

        let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent != inputs.len() as u32 {
            return Err("SendInput failed to send all key events".to_string());
        }
    }

    Ok(())
}
