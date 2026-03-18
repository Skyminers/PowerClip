//! Clipboard module - Unified clipboard operations using arboard
//!
//! Provides a cross-platform interface for reading and writing clipboard content.
//! On macOS, clipboard operations must run on the main thread due to AppKit requirements.

use arboard::Clipboard;

/// Clipboard content variants.
#[derive(Debug, Clone)]
pub enum ClipboardContent {
    Text(String),
    Image(ImageData),
    Files(FileData),
}

/// Image data extracted from clipboard.
#[derive(Debug, Clone)]
pub struct ImageData {
    pub bytes: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// File data extracted from clipboard.
/// Contains paths to files that were copied.
#[derive(Debug, Clone)]
pub struct FileData {
    pub paths: Vec<String>,
}

/// Get current clipboard content (image has priority over text).
///
/// Returns `None` if clipboard is empty or unavailable.
///
/// On macOS, this function dispatches to the main thread for AppKit compatibility.
#[cfg(target_os = "macos")]
pub fn get_clipboard_content() -> Option<ClipboardContent> {
    use std::sync::{Arc, Mutex};

    let result = Arc::new(Mutex::new(None));
    let result_clone = result.clone();

    dispatch::Queue::main().exec_sync(move || {
        let content = get_clipboard_content_impl();
        *result_clone.lock().unwrap() = content;
    });

    let guard = result.lock().unwrap();
    guard.clone()
}

/// Get current clipboard content (image has priority over text).
///
/// Returns `None` if clipboard is empty or unavailable.
#[cfg(not(target_os = "macos"))]
pub fn get_clipboard_content() -> Option<ClipboardContent> {
    get_clipboard_content_impl()
}

/// Internal implementation for getting clipboard content.
/// Priority: files > image > text
fn get_clipboard_content_impl() -> Option<ClipboardContent> {
    // Check for files first (platform-specific)
    #[cfg(target_os = "macos")]
    {
        if let Some(files) = get_clipboard_files_macos() {
            if !files.paths.is_empty() {
                return Some(ClipboardContent::Files(files));
            }
        }
    }

    // Check for files on Windows
    #[cfg(target_os = "windows")]
    {
        if let Some(files) = get_clipboard_files_windows() {
            if !files.paths.is_empty() {
                return Some(ClipboardContent::Files(files));
            }
        }
    }

    let mut clipboard = Clipboard::new().ok()?;

    if let Ok(image) = clipboard.get_image() {
        let bytes = image.bytes.to_vec();
        if !bytes.is_empty() {
            return Some(ClipboardContent::Image(ImageData {
                bytes,
                width: image.width as u32,
                height: image.height as u32,
            }));
        }
    }

    if let Ok(text) = clipboard.get_text() {
        if !text.is_empty() && !text.contains('\0') {
            return Some(ClipboardContent::Text(text));
        }
    }

    None
}

/// Get file paths from macOS clipboard using NSPasteboard.
#[cfg(target_os = "macos")]
fn get_clipboard_files_macos() -> Option<FileData> {
    use objc2_app_kit::NSPasteboard;
    use objc2_foundation::{NSPropertyListSerialization, NSArray, NSString};

    let pasteboard = NSPasteboard::generalPasteboard();

    // Get property list data for NSFilenamesPboardType
    let pb_type = NSString::from_str("NSFilenamesPboardType");

    // Try to get the property list for file names
    let data = pasteboard.dataForType(&pb_type)?;

    // Deserialize the property list (should be an array of file paths)
    let plist = unsafe {
        NSPropertyListSerialization::propertyListWithData_options_format_error(
            &data,
            objc2_foundation::NSPropertyListMutabilityOptions::Immutable,
            std::ptr::null_mut(),
        )
    }.ok()?;

    // Cast to NSArray (untyped)
    let paths_array = plist.downcast::<NSArray>().ok()?;

    // Extract paths
    let mut paths = Vec::new();
    for obj in paths_array.iter() {
        if let Some(path_str) = obj.downcast_ref::<NSString>() {
            let path = path_str.to_string();
            if !path.is_empty() {
                paths.push(path);
            }
        }
    }

    if paths.is_empty() {
        None
    } else {
        Some(FileData { paths })
    }
}

/// Set text to clipboard.
#[cfg(target_os = "macos")]
pub fn set_clipboard_text(text: &str) -> Result<(), String> {
    use std::sync::{Arc, Mutex};

    let text = text.to_string();
    let result = Arc::new(Mutex::new(Err("Not executed".to_string())));
    let result_clone = result.clone();

    dispatch::Queue::main().exec_sync(move || {
        *result_clone.lock().unwrap() = set_clipboard_text_impl(&text);
    });

    let guard = result.lock().unwrap();
    guard.clone()
}

/// Set text to clipboard.
#[cfg(not(target_os = "macos"))]
pub fn set_clipboard_text(text: &str) -> Result<(), String> {
    set_clipboard_text_impl(text)
}

/// Internal implementation for setting clipboard text.
fn set_clipboard_text_impl(text: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

/// Set image to clipboard from raw RGBA pixels.
///
/// On macOS, this function dispatches to the main thread for AppKit compatibility.
#[cfg(target_os = "macos")]
pub fn set_clipboard_image(width: u32, height: u32, pixels: &[u8]) -> Result<(), String> {
    use std::sync::{Arc, Mutex};

    let pixels = pixels.to_vec();
    let result = Arc::new(Mutex::new(Err("Not executed".to_string())));
    let result_clone = result.clone();

    dispatch::Queue::main().exec_sync(move || {
        *result_clone.lock().unwrap() = set_clipboard_image_impl(width, height, &pixels);
    });

    let guard = result.lock().unwrap();
    guard.clone()
}

/// Set image to clipboard from raw RGBA pixels.
#[cfg(not(target_os = "macos"))]
pub fn set_clipboard_image(width: u32, height: u32, pixels: &[u8]) -> Result<(), String> {
    set_clipboard_image_impl(width, height, pixels)
}

/// Internal implementation for setting clipboard image.
fn set_clipboard_image_impl(width: u32, height: u32, pixels: &[u8]) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;

    let image = arboard::ImageData {
        width: width.try_into().unwrap(),
        height: height.try_into().unwrap(),
        bytes: std::borrow::Cow::Borrowed(pixels),
    };

    clipboard.set_image(image).map_err(|e| e.to_string())
}

/// Set files to clipboard.
///
/// On macOS, this function dispatches to the main thread for AppKit compatibility.
#[cfg(target_os = "macos")]
pub fn set_clipboard_files(paths: &[String]) -> Result<(), String> {
    use std::sync::{Arc, Mutex};

    let paths = paths.to_vec();
    let result = Arc::new(Mutex::new(Err("Not executed".to_string())));
    let result_clone = result.clone();

    dispatch::Queue::main().exec_sync(move || {
        *result_clone.lock().unwrap() = set_clipboard_files_impl(&paths);
    });

    let guard = result.lock().unwrap();
    guard.clone()
}

/// Set files to clipboard.
#[cfg(not(target_os = "macos"))]
pub fn set_clipboard_files(paths: &[String]) -> Result<(), String> {
    set_clipboard_files_impl(paths)
}

/// Internal implementation for setting clipboard files.
#[cfg(target_os = "macos")]
fn set_clipboard_files_impl(paths: &[String]) -> Result<(), String> {
    use objc2::rc::Retained;
    use objc2_app_kit::NSPasteboard;
    use objc2_foundation::{NSArray, NSString, NSPropertyListSerialization};

    if paths.is_empty() {
        return Err("No file paths provided".to_string());
    }

    let pasteboard = NSPasteboard::generalPasteboard();
    pasteboard.clearContents();

    // Create array of file path strings
    let path_strings: Vec<Retained<NSString>> = paths
        .iter()
        .map(|p| NSString::from_str(p))
        .collect();

    // Wrap in NSArray as NSObjects
    let paths_array = NSArray::from_retained_slice(&path_strings);

    // Serialize to property list data (unsafe due to Objective-C interop)
    let data = unsafe {
        NSPropertyListSerialization::dataWithPropertyList_format_options_error(
            &paths_array,
            objc2_foundation::NSPropertyListFormat::XMLFormat_v1_0,
            0,
        )
    }
    .map_err(|e| format!("Failed to serialize file paths: {:?}", e))?;

    // Write to pasteboard
    let pb_type = NSString::from_str("NSFilenamesPboardType");
    pasteboard.setData_forType(Some(&data), &pb_type);

    Ok(())
}

/// Internal implementation for setting clipboard files (Windows).
#[cfg(target_os = "windows")]
fn set_clipboard_files_impl(paths: &[String]) -> Result<(), String> {
    use windows::Win32::Foundation::{HANDLE, HWND};
    use windows::Win32::System::DataExchange::{
        OpenClipboard, CloseClipboard, EmptyClipboard, SetClipboardData,
    };
    use windows::Win32::UI::Shell::DROPFILES;

    if paths.is_empty() {
        return Err("No file paths provided".to_string());
    }

    unsafe {
        // Open clipboard
        if OpenClipboard(HWND(std::ptr::null_mut())).is_err() {
            return Err("Failed to open clipboard".to_string());
        }

        // Empty clipboard
        if EmptyClipboard().is_err() {
            let _ = CloseClipboard();
            return Err("Failed to empty clipboard".to_string());
        }

        // Calculate the size needed for DROPFILES structure
        // DROPFILES header + wide strings (each path + null terminator) + final double null
        let header_size = std::mem::size_of::<DROPFILES>();
        let mut strings_size = 0usize;

        // Convert paths to wide strings
        let wide_paths: Vec<Vec<u16>> = paths
            .iter()
            .map(|p| p.encode_utf16().chain(std::iter::once(0)).collect())
            .collect();

        for wp in &wide_paths {
            strings_size += wp.len() * 2;
        }
        // Add final null terminator
        strings_size += 2;

        let total_size = header_size + strings_size;

        // Allocate memory for DROPFILES
        let h_mem = windows::Win32::Foundation::GlobalAlloc(
            windows::Win32::Foundation::GMEM_MOVEABLE,
            total_size,
        ).map_err(|e| format!("Failed to allocate memory: {}", e))?;

        let ptr = windows::Win32::Foundation::GlobalLock(h_mem)
            .map_err(|e| format!("Failed to lock memory: {}", e))?;

        // Build DROPFILES structure
        let drop_files = DROPFILES {
            pFiles: header_size as u32,
            pt: windows::Win32::Foundation::POINT { x: 0, y: 0 },
            fNC: windows::Win32::Foundation::BOOL(0),
            fWide: windows::Win32::Foundation::BOOL(1),
        };

        // Copy header
        std::ptr::copy_nonoverlapping(
            &drop_files as *const _ as *const u8,
            ptr,
            header_size,
        );

        // Copy paths
        let mut offset = header_size;
        for wp in &wide_paths {
            let bytes: Vec<u8> = wp.iter().flat_map(|c| [*c as u8, (*c >> 8) as u8]).collect();
            std::ptr::copy_nonoverlapping(
                bytes.as_ptr(),
                ptr.add(offset),
                bytes.len(),
            );
            offset += bytes.len();
        }

        // Add final null terminator
        std::ptr::write(ptr.add(offset) as *mut u16, 0);

        let _ = windows::Win32::Foundation::GlobalUnlock(h_mem);

        // CF_HDROP standard format, ID = 15
        let cf_hdrop = 15u32;

        // Set clipboard data (convert HGLOBAL to HANDLE for SetClipboardData)
        if SetClipboardData(cf_hdrop, HANDLE(h_mem.0)).is_err() {
            let _ = CloseClipboard();
            return Err("Failed to set clipboard data".to_string());
        }

        let _ = CloseClipboard();
    }

    Ok(())
}

/// Internal implementation for setting clipboard files (Linux stub).
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn set_clipboard_files_impl(_paths: &[String]) -> Result<(), String> {
    Err("File clipboard operations are only supported on macOS and Windows".to_string())
}

/// Get file paths from Windows clipboard using CF_HDROP format.
#[cfg(target_os = "windows")]
fn get_clipboard_files_windows() -> Option<FileData> {
    use windows::Win32::Foundation::{HGLOBAL, HWND};
    use windows::Win32::System::DataExchange::{
        OpenClipboard, CloseClipboard, GetClipboardData,
    };
    use windows::Win32::UI::Shell::DROPFILES;

    unsafe {
        // Open clipboard
        if OpenClipboard(HWND(std::ptr::null_mut())).is_err() {
            return None;
        }

        // CF_HDROP = 15
        let cf_hdrop = 15u32;

        // Get clipboard data
        let handle = match GetClipboardData(cf_hdrop) {
            Ok(h) => h,
            Err(_) => {
                let _ = CloseClipboard();
                return None;
            }
        };

        if handle.0.is_null() {
            let _ = CloseClipboard();
            return None;
        }

        // Lock the memory (convert HANDLE to HGLOBAL for GlobalLock)
        let h_global = HGLOBAL(handle.0);
        let ptr = windows::Win32::Foundation::GlobalLock(h_global);
        if ptr.is_err() {
            let _ = CloseClipboard();
            return None;
        }
        let ptr = ptr.unwrap();

        if ptr.is_null() {
            let _ = CloseClipboard();
            return None;
        }

        // Read DROPFILES structure
        let drop_files = &*(ptr as *const DROPFILES);

        // Check if it's wide strings
        let is_wide = drop_files.fWide.as_bool();

        // Get offset to file list
        let offset = drop_files.pFiles as usize;
        let file_list_ptr = ptr.add(offset);

        let mut paths = Vec::new();

        if is_wide {
            // Wide strings (UTF-16)
            let mut current = file_list_ptr as *const u16;
            loop {
                // Read string length
                let mut len = 0usize;
                while *current.add(len) != 0 {
                    len += 1;
                }

                if len == 0 {
                    break; // Empty string means end of list
                }

                // Read the string
                let slice = std::slice::from_raw_parts(current, len);
                if let Ok(path) = String::from_utf16(slice) {
                    if !path.is_empty() {
                        paths.push(path);
                    }
                }

                // Move to next string (skip null terminator)
                current = current.add(len + 1);
            }
        } else {
            // ANSI strings
            let mut current = file_list_ptr as *const i8;
            loop {
                let mut len = 0usize;
                while *current.add(len) != 0 {
                    len += 1;
                }

                if len == 0 {
                    break;
                }

                let slice = std::slice::from_raw_parts(current, len);
                if let Ok(path) = std::ffi::CStr::from_bytes_with_nul(
                    &slice.iter().map(|&c| c as u8).chain(std::iter::once(0)).collect::<Vec<_>>()
                ) {
                    if let Ok(path_str) = path.to_str() {
                        if !path_str.is_empty() {
                            paths.push(path_str.to_string());
                        }
                    }
                }

                current = current.add(len + 1);
            }
        }

        let _ = windows::Win32::Foundation::GlobalUnlock(h_global);
        let _ = CloseClipboard();

        if paths.is_empty() {
            None
        } else {
            Some(FileData { paths })
        }
    }
}
