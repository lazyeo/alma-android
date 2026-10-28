# Alma Mobile design language

This is the single source of truth for new Alma Mobile screens and sections. It records the patterns already established in `src/styles.css`, `SettingsScreen`, `BottomSheet`, `AnchoredMenu`, `Composer`, `ComposerGoal`, and `haptics.ts`.

## Gestures

- Desktop switching uses direct vertical manipulation on the title only: claim after 8px when vertical movement dominates, move the current and neighbouring names inside a clipped 40px title window, commit after 40% distance or 0.3px/ms, resist at the ends, and never wrap.
- Two-pane sidebar gestures are horizontal only: left collapses from the rail/sidebar, right expands from the rail or the left 40% of the collapsed main pane. Claim after 10px only when horizontal movement is more than 1.5 times vertical movement.
- Sidebar width, content opacity, and content translation follow the pointer; release settles with `--dur-panel var(--ease-out)`. Title switching settles with `--dur-fast var(--ease-out)`.
- Never claim gestures from overlays, editable controls, active queue interactions, hold-to-stop, horizontally scrollable content that can consume the movement, or the leftmost 24px Android back-gesture zone.
- Pointer gestures use capture only after intent is established, handle cancellation, preserve taps and scrolling until claimed, and suppress the release click after a claimed title swipe.
- Reduced motion removes direct-follow animation and applies the committed state immediately. Selection commits use `haptic('selection')` only.

## Principles

- Aim for a quiet, native-feeling mobile UI: content first, chrome only where it explains structure or state.
- Do not add “AI-ish” colour bands, decorative gradients, glows, or competing accent colours.
- Use theme CSS variables only (semantic aliases or the scale steps below). Never introduce literal UI colours.
- Use Lucide icons. Standard compact controls use a 16px glyph in a 28px visual box with at least a 40px hit target (often via padding or `::before`).
- Resting controls are normally transparent. Touch feedback is a pressed-state fill (`var(--muted)` or `--gray-3`), not a persistent hover/tap highlight. `-webkit-tap-highlight-color` stays transparent.
- Prefer labels and state over decoration. Errors are short, local, and actionable.
- Haptics go through `haptic()` in `src/haptics.ts`; never call Capacitor Haptics directly. Use `light` for primary/action taps, `selection` for tabs, toggles, Settings selections, and sheet snaps, and `medium` for a completed long-press. Web/PWA remains a no-op.

## Settings anatomy

- Reuse, never copy: settings rows come only from `src/components/SettingsRow.tsx`, sheets from `BottomSheet`, menus from `AnchoredMenu`. A local re-implementation of an existing primitive is a review failure, even if it looks identical today.

- A section is `.settings-section` with `.settings-section-title`, then an inset `.settings-group`.
- The standard item is `SettingsRow`: 28px tinted icon tile, label, optional one-line secondary text, and a trailing value, chevron, status, or `Switch`.
- Rows are `min-height: 52px`, `padding: 8px 12px`, `gap: 11px`; separators begin after the 28px icon and 11px gap (`left: 51px`).
- Groups use a `--radius-md` radius and `--gray-7` hairline on `--gray-2`.
- Actions are rows. Destructive actions use a normal row with `SettingsRow danger` (renders `.danger-text` + `.settings-icon-danger`; never put the global `.danger` button class on non-buttons), then confirm in a `BottomSheet`.
- Do not put raw text inputs or full-width primary buttons inline inside a Settings list. Text entry belongs in a drill-in or `BottomSheet`, with one primary footer action.
- Explanatory copy is `.settings-section-note`: 12px muted text directly under the heading or group.
- Errors use `.settings-error`: 12px destructive text directly under the affected group. Do not use alert banners.
- Status uses trailing `.settings-value` text plus a small `.status-dot`; do not use status cards or banners.
- A `Switch` is the existing `.settings-switch` (36×20, 16px thumb). Put it in the row trailing slot and fire `haptic('selection')` when it changes.

## Menus, sheets, and drill-ins

Use `AnchoredMenu` when the choice belongs to a specific on-screen anchor and is brief:

- ⋮ menus;
- desktop/project switchers;
- thread or row long-press actions.

Use `BottomSheet` when the interaction needs context, explanation, scrolling, confirmation, or form state:

- Crew, context, model, effort, Goal, and attachment pickers;
- message long-press actions;
- confirmations;
- every form or text-entry flow.

Sheets are modal, focus-trapped, Escape/back dismissible, drag-dismissible, scroll-locking, and registered with the overlay stack. Hardware Back closes the top overlay before navigating. Do not build a second modal/back-stack system.

## Theme tokens

All 74 Base46 palettes remain unchanged. `mapBase46ToCSS` derives five 12-step sRGB hex scales (`gray`, `accent`, `red`, `amber`, `green`) by interpolating OKLCH lightness, chroma, and shortest-path hue. Out-of-gamut colors lose chroma at fixed lightness/hue. The theme background anchors gray-1, the original foreground anchors gray-12 when readable, and the original blue/red/yellow/green anchor their step 9.

| Steps | Role                                               |
| ----- | -------------------------------------------------- |
| 1–2   | Page and elevated surfaces                         |
| 3–5   | Subtle, hovered, and pressed state fills           |
| 6–8   | Quiet separators, control borders, and focus rings |
| 9–10  | Solid fills                                        |
| 11–12 | Secondary/accent and primary text                  |

Contrast is checked after sRGB quantization. Gray-11 on gray-2 and colored step 11 on gray-1/2 meet WCAG 4.5:1. Gray-12 preserves the palette foreground when it meets 4.5:1 (including its existing 7:1 contrast where available); otherwise lightness is corrected. Each colored scale has a black/white `--<scale>-contrast` token with at least 4.5:1 against step 9.

Semantic mapping is identical in both modes: background/sidebar → gray-1, card/popover → gray-2, secondary/muted/input/chat-user-bg → gray-3, border → gray-7, muted-foreground → gray-11, foreground → gray-12. Primary is accent-9 with accent-contrast text; accent is accent-3 with accent-11 text. Destructive text is red-11; solid destructive controls use red-9 with red-contrast. Use accent-11/amber-11/green-11 for colored labels, not solid-fill colors. No CSS color mixes or literal colors; backdrop and shadow color recipes live in the theme mapper.

## Geometry and type

- Four sizes only: `--text-xs` 12px, `--text-sm` 14px, `--text-md` 16px, `--text-display` 24px. Row/list titles and control-level labels use `--text-sm` with `--weight-medium`; gray-12 versus gray-11 establishes title/meta hierarchy. Reserve `--text-md` for reading text, inputs (to avoid mobile zoom), and header/sheet titles. `--text-display` is page-level display type, not an in-sheet metric.
- Three weights: `--weight-regular` 400, `--weight-medium` 500, `--weight-semibold` 600. Font shorthand may only inherit; explicit sizes and weights use tokens.
- Line heights: `--leading-tight` 1.25, `--leading-normal` 1.5, and `--leading-relaxed` 1.65 for message reading text; tracking uses `--tracking-normal` 0.
- Radii: `--radius-sm` 6px, `--radius-md` 10px, `--radius-lg` 16px, `--radius-full` 999px. Nested rounded surfaces are concentric only when an inner corner sits inside an outer corner at a real intervening inset: inner radius is `max(outer radius − inset, 4px)`, written with `calc()` or a derived token. The composer uses `--radius-inner-composer = max(16px − var(--composer-pad-x), 4px) = 7px` for chips, icon buttons, attachment cards, queue rows, and the editing row. An attachment thumbnail inside its `--radius-md` card uses `max(10px − 6px, 4px) = 4px`. Anchored menus use an lg outer radius (16px) and 4px padding, so rows are 12px. Settings pressed fills are edge-to-edge: first and last rows inherit the group's 10px outer corners while middle corners are 0. Sheet rows are not nested into the sheet's rounded top corners and use `--radius-md`. Circles may use 50%; fullscreen surfaces may use 0. Editor origin radius is runtime geometry with an lg default.
- Borders: `--border-hairline` 0.5px with gray-7 for separators and control outlines. At half width, gray-6 reads fainter than the old 1px border on dense phone screens; do not step back down. Focus and active-toggle outlines retain accent-8 to communicate state without a glow.
- Only floating surfaces use `--shadow-popover` or `--shadow-sheet`. Inline controls and decorative artwork do not cast shadows. Dark themes set both shadow tokens to `none`; elevation comes from the gray-2 surface plus a gray-7 hairline edge. Light themes retain the existing shadows.
- Settings rows remain at least 52px; menu rows at least 42px. Preserve existing hit targets, safe areas, and spacing.
- Keep labels sentence case and concise.

## Motion and feedback

- `--dur-press` 100ms, `--dur-fast` 160ms, `--dur-panel` 250ms. All transition/animation durations and delays reference tokens.
- All transitions and animations use `--ease-out`: `cubic-bezier(0.2, 0.9, 0.3, 1)`, including enter, transform, and exit motion.
- Functional cadence exceptions are also named: spin 1s, thinking 1.5s, and streaming gap 640ms.
- Reduced motion uses `--dur-reduced` 0.01ms plus explicit loop suppression. Overlay completion events remain available to release focus and scroll locks.
- Removed decorative keyframes: `pulse`, `fast-on`, `recipe-status-pulse`, `activity-shimmer`, `project-push`, `tab-content-in`, `search-flash`, `latest-jump-in`. Project navigation, tab content, and search destinations update instantly; the latest-message affordance uses only a `--dur-fast` opacity transition through its existing presence lifecycle. Activity labels are static, readable text.
- The retained keyframes explain state: sheet/backdrop/menu/fullscreen/editor enter and exit (including reduced editor variants), navigation push/pop/fade, stop completion, and spin/thinking/stream-gap activity. `designTokens.test.ts` enforces the exact allowlist; adding a keyframe requires a documented functional purpose.

| Spatial relationship                                  | Motion                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| Parent list → child detail (including project thread) | Push forward; Back/POP reverses it                                  |
| Root-tab siblings or split-view thread siblings       | Fast crossfade                                                      |
| First-send composer → created thread composer         | Shared composer geometry                                            |
| Two-pane sidebar toggle                               | Sidebar fades/shifts left while the detail pane widens continuously |
| REPLACE, redirect, same-page state                    | No route motion, except the explicit shared-composer handoff        |

## Shared navigation primitives

- `TabBar` (`src/components/TabBar.tsx`) is the only measured tab-row primitive for desktop-scoped root views and GTD status segments. It owns the tablist roles, selection haptic, optional icon/count, optional trailing action, container-width measurement, and one absolutely positioned `.tab-bar-indicator` measured from the selected tab. Do not recreate tab buttons or underline math in a screen.
- The indicator is exactly 2px high and aligns to the selected tab content width within 1px in phone and split layouts. Tabs never draw a full-width rule and never wrap or use horizontal scrolling as a fallback. GTD shows icon + label + count when they fit; when its own container is narrower than that measured full row, `TabBar` switches to icon + count, keeps the label in `aria-label` and `title`, and remeasures the indicator.
- `ScopedRootHeader` (`src/layout/ScopedRootHeader.tsx`) is the page-header primitive for every desktop-scoped root. Its left edge always carries the local page title using the same display type, top coordinate, and 8px title inset as Settings. The compact `DesktopSwitcher` is the rightmost control, capped at 40% of the header and ellipsizing long names; actions sit between title and switcher.
- Crystals, References, and Time clues are phone child destinations: they show Back plus the local page title and omit the switcher on phones, but become title + trailing switcher roots in split view. Threads collects their phone entries in one `Library` anchored menu; the split rail keeps its direct entries.
- Root headers occupy the fixed `safe-top + 60px` band. The desktop switcher keeps its 40px clipped vertical-swipe window, existing anchored menu, and no duplicate "Online" label. Threads and GTD must share title, switcher, tab-row, and indicator top coordinates within 0.5px.
- A screen may add actions or a temporary search field through `ScopedRootHeader`; it may not fork the title, safe-area, desktop-switcher, or split/phone rules. True detail pages keep their dedicated pushed-detail header.

## Shell, scrolling, and safe areas

- The app shell is fixed to the viewport (`100vh` plus `100dvh`) and `html`, `body`, and `#root` do not scroll.
- Only `.page-body` or a purpose-built inner scroller scrolls. Headers, composer, tab bar, and overlays stay fixed in their shell region.
- Use `--safe-top`, `--safe-right`, `--safe-bottom`, and `--safe-left`; never read or duplicate raw inset values in component CSS.
- Paint the active theme surface behind system bars. In split view each column remains one uninterrupted theme surface.
- Edge-to-edge is the only system-bar mode. Real native insets always feed `--safe-*`; there is no user-facing full-screen toggle or contained fallback.
- The status-bar band and each column header are one continuous surface from viewport top through `safe-top + 60px`. Headers and tab rows never draw a full-width bottom rule, at rest or while scrolled; selected tabs use only their short indicator.
- Rail and sidebar are one uninterrupted `--sidebar` surface while the main pane uses `--background`. Never add vertical column separators. The theme mapper guarantees a perceptible sidebar/background lightness difference and readable sidebar text.
- The non-interactive app logo occupies a 40px rail box and centres on the same `safe-top + 60px` header row as sidebar and main titles. The sidebar toggle is the bottom rail action immediately above Settings.
- Avoid horizontal scrolling. Truncate secondary/value text before it competes with the primary label.

## Checklist for any new screen or section

- [ ] Uses only existing theme variables; no literal colours or decorative gradient bands.
- [ ] Reuses `SettingsRow`, `Switch`, `BottomSheet`, `AnchoredMenu`, composer controls, or their exact class anatomy instead of inventing near-duplicates.
- [ ] Icons are Lucide, visually 16px in compact controls, with a touch target of at least 40px.
- [ ] Rest state is quiet/transparent; pressed state supplies the fill and feedback.
- [ ] Settings content is an inset grouped list with 52px rows and `--radius-md` group radius.
- [ ] Forms and confirmations live in a sheet or drill-in, not inline in a Settings group.
- [ ] Notes, errors, and statuses use `settings-section-note`, `settings-error`, and trailing value + dot patterns.
- [ ] Menu versus sheet follows the anchor/context rule above.
- [ ] Haptics use the native helper with the correct feedback kind.
- [ ] Back/Escape closes the top overlay first; focus is contained and restored.
- [ ] Only the intended inner body scrolls; safe-area variables are respected.
- [ ] Screenshot comparison shows row height, radius, type, spacing, and pressed/rest states matching adjacent reviewed UI.

## Nested lists

- Child rows of an expanded group do not indent: their text aligns with the parent project name within 1px. The grouped gray-2 surface carries the nesting, while weight preserves hierarchy (parent 600, child 500); never add a guide rule or coloured edge.
- An expanded project is one grouped `--gray-2` surface with a `--radius-md` outer corner and a gray-7 hairline where light themes need separation. The parent, new-thread action, selected child, and pressed child stay inside that surface; inner fills use `max(calc(var(--radius-md) - 4px), 4px)` with at least 4px to the outer edge. The group surface enters and leaves with the same `--dur-panel var(--ease-out)` cadence as the height expansion.
- New-thread rows match child-row height, indent, padding, and text alignment. They use a 16px Plus icon, gray-11 regular text, and the standard pressed fill so they read as list actions rather than links.
- Thread rows use one quiet status slot with priority generating, needs response, actionable GTD state, then unread. Only To-do and In progress render row-end status glyphs (`ListTodo` and `Clock`, 12px gray-11); Inbox, Done, and Archived render none. The rule is shared by Threads and GTD lists.
- Long-pressing a to-do thread puts its `autoTodo.what` and original `autoTodo.quote` at the top of the action menu, with Go to message and Mark done. Quote navigation reuses the thread anchor highlight and chooses the matching user message nearest `autoTodo.at`; Mark done closes the menu immediately and keeps the to-do slot occupied by the existing thread spinner until the update settles. Success removes the mark; failure restores it and uses the list's quiet error pattern.
- Navigation roots are Threads, GTD, and Settings. On phones, Crystals, Time clues, and References are pushed child destinations from the Threads `Library` menu and show Back. In two-pane they remain direct rail destinations and render as roots without Back. None has a duplicate entry in Settings. `/inbox` is a legacy redirect to Threads, not a navigation root.
- Every desktop-scoped root uses the local title at left and the compact desktop switcher at the far right. Phone child destinations omit desktop context because the parent route is visible through Back; Settings never shows desktop context because it is app-scoped.
- References is a quiet read-only browser: search and available-kind chips lead a standard one-secondary-line list, backlink counts appear only when nonzero, and detail pages show the resolved card plus Referenced by rows. Mobile navigation is offered only for threads, messages, and crystals. Recent rows whose target no longer resolves fold under the list behind a quiet `N missing` toggle, named by their recent label and marked No longer exists.
- Select text renders the message as markdown and leaves selection native (Android keeps its handles and Copy/Select all bar). In the Android app Quote and Mention are added to the system selection toolbar right after Copy (only while Select text is open) and there is no bottom bar; on the web a bottom bar of quiet full-width buttons adds Copy, Quote (appends a `>` block to the draft) and Mention (creates a desktop snippet and appends its token); they stay disabled until text inside the reader is selected. The message action sheet offers Mention message for the whole row.
- Reply footers use one 28px minimum-height row: 12px gray-11 usage, Worked for, end reason, and the overflow action share one vertical centre, with the action pinned to the message content's right edge. Usage stays on one clipped line and yields its least important item before the action wraps; Total remains gray-12. The same structure applies in phone and two-pane layouts.

## Buttons

Never ship a bare `<button>` and rely on the browser look. A zero-specificity `:where(button)` reset strips the WebView bevel, but every new button still picks one of these:

| Need                                                       | Use                                                                                                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page/overlay header action (back, close, more)             | `.header-icon-button` with a lucide icon; close is `X` at the end of the header, back is `ArrowLeft` at the start. Full-screen viewers (gallery, select text) follow the same rule. |
| Toolbar icon inside content (zoom, full screen)            | `.quiet-icon-button` (40px, transparent, muted icon, `--gray-a3` press). Label it with `aria-label`.                                                                                |
| Small text action inside content (Copy, Source, Try again) | `.quiet-text-button`, or `.code-block-copy` inside a code block header. Icon 14px + short label.                                                                                    |
| Pick one of a few values in content (worksheets, filters)  | `.chip-button` with `aria-selected`/`aria-pressed`; scroll the row horizontally instead of wrapping.                                                                                |
| Switch views of the same content (Preview / Source)        | `TabBar`, as in the HTML preview. Inside a code block, put the toggle in the code block header (`CodeBlock actions`).                                                               |
| Settings action                                            | `SettingsRow` (see Settings).                                                                                                                                                       |
| The one primary action of a sheet or form                  | The sheet footer primary button.                                                                                                                                                    |

No borders, filled pills, or blurred glass on icon buttons; contrast comes from `--foreground`/`--muted-foreground`, and press feedback from the shared `:active` background.

## Copy, separators, and errors

- Report exceptions, not the normal state. When an icon, colour, or position already communicates normal status, omit the duplicate visible label and preserve the text equivalent in the accessible name.
- Never join separate facts with glyph separators such as middots, bullets, pipes, slashes, or dashes. Give independent facts separate elements in a flex container with `gap`, move supporting context to a second line, or turn related facts into a natural sentence.
- Do not repeat context already established by the route, page header, section, or control. Settings secondary text earns its place only when it shows a current value/state or explains a non-obvious consequence.
- Errors say what happened in plain words and what to do when there is an action. Primary error text never exposes raw JSON, HTTP codes, protocol strings, or stack text. A detail view may show raw detail at most as a muted secondary line beneath the human explanation.
