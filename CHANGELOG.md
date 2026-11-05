# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Remote screen zoom and pan: pinch zooms the stream 1–4x around your fingers and snaps back to fit just above 1x. A zoom chip shows the percentage and switches between Fit and 1:1, a hand button lets one finger pan the zoomed view without touching the Mac, and a quick double two-finger tap resets the zoom. The cursor, and every tap, drag and scroll made with it, lands where you see it at any zoom (2026-11-05).
- Remote screen picker: on desktops that report more than one display or can stream single windows (macOS), a button in the header opens a sheet to show a display, the whole screen, or one app window, with app icons and the current choice ticked. A chosen window is streamed on its own as JPEG frames instead of the whole-display video; video resumes for the whole screen or once the window closes. If the streamed window closes, a short notice says so and the picker shows the whole screen as the current choice. After a switch the new picture shows as soon as its first frame arrives; until then the last one stays, dimmed, with a small spinner, and taps and scrolls wait so they cannot land on the new window in the wrong place (2026-11-05).
- Alma's thought bubble: while she works, a small comic bubble now and then pops up over her face in the tab bar, the rail and the docked face on /alma, holding one emoji for what she is doing or how she feels: 💭 thinking, 🔍 searching, 📖 reading, ⌨️ writing code, ⚙️ running a command, ✋ waiting for your OK, 😵‍💫 a failed reply, ✅ just finished (once), 😪 tired, and sometimes 😊 when she is in a good mood. It shows when her step changes or every 10–15 seconds while she is busy, never while she is idle or while her face flies into Alma, and half as often with reduced motion (2026-11-05).
- Alma's mascot uses the official Alma artwork, wearing this app's own vector glasses. The art is © yetone / Alma: it is not in this repository or under its MIT licence, but downloaded from the official Alma Android release at build time (pinned by SHA-256) and bundled into the APK, and Settings › About credits it. Builds with `ALMA_MASCOT=skip` keep the vector face. See NOTICE.md (2026-11-05).
- Message actions: long-pressing your own message now offers Retry reply, which asks for a new version of the reply that follows it (the old one stays reachable with the version switcher), or, when the reply never came, asks the desktop for one from the end of the thread. A message that failed to send offers Resend message. Assistant replies keep Retry reply, and nothing is discarded, so none of these asks to confirm (2026-11-05).

### Changed

- Phone navigation is now a floating pill with just three icons: Threads, Alma's face in the middle, and Herdr. GTD and Settings moved to icon buttons in the Threads header (the Settings gear carries the update dot) and open as pages with Back, which returns to Threads; on tablets and unfolded phones the rail keeps all of them, with Alma's face (40px) in the rail's top corner where the app logo was, Threads and Herdr below her, and GTD and Settings at its foot; desktops without a personal agent show the logo there instead. Alma's face in the pill is a little bigger (60px). The pill floats 12px above the gesture bar and steps aside while the keyboard is up and on the new-thread page; lists, snackbars and the Herdr error banner keep clear of it. The desktop switcher left the bottom of the screen: on phones the Threads and Herdr titles are now the current desktop's name with its status dot and a chevron, and tapping it opens the same switcher (2026-11-05).
- Remote screen control is a trackpad, with no Direct mode or mode toggle: your finger moves a cursor drawn over the stream, with pointer acceleration, while the Mac hides its own pointer. The touch area is marked out as a rounded inset pad, so its edges are clear where the picture is letterboxed (an unfolded Fold), with a short hint at its foot that fades after the first touch. Tap to click, hold then move to drag, two fingers to scroll or right-click. The view follows the cursor near the edges when zoomed. A Direct choice saved by an earlier version is ignored (2026-11-05).
- Opening Alma eases in quickly and lands with a noticeable bounce (3% overshoot) in 460 ms, instead of a slight spring in 380 ms. Her face's flight to the header settles much more gently: at most 1% of the way or 4px past it, instead of 25px on a folded phone, and the first open after launch now lands exactly on the header instead of jumping 14px. Her main conversation now lives only behind the Alma tab: it is left out of the Threads list and its filters, project groups and the project card's Recent list, GTD, and thread search, with counts to match, and stays hidden from the first paint using the id this phone last saw. Links and notifications that open it as a thread go to Alma instead. Nothing changes on the desktop (2026-11-05).
- On tablets and unfolded phones Alma opens across everything right of the rail: the circle grows from her face in the rail's top slot and stops at the rail, which stays put, and her page takes the whole width with the thread list folded away until you leave her. Her face no longer shows twice there: it grows a little as it flies out of the rail slot and docks as one larger face across the rail edge beside her name, then shrinks back into the slot when you leave (2026-11-05).
- Long-pressing a message shows it as a reduced preview card above its actions, instead of lifting it at full size, where a long message ran off the screen and under the sheet. The card spans the chat column between the status bar and the sheet, grows out of the message and settles back into it; a long message is cut off with a soft fade at the foot, and a message whose top has scrolled away gets its card right above the actions. If a very tall sheet leaves no room, no preview is shown. A reply that thought and ran tools before answering shows only its final summary, from the summary's top, under a small line counting the steps it leaves out; that card pops in right above the actions (2026-11-05).

### Fixed

- On tablets and unfolded phones the thread list can be swiped closed from the page beside it, the same place it swipes open. On GTD, whose list rows keep their own status swipes, the list could be swiped open but not closed (2026-11-05).
- Remote screen keeps Control when you switch windows or displays, when the connection drops, and when you leave the app and come back; it reconnects by itself (at once on return, otherwise after 1 to 8 seconds). It turns off only when you choose View only, open another desktop, or the desktop stops accepting input, and then a short notice says why (2026-11-05).
- Switching desktops no longer reshuffles the tab bar: Alma's centre slot is remembered per desktop and held while the next desktop loads, and fades out only once that desktop is confirmed to have no personal agent (2026-11-05).

## [0.1.7] - 2026-11-05

### Added

- Alma tab: on Alma desktop 0.4.407+, a raised Alma avatar in the center of the tab bar (and in the side rail) opens the personal agent at `/alma`. The vector face follows her vitals (energy and valence on 0–10, fatigue on 0–100, mood, and awake/tired/asleep level), and dots show when she is working or needs your OK. If the desktop has no main conversation yet, the first tap sets one up with no extra steps: it reuses the desktop's main thread or the one this phone used before, or creates an "Alma" thread with your default model, and makes it the desktop's main conversation, with Try again if that fails. It stays hidden on older desktops (2026-11-04, setup 2026-11-05).
- Alma persona screen: a messenger-style view of the main conversation, with a header showing her face and a status line (thinking, working on N things, N things need your OK, or mood). Each reply has a collapsible thinking section and a "did: …" summary of what she did (2026-11-04).
- Alma mascot: when an extension registers a mascot rig, her face is drawn from it with eased expressions, blinks, glances, breathing and a talking mouth while a reply streams. Without a rig, or if it fails to load, the vector face is shown (2026-11-05).
- Opening Alma expands her screen as a circle from the avatar while the page behind shrinks slightly and dims, then her conversation fades in and the avatar moves into her header; it lands with a slight spring in 380 ms, and Back collapses it into the avatar in 340 ms, easing in so it does not snap away. It starts moving on the first frame: only transforms and opacity animate, on the compositor, and the screens swap only while the circle covers everything, so the work of drawing the new screen is never seen. Nothing else redraws during the motion (her face pauses, her latest messages show as plain text first and rise in once it lands), and her thread is loaded ahead of the tap, so it stays smooth on mid-range phones. Pressing the avatar shrinks it slightly with a haptic tick, and another tick marks the landing. With reduced motion it is a crossfade (2026-11-05).
- Threads: pull-to-refresh at the top of the list reloads the threads and Alma's status (2026-11-04).
- Project card: a Recent section lists the project's five most recently updated threads (re-sorted each time the card opens), with Show all (N) jumping to the full project thread list, matching desktop 0.4.396 and the official app (2026-11-04).

### Changed

- Long-pressing a thread, project row, GTD item or message now lifts it slightly above a dimmed screen while its actions are open, then sets it back (or fades it away when the action deletes or moves it). Alma's tab entry is just her face, with no circle behind it, and about a quarter bigger on phones (it may rise a few pixels above the bar, which keeps its height). While she works a small dot pulses under her face instead of a ring around it, and the needs-your-OK dot sits on her face's top-right. Opening Alma no longer ends with a small jump: her bubbles had extra margin in the full thread, and the full thread now fades in only once it has painted (2026-11-05).
- Alma's conversation sits closer to the screen edges: her face opens a run on its own line so her bubbles use the full width, and the per-message "did: …" tool line is gone (the header status already shows what she is doing) (2026-11-05).
- Threads: the pinned Alma row at the top of the list is gone; the center Alma tab replaces it (2026-11-04).
- Tab bar: two tabs on each side of Alma: Threads and Agents, then GTD and Settings. The side rail uses the same order (2026-11-05).
- GTD is a tab on phones: its list is a root page with the tab bar and no Back button (2026-11-05).
- New launcher icon: the glasses character with sage-green lenses, so this unofficial client is easy to tell apart from the official Alma app (2026-11-04).

### Fixed

- Motion polish across the app: popups and banners no longer flash or cut off their own fade; settings, project and queue sections open and close without the edge cutting through text; pickers and confirmations slide away instead of vanishing; thread and GTD rows glide into place when a thread is added, moved or removed; the full-screen editor opens and closes more smoothly; the activity status word rolls to its next value and the working indicator keeps spinning as it fades out; the send button crossfades to the queue icon while a reply is running; tab and chip labels change colour smoothly; and opened tool groups and thinking blocks fade in (2026-11-05).
- Opening and leaving Alma, and redrawing thread lists, do less main-thread work: relay frames decode with the native base64 decoder, relative times reuse one formatter per language instead of building one per row, pressing the Alma tab no longer starts a network fetch inside the expand animation, and her mascot face is drawn from art pre-sized for each avatar size, with message avatars drawn once and reused (2026-11-05).
- Projects: threads in a project group and in the project card's Recent list now open the thread actions menu (rename, organize, delete, …) on long press, right click, or the ContextMenu / Shift+F10 key, like the main thread list. Long pressing no longer also opens the thread, and a deleted thread drops out of its project right away (2026-11-04).
- Thread chats and the thread list reconnect `/ws/threads` after the desktop closes or rejects it while the relay tunnel stays up (retrying after 1/2/5/15 s, capped at 15 s, or immediately on return to the foreground). After a reconnect they reload the open thread and the list over HTTP, so replies keep streaming in without reopening the thread (2026-11-04).
- Approval and question alerts no longer repeat when a desktop refresh briefly fails or a stale refresh races a new request, and Herdr "needs you"/finished alerts no longer repeat when an agent's status flickers away and back within the same turn (2026-11-04).
- Herdr "needs you" cards and alerts show an agent's question word-for-word from the transcript instead of the possibly wrapped or truncated terminal line, falling back to the screen when the transcript has none (2026-11-04).
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

[Unreleased]: https://github.com/lazyeo/alma-android/compare/v0.1.7...HEAD
[0.1.0]: https://github.com/lazyeo/alma-android/releases/tag/v0.1.0
[0.1.1]: https://github.com/lazyeo/alma-android/compare/v0.1.0...v0.1.1
[0.1.2]: https://github.com/lazyeo/alma-android/compare/v0.1.1...v0.1.2
[0.1.3]: https://github.com/lazyeo/alma-android/compare/v0.1.2...v0.1.3
[0.1.4]: https://github.com/lazyeo/alma-android/compare/v0.1.3...v0.1.4
[0.1.5]: https://github.com/lazyeo/alma-android/compare/v0.1.4...v0.1.5
[0.1.6]: https://github.com/lazyeo/alma-android/compare/v0.1.5...v0.1.6
[0.1.7]: https://github.com/lazyeo/alma-android/compare/v0.1.6...v0.1.7
