# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Composer attachments now stay local, survive draft restoration, and upload only when the message is sent or queued.
- Image edit requests can be marked up directly from the gallery with numbered regions, labels, and an overall note, then reviewed as structured cards in the thread.

## [0.1.4] - 2026-10-30

### Added

- After pairing through the relay, the client now prefers the desktop's authenticated local-network connection when available, falls back to the relay automatically, and shows a LAN icon plus the actual transport in the background notification.
- Paired desktops show a macOS, Windows or Linux icon in Settings, remembered while the desktop is offline. The screen entry is disabled up front for desktops whose Alma cannot share its screen. The client now reads `GET /api/computer-use/status`; every other Computer Use route stays blocked.

### Fixed

- Mac screen has a dedicated trackpad area in trackpad mode; slides no longer click, two-finger tap right-clicks and two-finger slide scrolls. The fullscreen and clipboard-to-Mac buttons are removed until they work reliably on devices.
- Mac screen status text and the stats panel are readable on every theme.
- The desktop switcher shows a globe icon when connected through the relay.
- Mac screen control no longer draws a duplicate cursor, responds to taps sooner, and supports long-press or double-tap selection drags with ordered pointer events.
- Unfolded navigation now highlights exactly one rail item on GTD and Library routes.
- Mac screen now says why a desktop cannot share its screen (Alma for Windows/Linux has no screen sharing yet, or the Computer Use helper is missing on the Mac) instead of waiting forever or showing "No picture from the Mac". Settings shows the last reason under the desktop's screen entry.
- The Herdr page keeps its remote screen button while Herdr is not running; it only needs the desktop to be online.

## [0.1.3] - 2026-10-30

### Added

- Herdr coding agents for desktops running Herdr: a Herdr tab with board and list views of workspaces and sessions, a per-session Chat view rendered with the shared thread message components, and a Terminal view with Fit/Grid layouts, on-demand scrollback, a hideable virtual key row, and Enter-to-terminal input. Permission menus can be answered from the chat or the session list; workspaces can be muted; local "Agent needs you" alerts.
- Mac screen: view a paired desktop's screen, take control with direct touch or trackpad mode, type and paste text, switch desktops from the header, and wake a sleeping display.
- In-app update checks with release notes, a 24-hour automatic-check option, verified APK download progress, version skipping, and Android installer handoff.
- An optional foreground service to keep paired desktop connections and local alerts active in the background.

### Changed

- On phones the bottom bar holds Threads, Herdr, and Settings. GTD opens from an icon in the Threads header, and GTD, Crystals, Time clues, and References open as child pages of Threads with a Back arrow and no bottom bar. Unfolded layouts keep them in the rail.
- Back follows the screen hierarchy instead of replaying tab and view switches.
- Thread message rendering moved into shared components so threads and Herdr chat look the same.

### Fixed

- Keep the Herdr navigation visible from first render and explain connecting, unsupported, unreachable, and desktop-offline states with recovery guidance.
- Preserve the selected Herdr workspace across live updates and keep its switcher chip in view.
- Remote screen no longer shows a blank or stretched placeholder when the Mac display is asleep.

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

[Unreleased]: https://github.com/lazyeo/alma-android/compare/v0.1.4...HEAD
[0.1.0]: https://github.com/lazyeo/alma-android/releases/tag/v0.1.0
[0.1.1]: https://github.com/lazyeo/alma-android/compare/v0.1.0...v0.1.1
[0.1.2]: https://github.com/lazyeo/alma-android/compare/v0.1.1...v0.1.2
[0.1.3]: https://github.com/lazyeo/alma-android/compare/v0.1.2...v0.1.3
[0.1.4]: https://github.com/lazyeo/alma-android/compare/v0.1.3...v0.1.4
