# Desktop relay protocol

This document describes the Alma Desktop HTTP and WebSocket interfaces used by Alma Android. It is intended for contributors implementing or reviewing client behavior, not as a stable upstream API specification.

Markers:

- **Verified** — observed against Alma Desktop, confirmed from its shipped implementation, or covered by a working end-to-end probe.
- **Inferred** — derived from surrounding behavior or implementation details but not exercised end to end. Treat it as compatibility-sensitive.

Never commit, print, or paste a pairing link, connect code, registration key, or decrypted desktop content while testing this protocol.

## Pairing and trust model

**Verified.** Alma Desktop's remote-access QR/link has this shape:

```text
alma://connect?u=<relayUrl>&k=<connectCode>&e2e=1
```

- `u` is the relay base URL.
- `k` is a 32-byte base64url connect code and the shared secret.
- `e2e=1` requires the encrypted inner tunnel. This client rejects non-E2E pairing.

The complete link grants full desktop access. The client stores pairings locally, derives a stable desktop id from the connect code, and opens one independent tunnel per paired desktop. The relay routes encrypted frames; it does not receive the inner plaintext.

## Relay route and routing id

**Verified.** Derive the routing id with HKDF-SHA256:

```text
routingId = base64url(
  HKDF-SHA256(
    ikm = utf8(connectCode),
    salt = utf8("alma-relay-e2e/v1/routing"),
    info = empty,
    length = 16 bytes
  )
)
```

Connect to:

```text
wss://<relay-host>/c/<routingId>/__alma_e2e__
```

An unknown id normally returns HTTP 502 with a desktop-offline/invalid-code error. Browser WebSocket clients cannot add the optional `x-alma-client` header; the desktop accepts the connection without it.

## E2E handshake

**Verified** against desktop 0.4.363. The phone is the initiator. Handshake frames are JSON text; encrypted traffic is binary.

```text
phone   → { t: "hi", epk: <P-256 raw public key>, n: <16-byte nonce>, bin: 1 }
desktop → { t: "hi", epk: <public key>, n: <nonce>, cr: <responder confirmation>, bin?: 1 }
phone   → { t: "ok", ci: <initiator confirmation> }
either  → { t: "err", message: "auth-failed" | ... }
```

`bin: 1` offers binary inner frames. The session uses them only when both `hi` frames contain `bin: 1`. Older desktops ignore the phone's offer and omit `bin`, so the session falls back to the previous JSON and base64url format. The `ok` and `err` frames are unchanged.

Using label `alma-relay-e2e/v1`:

```text
shared = ECDH-P256(phonePrivateKey, desktopPublicKey)
th = SHA256(
  utf8(label) || initiatorPublicKey || responderPublicKey ||
  initiatorNonce || responderNonce
)

derive(name) = HKDF-SHA256(
  ikm = shared,
  salt = utf8(connectCode),
  info = utf8(name) || th,
  length = 32 bytes
)

phoneToDesktopKey = derive("c2s|")
desktopToPhoneKey = derive("s2c|")
responderConfirm = derive("confirm-r|")
initiatorConfirm = derive("confirm-i|")
```

Compare confirmations in constant time. Abort the tunnel on mismatch.

## Encrypted frames

**Verified** against desktop 0.4.363. Each direction has an independent unsigned 64-bit counter beginning at zero. The outer sealed layout is unchanged:

```text
iv = 4 zero bytes || uint64be(counter)
ciphertext = AES-256-GCM(key, iv, encoded-inner-frame)
wire = iv || ciphertext-and-tag
```

Counters must never repeat for a key. Receivers decode both inner formats regardless of negotiation.

The previous inner format is UTF-8 JSON. Byte field `b` is encoded as a base64url string before serialization. This remains the fallback for older desktops.

Negotiated binary inner frames keep payload bytes out of JSON:

```text
0x00 || uint32be(headerLength) || utf8(JSON.stringify(header)) || payload
```

For a byte field `b`, the header copies the frame, removes `b`, and adds `"$":"b"`; the payload is the raw bytes. For a text WebSocket `wmsg`, the header removes `s`, adds `"$":"s"`, and the payload is the UTF-8 text. Frames without either payload, including bodyless `hreq`, `hres`, `hend`, and `wopen`, remain plain UTF-8 JSON even in a binary session. A marked frame shorter than five bytes, or whose declared header extends past the plaintext, is invalid with `E2E frame header truncated`.

## Multiplexed tunnel frames

### HTTP

**Verified.** Requests and streamed responses use:

```text
client  → { t: "hreq", id, method, path, headers, b?: <body bytes> }
desktop → { t: "hres", id, status, headers }
desktop → { t: "hchunk", id, b: <chunk bytes> }  // zero or more
desktop → { t: "hend", id }
desktop → { t: "herr", id, message }
client  → { t: "hcancel", id }
```

Request bodies are carried in one frame; response bodies may be chunked. In negotiated binary sessions these are raw inner-frame payloads; the v1 fallback serializes them as base64url strings. The client keeps its 6 MiB upload cap below the relay's practical frame limit.

**Verified.** The Android client derives connection latency from each tunneled HTTP exchange: it records a monotonic timestamp when `hreq` is sent and samples the round-trip time when the matching `hres` arrives. Samples are kept separately for relay and direct sessions. Each online desktop row in Settings shows that desktop's active transport and the median of its latest eight samples; before the first sample it shows only the transport. While the app is visible and connected, a lightweight `GET /__alma_lan__` request keeps the measurement fresh every 30 seconds; no new desktop endpoint is required. The direct LAN socket is native, so the tunnel request/response boundary is the only common layer where both relay and LAN round trips can be measured.

### WebSocket

**Verified.** Logical sockets share the same encrypted relay socket:

```text
client  → { t: "wopen", id, path }
desktop → { t: "wopened", id } | { t: "werr", id, message }
either  → { t: "wmsg", id, s: <text> } | { t: "wmsg", id, b: <bytes> }
either  → { t: "wclose", id }
```

In negotiated binary sessions, both text `s` and binary `b` use the binary inner-frame payload. The v1 fallback keeps text in JSON and serializes `b` as base64url.

## HTTP APIs used by the client

All paths below are sent through `hreq`.

### Threads and workspaces

**Verified.** The client uses:

```text
GET    /api/threads
POST   /api/threads
GET    /api/threads/:id
PUT    /api/threads/:id
DELETE /api/threads/:id
GET    /api/threads/:id/messages
GET    /api/threads/:id/subagent-messages
GET    /api/threads/:id/subagents/live
GET    /api/threads/:id/context-usage?model=<provider:model>
POST   /api/threads/:id/compact
GET    /api/search/threads?q=<query>
GET    /api/workspaces
```

Thread detail includes message rows. A row contains its own database id plus a nested `message` object with `role` and typed `parts`. Tool parts carry a tool call id, state, input, and output. `parentToolCallId` attaches sub-agent rows to the spawning tool call.

`PUT /api/threads/:id` is also used for model/composer preferences, workspace moves, GTD status, favorites, and pinning. Organization-only writes include top-level `skipUpdatedAt: true` so they do not reorder recency lists.

### Project card

**Verified.** A workspace can expose a project card through:

```text
GET    /api/workspaces/:id/project-card
PUT    /api/workspaces/:id/project-card
POST   /api/workspaces/:id/project-card/resolve-proposal
POST   /api/workspaces/:id/project-card/draft
GET    /api/workspaces/:id/project-card/consult
POST   /api/workspaces/:id/project-card/consult
DELETE /api/workspaces/:id/project-card/consult
```

`GET` returns `{ card, config }`. `card` is null or contains `brief`, `focus`, `resume: [{ uri, label }]`, optional confirmation timestamps, and an optional proposal. A proposal can replace any subset of the card fields and also contains `reason`, `proposedAt`, and optional `source`.

`PUT` accepts `{ brief, focus, resume }`, confirms the card, and clears a pending proposal. The Android MVP edits brief and focus while preserving the existing resume array. Resolving a proposal accepts `{ accept: boolean }`; accepting merges only the proposal fields that are present, while rejecting drops the proposal.

`POST .../draft` accepts `{ hint?: string, fromConsult?: boolean }`. The optional hint is limited to 500 characters. The desktop runs the project's configured model, calls the proposal path internally, and returns `{ card }` with a proposal whose source is `draft`; a consultation-backed draft sets `fromConsult: true`. Drafting can take up to the desktop's 120-second timeout. Verified errors include `503` when no model is available, `502` when the model result is empty or cannot be parsed, and `404` for a missing workspace.

The consultation is stored as `<workspace>/.alma/project-card-consult.json`, is not a thread, and never appears in the thread list. `GET .../consult` returns `{ transcript, file }`. The version-1 transcript contains ordered user and assistant messages and may include a summary of earlier messages. `POST .../consult` accepts `{ question, draft?, options?, model? }`; the question is required and limited to 8,000 characters, and the response includes both the new assistant answer and the updated transcript. `DELETE .../consult` resets the transcript to an empty version-1 value. Consultation responses can take up to the desktop's 60-second timeout and return `503` when no model is available or `400` for an empty question.

A missing workspace or an older desktop can return `404`; the client falls back to the existing new-thread-only project action. A supported endpoint returning `card: null` still renders the project header with its empty state. Successful card writes and drafts broadcast a `workspace_updated` event on `/ws/threads`, and the open project card is refetched for that workspace.

**Verified.** The client uses these optional goal routes:

```text
GET    /api/threads/:id/goal
PUT    /api/threads/:id/goal
DELETE /api/threads/:id/goal
```

### Models, settings, usage, and suggestions

**Verified.** Read-only client setup and UI data comes from:

```text
GET /api/models
GET /api/settings
GET /api/usage/stats
GET /api/activity-recorder/suggestions
```

Settings fields vary by Alma Desktop version. New fields must be treated as optional, with local fallbacks.

### Approvals and questions

**Verified.** These routes are handled by the desktop relay process:

```text
GET  /api/handoff/tool-approvals
POST /api/handoff/tool-approvals
GET  /api/handoff/user-questions
POST /api/handoff/user-questions
WS   /ws/handoff/tool-approvals
WS   /ws/handoff/user-questions
```

Approval responses use actions such as `allow_once`, `allow_always`, `deny`, and `deny_with_reason`. Question responses use `accept`, `decline`, or `cancel`, with an answer entry for each question. Both sockets emit `show` and `resolved` events.

A `404`, `405`, or `501` means the connected desktop does not support the handoff feature; the client treats it as unavailable rather than failing the whole desktop connection.

### Herdr sessions and subagents

**Verified.** Herdr snapshots from `/ws/herdr` and the snapshot RPC can decorate each pane with an optional `turn_title` string: a short model-written summary of the user's latest ask in that pane. The field is absent on older desktops, when no model is configured, and before a pane has been named; clients must ignore non-string or empty values.

**Verified.** Herdr chat history and its live stream use:

```text
GET /api/herdr/chat?pane=<pane_id>&before=<seq>&limit=<count>
WS  /ws/herdr/chat?pane=<pane_id>&from=<seq>
```

Chat items include tool rows shaped as `{ id, kind: "tool", time, tool }`. A dispatched Claude subagent is a tool whose `name` is `Task`; `tool.id` is the Claude tool-use id, `tool.input.description` is its short title, and `tool.input.subagent_type` identifies its type. A Task is running until `tool.done === true`.

**Verified.** The active pane's slash commands, skills, and prompts are read through:

```text
GET /api/herdr/commands?agent=<claude|codex|pi>&pane=<pane_id>
```

The response is `{ commands: [{ name, description?, hint?, source }] }`, where `source` is `command`, `skill`, or `prompt`. The desktop returns at most 400 entries and de-duplicates them by name. Codex prompt names retain their `prompts:` prefix and Pi skill names retain `skill:`; the client inserts the returned name verbatim after `/`. The phone appends its built-in command list after the desktop results, de-duplicating names case-insensitively while preserving the desktop entry. Unknown agent values return an empty list. HTTP 404 means the connected desktop predates this route; the phone still shows its built-in commands without an error.

**Inferred from the desktop 0.4.363 renderer.** The built-in tables also mark commands that open an interactive terminal picker. This `interactive` flag is mobile-only metadata: desktop/server entries never set it, while matching built-ins retain it after the desktop-first merge so chat sends can switch to the terminal after dispatch.

Before a chat-view `agent.prompt`, the phone best-effort reads the pane tail and looks for visible cursor-list menus. Numbered blocked prompts continue through the existing permission-card path. A cursor-list blocks the prompt and offers to open the terminal or send Escape, wait for the pane to redraw, confirm the menu closed, and then submit the preserved draft. Read failures fall through to the prompt; terminal-view sends are not guarded.

**Verified.** A dispatched subagent's own transcript is read through:

```text
GET /api/herdr/subagent?pane=<pane_id>&tool=<tool.id>&limit=400
GET /api/herdr/subagent?pane=<pane_id>&tool=<tool.id>&limit=400&before=<seq>
```

A successful response is `{ agent: { type?, description?, finished }, page }`, where `page` has the same pagination and regular chat-item shape as `/api/herdr/chat`. The client can therefore render assistant text and tool calls with the shared Herdr message conversion. While `agent.finished` is false, the client polls about every 1.5 seconds and stops when the detail closes or the agent finishes. The poll pauses while the page is hidden and resumes immediately when it becomes visible.

Protocol failures are returned with HTTP 200 as `{ error: { code, message } }`. Verified codes are `pane_not_found`, `subagent_not_found`, and `read_failed`. `subagent_not_found` can be transient immediately after a Task starts because its transcript file has not appeared yet; clients should show a quiet no-transcript state and keep polling. HTTP 404 means the connected desktop predates this route and should be presented as an update-required compatibility state.

### Attachments and previews

**Verified.** Images and generic files use:

```text
POST /api/attachments/image
POST /api/attachments/file
```

Image bodies are raw bytes. Generic file uploads include `x-alma-filename`. The client caps each upload at 6 MiB and may downscale camera/gallery images before upload.

Read-only image and file previews normalize desktop-local `/api/...` URLs into tunneled paths. Foreign origins are rejected. HTML previews remain sandboxed and must not gain same-origin access to the application.

**Verified.** External links in rendered Markdown can request the desktop-resolved site icon:

```text
GET /api/system/site-icon?url=<encoded absolute http(s) URL>
```

A successful response is `{ "dataUrl": "data:image/png;base64,..." }`. Older desktops and lookup failures are treated as no icon. The mobile client caches positive and negative results by origin for the app run.

### Computer browser (in-app browser)

**Verified** against Alma Desktop 0.4.467's main bundle (static reading; not yet exercised on a device). Each thread can view and drive the desktop's in-app browser for its workspace (the artifact workspace when the thread keeps artifacts):

```text
GET /api/iab/status          -> { targets: [{ workspaceId, url, ... }] }
WS  /ws/iab/<threadId>
```

`/api/iab/status` gates the entry: a `404` hides it, and a target whose `workspaceId` matches the thread's workspace shows the "Alma is using the browser" shortcut. The client polls it only while a reply is generating, and once when it ends.

On the socket the desktop sends `status { bound, url, title, loading, error? }` at once (an open socket that stays silent marks the desktop unsupported for the session), then `page`, `tabs { tabs[], activeId }`, `viewport { width, height }`, `frame { data (base64 JPEG), width, height, seq }` (about 15 fps at most, only when the page paints), `error { message }`, and WebRTC signalling (`rtc`, `rtc_offer`, `rtc_ice`). Frame and viewport sizes are the page's CSS pixels.

The client sends `tap`/`double_tap { x, y }`, `scroll { x, y, dx, dy }` (CSS pixels, wheel deltas), `text { text }`, `key { key }` (`Enter`, `Backspace`, `Tab`, `Escape`, arrows), `navigate { url }` (the desktop turns words into a search and bare hosts into https, and opens a browser for the thread if none is bound), `tab { action: view|close|new, id?, url? }`, `back`, `forward`, `reload`. After the first frame it sends `rtc_start { relayOnly: false }`. Desktops from 0.4.491 (the native shell) send no JPEG frames at all and stream a bound page only as WebRTC video, offering STUN servers but no TURN, so the client also sends `rtc_start` 1.5 s after a bound `status` when no frame came first; if that video fails or shows nothing within 10 s, the viewer says so and offers a retry, which reopens the socket. Once the desktop's `input` data channel is open, page input goes over it instead of the socket. Every other `/api/iab/*` route (the agent's browser tools, including `eval` and raw CDP) and `/ws/iab-rtc-bridge` stay blocked.

### References, crystals, and time clues

**Verified.** The read-oriented reference browser uses:

```text
GET  /api/refs/kinds
GET  /api/refs/recent
GET  /api/refs/search
GET  /api/refs/resolve
POST /api/refs/resolve
GET  /api/refs/backlinks
POST /api/refs/backlink-counts
POST /api/refs/snippets
GET  /api/refs/recipes
POST /api/refs/recipes/state
GET  /api/refs/time-clues
GET  /api/refs/time-clues/days
POST /api/refs/time-clues/seen
POST /api/refs/time-clues/ignore
```

Reference URIs use `alma://<kind>/<id>`; message URIs use `alma://thread/<threadId>/message/<messageId>`.

**Verified.** Crystal detail supports validation and selected actions through `/api/crystal/...`. Crystal checklist shapes have changed across desktop versions. Contributors must preserve defensive parsing and keep unsupported shapes view-only instead of guessing a write payload.

## Realtime thread socket

Open `/ws/threads` through `wopen`.

**Verified.** The initial event is a `generating_snapshot`. Common server events include:

```text
thread_created, thread_updated, thread_deleted, thread_generating,
title_generating, title_generated,
message_added, message_updated, message_deleted, message_delta,
subagent_message_added, subagent_message_delta, subagent_message_completed,
generation_completed, generation_error, generation_stopped,
context_usage_update, context_compaction_started, context_compacted,
todo_update, goal_updated, loop_updated
```

### Message deltas

**Verified.** `message_delta.data` contains `messageId`, `threadId`, and ordered `deltas`. Known delta types include:

```text
part_add
part_update
text_append
text_done
tool_input_append
tool_output_set
tool_output_streaming
```

Important merge rules:

- `messageId` identifies the message row, not the nested message id.
- Sequence numbers are per message. Buffer gaps and ignore already-applied sequence numbers.
- `tool_output_streaming` is applied on arrival and does not advance the ordinary sequence.
- `partIndex: -1` with a tool call id means locate the part by tool call id.
- Database snapshots may lag the live stream; do not replace a more complete streamed copy with a shorter snapshot.
- Sub-agent events route by `data.context.threadId` and attach through `parentToolCallId`.

### Client generation messages

**Verified.** Normal generation, steering, and stopping use:

```text
{ type: "generate_response", data: { threadId, userMessage, model?, reasoningEffort?, fastMode?, source: "mobile" } }
{ type: "steer_generation", data: { threadId, userMessage, model?, reasoningEffort?, fastMode? } }
{ type: "stop_generation", data: { threadId } }
```

Retry adds `retryOfMessageId` and a null `userMessage`. Editing/resending adds `replaceMessageId`. Both target message row ids.

While generation is active, the client normally stores messages in its local per-thread queue. It flushes only after the thread is confirmed idle and its owning desktop socket is online.

## Multiple desktops and local data

**Verified.** Each pairing has its own connect code, derived desktop id, E2E session, HTTP requests, and logical sockets. Request ids, notifications, cached lists, and routes are scoped by desktop id so equal thread or request ids cannot collide.

Pairing secrets, desktop names, preferences, queues, and limited list caches are local to the Android device. Message history and settings are fetched from the desktop. Removing a desktop erases that pairing from local storage.

## Notifications

**Verified.** The client has no Web Push or proprietary push backend. While the app process and relay watcher are alive, it can create local notifications for `generation_completed`, approval, and question events. Delivery is not expected after Android kills or force-stops the process, the connection drops, or the desktop is offline.

## Client-side route restrictions

**Verified.** The API layer allowlists required operations and blocks dangerous or unrelated routes, including command execution, terminal access, computer-use control, the in-app browser's agent tools, data import/export, provider/settings writes, and batch deletion. New endpoints must be reviewed and added narrowly; never replace the allowlist with unrestricted relay access.

## Compatibility guidance

- Treat newer fields and endpoints as optional.
- Use `404`, `405`, and `501` as feature-unavailable signals where documented.
- Keep protocol parsing defensive and preserve unknown fields.
- Prefer synthetic fixtures and mocked request builders for write-path tests.
- If behavior is only **Inferred**, label it in code review and avoid destructive live probes.
