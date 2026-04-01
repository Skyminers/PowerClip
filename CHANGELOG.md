# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- `formatTime` utility now correctly handles invalid date strings — previously it silently returned `"Invalid Date"` instead of the original input; added `isNaN(date.getTime())` guard before processing
- `constants.test.ts` had outdated assertions for `WINDOW_MAX_WIDTH`/`WINDOW_MAX_HEIGHT` (expected 800/600, but the constants were intentionally changed to 10000 to remove the window size cap); updated test description and assertions to match design intent
- `app-scroll.test.tsx` produced 8 unhandled Promise rejection warnings from `QuickMenu`'s Tauri `listen()` calls; fixed by adding `vi.mock('@tauri-apps/api/event', …)` in that test file

### Tests Added
- `src/test/helpers.test.ts` — 30 new tests covering `formatTime`, `formatFilePaths`, `formatContent`, and `getPreview` including edge cases: future timestamps, invalid dates, legacy space-separator format, Windows paths, multi-file display
- `src/test/useDebouncedValue.test.ts` — 8 new tests covering the `useDebouncedValue` hook: initial value, debounce delay, rapid changes, zero delay, large delay boundary

> **Test suite summary:** 87 tests across 7 files, all passing (was 49 passing / 1 failing / 8 unhandled errors)

## [0.1.0] - 2025-03-23

### Added
- Initial release
- Clipboard history management for text, images, and files
- AI-powered semantic search (OpenAI-compatible embedding APIs)
- Quick Commands (Snippets) with custom aliases
- Smart Lists filtering by type and time period
- Extensions system for shell command pipelines
- Global hotkeys for window toggle and add to snippets
- System tray integration
- Auto-paste feature
- Hot-reloadable JSON configuration
- Resizable and draggable window with position persistence
- Apple HIG-inspired UI design
- Multi-language documentation (English & Chinese)

### Supported Platforms
- macOS 10.15+ (Apple Silicon)
- Windows 10+ (x64)

[Unreleased]: https://github.com/Skyminers/PowerClip/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Skyminers/PowerClip/releases/tag/v0.1.0
