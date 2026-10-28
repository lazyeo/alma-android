# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Nothing yet.

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

[Unreleased]: https://github.com/lazyeo/alma-android/compare/v0.1.1...HEAD
[0.1.0]: https://github.com/lazyeo/alma-android/releases/tag/v0.1.0
[0.1.1]: https://github.com/lazyeo/alma-android/compare/v0.1.0...v0.1.1
