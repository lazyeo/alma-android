# LAN Direct Implementation Plan

> **For Claude:** Implement this plan task by task with test-driven development and commit after each numbered task.

**Goal:** Prefer an authenticated, end-to-end encrypted LAN connection between the Android app and Alma Desktop, while retaining the relay as an automatic fallback.

**Architecture:** Keep the relay session alive as the control and fallback path. After its E2E handshake succeeds, read LAN candidates through the encrypted tunnel, race short-lived direct E2E sessions, and route new tunnel operations through the first authenticated direct session. A native Capacitor socket supplies raw RFC 6455 transport because the WebView cannot open cleartext LAN WebSockets without weakening mixed-content and Android network-security policy.

**Tech Stack:** TypeScript, Vitest, Capacitor Android Java plugin, `java.net.Socket`, RFC 6455, existing ECDH/HKDF/AES-GCM E2E protocol.

---

## Verified desktop protocol (Alma Desktop 0.4.246)

The desktop facts below were verified read-only from `/Applications/Alma.app/Contents/Resources/app.asar`, file `/out/main/index.js`.

- The direct listener binds `0.0.0.0`. It first requests TCP port `23019`; if that port is occupied, it listens on an ephemeral port.
- It accepts WebSocket upgrades only at `/__alma_e2e__`. The URL is therefore `ws://<host>:<port>/__alma_e2e__`.
- The listener limits concurrent clients, uses normal WebSocket ping/pong liveness, and passes text and binary messages into the same E2E responder used by the relay path.
- Direct connection reuses the existing pairing `connectCode`; it does not require a second pairing or persisted direct-session key.
- Each connection performs a fresh ephemeral handshake:
  1. Phone sends text `{ "t": "hi", "epk": <base64url>, "n": <base64url> }`.
  2. Desktop derives keys from ephemeral ECDH, the pairing code, both public keys, and both nonces. It replies with text `{ "t": "hi", "epk", "n", "cr" }`.
  3. Phone derives the same keys, verifies responder confirmation `cr`, and sends `{ "t": "ok", "ci" }`.
  4. Desktop verifies initiator confirmation `ci`. Only then is the session ready for encrypted binary tunnel frames.
- Application traffic is AES-GCM protected by the existing `c2s` and `s2c` session keys and counters. No HTTP request or tunneled WebSocket frame may be sent before the E2E session reports ready.
- Contrary to the initial working assumption, Desktop 0.4.246 does not put LAN candidates in a handshake message. Once the relay E2E tunnel is authenticated, encrypted `GET /__alma_lan__` returns either `null` or `{ "port": number, "hosts": string[] }`.
- Candidate hosts are ordered as `<hostname>.local`, then private IPv4 addresses. Interface `en0` is sorted before other interfaces; duplicates are removed. The private-address filter accepts `10/8`, `172.16/12`, and `192.168/16`.

## Android transport decision

The app runs under Capacitor's HTTPS origin. `allowMixedContent` is false, and `network_security_config.xml` has `cleartextTrafficPermitted="false"`. A WebView `ws://192.168.x.x` connection is therefore not a viable transport.

Android Network Security Configuration can allow named or literal domains, but it cannot express RFC 1918 ranges. A `.local` domain exception would not cover private IPv4 candidates. OkHttp also consults Android's `NetworkSecurityPolicy` before a cleartext route, so merely creating a dedicated OkHttp client cannot bypass a denied base policy. Setting global cleartext permission and relying only on plugin validation would unnecessarily weaken policy for the rest of the application and WebView.

The implementation will therefore keep the existing NSC denial and add a small native Capacitor WebSocket plugin backed by `java.net.Socket`. The plugin will implement only the RFC 6455 client features required here and enforce all of these constraints before DNS or socket creation:

- scheme is exactly `ws`;
- path is exactly `/__alma_e2e__`;
- no user info, query, or fragment;
- port is in the valid non-privileged range;
- host is either a single-label `.local` name or a literal private IPv4 address;
- redirects and proxies are not supported;
- client frames are masked; server frames, fragmentation, ping/pong, close, and size limits are handled defensively.

This raw transport is acceptable because it carries no application plaintext. The only initial cleartext bytes are the standard WebSocket upgrade and ephemeral E2E handshake values. The pairing code is never transmitted. Tunnel requests and WebSockets are not routed to direct transport until responder confirmation succeeds.

## Task 1: Transport-neutral E2E session

- Define a WebSocket-like transport interface independent of the browser implementation.
- Preserve the current relay URL construction and diagnostics.
- Allow a direct URL, short handshake timeout, and native socket factory to use the same `E2ESession` handshake and encrypted-frame code.
- Add tests that prove no application frame is sent before authentication and that direct sessions reuse the pairing code with fresh ephemeral keys.

Commit: `refactor: make e2e sessions transport neutral`

## Task 2: Native LAN WebSocket

- Add a Capacitor plugin and TypeScript adapter exposing open, text/binary message, close, and error events.
- Validate LAN URLs before opening the raw socket.
- Implement the bounded RFC 6455 client and unit-test URL policy plus frame codec behavior on the JVM where practical.
- Register the plugin without changing network security configuration.

Commit: `feat: add restricted native lan websocket`

## Task 3: Candidate discovery and direct routing

- Fetch `/__alma_lan__` only through a ready encrypted relay tunnel.
- Normalize and order candidates deterministically, preserving desktop preference while removing invalid and duplicate entries.
- Probe candidates in parallel with an approximately 1.5 second timeout; select the first session that completes the full E2E handshake and close losers.
- Keep relay connected. Route new HTTP requests and tunneled WebSockets through direct while it is healthy.
- If direct fails, reject or close only operations tied to the failed direct session, atomically return active transport to relay, and make subsequent operations use relay.
- Re-probe on network-change signals when available, otherwise on `online` and `visibilitychange`, plus a several-minute timer while relay is active.

Commit: `feat: prefer authenticated lan transport`

## Task 4: Actual transport status

- Expose active transport as `direct` or `relay` from the managed tunnel.
- Replace private-relay-URL guessing in desktop status and the Android background notification.
- Add English and Simplified Chinese strings. Reuse design tokens and existing primitives; the desktop switcher may use a small LAN icon without redundant visible explanation.
- Add 412 px English and Chinese screenshot scenarios showing the status adjacent to existing UI.
- Update `CHANGELOG.md` and protocol documentation.

Commit: `feat: show active desktop transport`

## Task 5: Verification

- Run focused tests throughout red-green-refactor cycles.
- Run the full unpiped `npm run check`, capture its exact counts and return code, and retry once after `cd android && ./gradlew --stop` only if load-related timeouts occur.
- Run `npm run android:build`.
- Run the requested screenshot command with a regex matching only the new 412 px English and Chinese scenarios, then inspect both images against `docs/design-language.md`.
- Confirm public-tree and design-token guards, clean generated scratch files, remove local planning scratch files, and report commits, protocol findings, open risks, verification counts, return codes, and `git status`.

## Known open platform risks

- Android 16 local-network protections may require a runtime permission or compatibility handling depending on the final platform behavior and target SDK. The transport should surface permission-denied failures as ordinary probe failures so relay remains usable.
- Android DNS resolution for `.local` varies by device and network. Private IPv4 candidates provide a fallback, but networks with client isolation or blocked peer traffic will continue using relay.
- A desktop that changes LAN address while the relay remains up depends on network-change or periodic re-probing to discover the new candidate set.
