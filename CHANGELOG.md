# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- New launcher icon: the glasses character with sage-green lenses, so this unofficial client is easy to tell apart from the official Alma app (2026-11-04).

### Fixed

- Herdr chats resync after silent, closed, or stale relay sockets so new transcript items keep arriving without leaving and reopening the pane (2026-11-04).
- Reopening a thread reuses already-rendered Markdown (bounded cache), and the first frame of a thread renders only the bottom rows (2026-11-03).
- Opening a thread no longer re-parses every visible message on each re-render and starts at the bottom instead of rendering the top rows first; on a Redmi the main-thread work while opening dropped from 147–273 ms to about 90 ms (2026-11-03).
- Thread list: generating spinners now share one animation clock, so several running threads no longer multiply idle redraws (2026-11-03).

## [0.1.6] - 2026-11-02

### Changed

- Herdr built-in slash commands match the desktop 0.4.363 command tables, including picker hints and interactive command metadata.
- Relay sessions negotiate binary inner frames to avoid base64 overhead for HTTP bodies and socket payloads, while older desktops keep the previous format.

### Added

- Herdr chat detects open terminal pickers before sending and offers to open or safely close the menu without losing the draft.
- Interactive Herdr slash commands switch from chat to the terminal after sending so their picker is immediately available.
- Herdr slash-command suggestions merge built-in Claude Code and Codex commands with desktop-provided commands, including on older desktops.
- Herdr session rows, blocked prompts, and agent notifications show the desktop-generated title for the latest task when available.
- The Herdr agent composer suggests the active agent's slash commands, skills, and prompts when a message starts with `/`.
- Each online desktop row in Settings shows its LAN or relay transport and live median round-trip latency.
- Herdr chat shows dispatched subagents, their running count, and a live transcript sheet with assistant text and compact tool steps.
- Herdr chat shows messages from teammate sessions as distinct compact cards with localized labels and collapsible Markdown details.
- External links in rendered Markdown show the desktop-resolved site favicon when available.
- Project groups use one compact project header for the card summary, new-thread action, AI drafting, and temporary card consultation.
- Project cards can be drafted from an optional hint or from the consultation transcript, then reviewed through the existing proposal diff and accept or reject controls.
- Card consultation provides a non-thread chat stored in the project folder, with Markdown replies, transcript clearing, and draft-from-consultation.

### Fixed

- Herdr workspace headers make the title actionable and keep direct new-tab and management controls visible.
- Herdr terminal composers keep Backspace and arrow keys for text editing when the draft is non-empty, and surface Backspace earlier in the terminal key row.
- Video file previews show their first frame instead of the WebView's default play poster.
- Annotation notes identify their image when a composer contains multiple image attachments.
- Herdr pane and subagent polling pauses while the app is hidden, avoiding unnecessary relay traffic in the background.
- The desktop switcher shows only the Wi-Fi or globe icon for the connection path, without a duplicate "LAN"/"Relay" label.
- Wide tables in messages no longer jump back to the start after you scroll them sideways. The table renderer had a new identity on every render, so any re-render (such as a latency update) rebuilt the scroller.
- Sheet footer primary buttons for project card drafting and editing now fill the footer and use the standard 48px action height.
- Solid accent buttons use perceptual seed lightness for readable black or white text, keeping blue and similarly dark accents white-on-color.
- Project card brief and focus only offer "Show more" when the clamped text actually overflows.
## [0.1.5] - 2026-11-01

### Changed

- Codex panes show the Codex cloud mark.
- Claude panes show the Claude Code mark.
- Fold transition settings only appear on devices that report a hinge or multiple device states.
- Herdr mark is now the official vector logo (Apache-2.0) instead of a traced bitmap.

### Added

- Herdr navigation now uses the official ram-head mark, and Herdr session rows and headers show Claude, pi, or neutral fallback agent marks.
- Herdr workspaces and agent tabs can now be created, renamed, and closed from mobile-friendly action sheets, with Claude, Codex, or Pi startup for new sessions.
- Herdr shows a live working bar for active Claude sessions, including the current status and a Stop action.
- Agent notifications now include the agent's question when blocked, or its latest message when waiting for input.
- Herdr chats now support up to six pending image or file attachments, upload them to the desktop when sending, and render inbound Herdr images in the shared gallery.
- Composer attachments now stay local, survive draft restoration, support numbered markup with editable region descriptions on pending images, append labeled regions to the composer for review, and upload only when the message is sent or queued.
- Image edit requests can be marked up directly from the gallery with numbered regions, labels, and an overall note; the annotated image and request text now land in the composer for review before sending, and unlabeled regions no longer produce empty rows.

### Fixed

- README screenshot tables use same-scale images.
- Herdr composer: the attach button matches the send button (40px, no border) instead of the taller bordered box from the thread composer.
- Image annotator: a bare tap no longer adds an empty numbered region.
- Image annotator: the region label row is vertically centred with equal 12px padding above and below, and the toolbar sits 12px under the divider.
- Image encoding (photo downscale and annotation export) uses the synchronous canvas data URL first; on Android WebView the async `toBlob` path took 6–13 s per image.
- Annotation labels typed on a brand-new chat now reach the composer; a gallery markup with no labels and no note no longer inserts an empty request block.
- Image annotator: the selected tool and colour are marked with a fill and a solid ring instead of hairline outlines, which Android rendered partially; number badges stay inside the image on every edge.

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

[Unreleased]: https://github.com/lazyeo/alma-android/compare/v0.1.6...HEAD
[0.1.0]: https://github.com/lazyeo/alma-android/releases/tag/v0.1.0
[0.1.1]: https://github.com/lazyeo/alma-android/compare/v0.1.0...v0.1.1
[0.1.2]: https://github.com/lazyeo/alma-android/compare/v0.1.1...v0.1.2
[0.1.3]: https://github.com/lazyeo/alma-android/compare/v0.1.2...v0.1.3
[0.1.4]: https://github.com/lazyeo/alma-android/compare/v0.1.3...v0.1.4
[0.1.5]: https://github.com/lazyeo/alma-android/compare/v0.1.4...v0.1.5
[0.1.6]: https://github.com/lazyeo/alma-android/compare/v0.1.5...v0.1.6
