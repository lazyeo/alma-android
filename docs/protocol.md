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

**Verified.** The phone is the initiator. Handshake frames are JSON text; encrypted traffic is binary.

```text
phone   → { t: "hi", epk: <P-256 raw public key>, n: <16-byte nonce> }
desktop → { t: "hi", epk: <public key>, n: <nonce>, cr: <responder confirmation> }
phone   → { t: "ok", ci: <initiator confirmation> }
either  → { t: "err", message: "auth-failed" | ... }
```

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

**Verified.** Each direction has an independent unsigned 64-bit counter beginning at zero.

```text
iv = 4 zero bytes || uint64be(counter)
ciphertext = AES-256-GCM(key, iv, utf8(JSON.stringify(frame)))
wire = iv || ciphertext-and-tag
```

Counters must never repeat for a key.

## Multiplexed tunnel frames

### HTTP

**Verified.** Requests and streamed responses use:

```text
client  → { t: "hreq", id, method, path, headers, b?: <base64url body> }
desktop → { t: "hres", id, status, headers }
desktop → { t: "hchunk", id, b: <base64url bytes> }  // zero or more
desktop → { t: "hend", id }
desktop → { t: "herr", id, message }
client  → { t: "hcancel", id }
```

Request bodies are carried in one frame; response bodies may be chunked. The client caps uploads below the relay's practical frame limit.

### WebSocket

**Verified.** Logical sockets share the same encrypted relay socket:

```text
client  → { t: "wopen", id, path }
desktop → { t: "wopened", id } | { t: "werr", id, message }
either  → { t: "wmsg", id, s: <text> } | { t: "wmsg", id, b: <base64url bytes> }
either  → { t: "wclose", id }
```

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

### Attachments and previews

**Verified.** Images and generic files use:

```text
POST /api/attachments/image
POST /api/attachments/file
```

Image bodies are raw bytes. Generic file uploads include `x-alma-filename`. The client caps each upload at 6 MiB and may downscale camera/gallery images before upload.

Read-only image and file previews normalize desktop-local `/api/...` URLs into tunneled paths. Foreign origins are rejected. HTML previews remain sandboxed and must not gain same-origin access to the application.

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

**Verified.** The API layer allowlists required operations and blocks dangerous or unrelated routes, including command execution, terminal access, computer-use control, data import/export, provider/settings writes, and batch deletion. New endpoints must be reviewed and added narrowly; never replace the allowlist with unrestricted relay access.

## Compatibility guidance

- Treat newer fields and endpoints as optional.
- Use `404`, `405`, and `501` as feature-unavailable signals where documented.
- Keep protocol parsing defensive and preserve unknown fields.
- Prefer synthetic fixtures and mocked request builders for write-path tests.
- If behavior is only **Inferred**, label it in code review and avoid destructive live probes.
