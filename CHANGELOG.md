# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Coding-agent workspaces, pane chat and terminal views with on-demand scrollback history, blocked permission answers, workspace mute controls, and local attention notifications for desktops running Herdr.

### Fixed

- Keep the Agents navigation visible from first render and explain connecting, unsupported, unreachable, and desktop-offline states with recovery guidance.
- Preserve the selected Agents workspace across live Herdr updates and keep its switcher chip in view.
- Add an optional foreground service to keep paired desktop connections and local alerts active in the background.

## [0.1.2] - 2026-10-29

### Added

- Chat and Markdown files render KaTeX math and Mermaid diagrams (loaded on demand, with a Source toggle in the code block header and a fallback to the source when rendering fails).
- File previews for audio, video, SVG, PDF (zoom, fit width, page indicator), CSV, Excel worksheets, and Word documents. Tables show at most 2,000 rows and 100 columns; files over the per-type limit can still be opened, shared, or saved.

### Changed

- Buttons use shared quiet icon, text, and chip styles instead of the WebView default look; the image gallery closes with a plain X at the top end.

## [0.1.1] - 2026-10-29

### Added

- README screenshots of the unfolded two-pane layout on foldables.

### Fixed

- QR scanner shows a square viewfinder instead of the stretched default video placeholder while the camera starts.
- Shared images now show their preview on the share screen.
- Sharing into a thread that is still replying adds the message to the queue instead of holding it invisibly until the reply ends.

### Changed

- Message action sheet items have icons; the text-selection view closes with an icon button instead of a Done label.

## [0.1.0] - 2026-10-29

### Added

- Initial unofficial Android client for Alma Desktop.
- End-to-end encrypted pairing through Alma's official relay, with QR/paste setup and multiple desktop connections.
- Threads, projects, and GTD views with streaming replies.
- Tool calls, approval requests, and user questions.
- Composer controls for model, reasoning effort, goals, and loops.
- Thread file panel with diffs, HTML and Markdown previews, code copy, Share-to-Alma, and image gallery support.
- Desktop Base46 theme palettes.
- English and Simplified Chinese localization with system-language detection and a user override.
- Foldable layouts, a frosted screen transition, optional Shizuku live hinge-angle input, and an estimated fallback.
- Foreground-lifetime local notifications for completed replies and pending approvals; no push service is used.

[Unreleased]: https://github.com/lazyeo/alma-android/compare/v0.1.2...HEAD
[0.1.0]: https://github.com/lazyeo/alma-android/releases/tag/v0.1.0
[0.1.1]: https://github.com/lazyeo/alma-android/compare/v0.1.0...v0.1.1
[0.1.2]: https://github.com/lazyeo/alma-android/compare/v0.1.1...v0.1.2
