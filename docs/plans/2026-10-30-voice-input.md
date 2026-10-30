# Voice Input Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Dictate into the Alma chat composer and the Herdr agent composer. The recognised text fills the input field and is never sent automatically. Several recognition engines are pluggable: the Android system recogniser, a set of OpenAI-compatible transcription APIs, and Doubao streaming ASR.

**Architecture:**

- **Native `Speech` plugin.** It records 16 kHz mono PCM with `AudioRecord`. It keeps API keys in Keystore-backed storage, and the WebView can set them but never read them. It runs HTTP and WebSocket requests on the WebView's behalf and substitutes the key itself, which also avoids CORS.
- **TypeScript engine layer.** It holds the provider-specific logic: building requests, parsing responses, and Doubao frame encoding. Each engine is a pure function so it can be unit-tested with vitest.
- **Host binding.** Native refuses to attach a key to any host other than the one bound when the key was saved.

**Tech Stack:** Capacitor 7 plugin (Java, `AudioRecord`, `HttpURLConnection`, `EncryptedSharedPreferences` / Keystore; OkHttp only in Phase 2 for WS), React + TS, vitest, JUnit.

**Constraints:**

- Public repo: no bundled keys, no personal endpoints. The user brings their own key.
- Default engine = system recogniser, which needs no key. The engine name is shown on the mic sheet so the user always knows where audio goes.
- Audio is never written to disk except a temp WAV for batch upload, which is deleted in `finally`.
- Every UI string goes through i18n (en + zh).

---

## Provider matrix (decides adapter count)

| Engine                                                                  | Adapter           | Mode               | Why                                                                                                                       | Verify before coding                                                                                                                         |
| ----------------------------------------------------------------------- | ----------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Android system (`SpeechRecognizer`)                                     | `system`          | streaming partials | free, no key; Fold7 = Google speech services                                                                              | zh / mixed quality, `createOnDeviceSpeechRecognizer` availability                                                                            |
| OpenAI `gpt-transcribe`                                                 | `openai-compat`   | batch              | new recommended file model (~$0.0045/min), takes expected languages and a keyword/context prompt (handles code-switching) | exact param names for language list and context on `/v1/audio/transcriptions`                                                                |
| Groq `whisper-large-v3-turbo`                                           | `openai-compat`   | batch              | very fast and cheap                                                                                                       | base URL `https://api.groq.com/openai/v1`                                                                                                    |
| SiliconFlow `FunAudioLLM/SenseVoiceSmall`                               | `openai-compat`   | batch              | strong zh / zh-en, China-reachable, cheap                                                                                 | `.com` vs `.cn` host; whether a `language` field is accepted                                                                                 |
| Custom OpenAI-compatible (e.g. a self-hosted faster-whisper / speaches) | `openai-compat`   | batch              | own server, no third party                                                                                                | —                                                                                                                                            |
| Doubao streaming ASR 2.0 (Volcengine)                                   | `doubao-stream`   | streaming          | best zh, live partials                                                                                                    | resource id for 2.0 apps (`volc.bigasr.sauc.duration` reportedly fails on new 2.0 apps); App Key / Access Key headers; binary frame protocol |
| OpenAI `gpt-live-transcribe`                                            | `openai-realtime` | streaming          | live partials, multilingual                                                                                               | **Phase 3**, WS session shape                                                                                                                |
| Gemini / DashScope (Fun-ASR, Qwen-ASR)                                  | new adapters      | batch              | optional                                                                                                                  | **Phase 3**                                                                                                                                  |

One `openai-compat` adapter covers four providers, so supporting several vendors costs a preset list, not new code.

---

## Phase 0 — Benchmark before choosing defaults (half a day)

### Task 0.1: Offline ASR bench script

**Files:**

- Create: `scripts/asr-bench.mjs`
- Create: `scripts/asr-bench/README.md` (samples live in a git-ignored directory outside the repo)

The script reads `ASR_SAMPLES_DIR` (`*.wav` plus a same-name `*.txt` reference) and keys from env (`OPENAI_API_KEY`, `GROQ_API_KEY`, `SILICONFLOW_API_KEY`, `DOUBAO_APP_KEY` / `DOUBAO_ACCESS_KEY`). For each engine it prints a CER/latency table:

```
engine                 CER    p50 latency
openai/gpt-transcribe  3.1%   1.4s
siliconflow/sensevoice 4.0%   0.6s
...
```

CER = character edit distance / reference length, computed after stripping punctuation and whitespace and lower-casing Latin text.

**Steps:**

1. Write `cer()` with a vitest test (`scripts/asr-bench/cer.test.ts`): `cer('你好 world','你好world')===0`, `cer('abc','abd')≈0.333`. Run it and watch it fail, implement it, then watch it pass.
2. Add one runner per engine, reusing the Phase 1 request builders once they exist. Until then use inline `fetch`.
3. Shaun records about 10 clips (pure zh, zh-en code-switching with words like Herdr/Codex/Alma, numbers, a noisy street, a 30 s ramble).
4. Run the bench and paste the table into this plan under **Results**. **The default API engine and preset order are decided from it.**
5. Commit: `chore(asr): offline bench script`.

---

## Phase 1 — System recogniser + OpenAI-compatible batch

### Task 1.1: Engine types and presets

**Files:**

- Create: `src/speech/types.ts`, `src/speech/presets.ts`
- Test: `src/speech/presets.test.ts`

```ts
// types.ts
export type EngineKind = 'system' | 'openai-compat' | 'doubao-stream'
export interface EngineConfig {
  id: string // 'openai', 'groq', 'siliconflow', 'custom-1', 'system', 'doubao'
  kind: EngineKind
  label: string
  baseUrl?: string // openai-compat only
  model?: string
  languages: string[] // ['zh','en']
  keywords: string[] // vocabulary hints: Herdr, Codex, Alma …
}
export interface TranscribeResult {
  text: string
  engineId: string
  ms: number
}
```

The `presets.ts` file exports `PRESETS: EngineConfig[]` for `system`, `openai`, `groq` and `siliconflow`.

The test asserts:

- Every preset with `kind:'openai-compat'` has an https `baseUrl` and a `model`.
- Ids are unique.
- `system` is first.

Steps: write the failing test, implement, make it pass, commit with `feat(speech): engine types and presets`.

### Task 1.2: OpenAI-compatible request builder and parser

**Files:**

- Create: `src/speech/openaiCompat.ts`
- Test: `src/speech/openaiCompat.test.ts`

```ts
export interface NativeHttpSpec {
  engineId: string // native resolves the key by this id
  url: string
  method: 'POST'
  headers: Record<string, string> // may contain the literal '{{key}}'
  fields: Record<string, string>
  fileField: string // native attaches the recorded WAV here
}
export function buildTranscriptionRequest(c: EngineConfig): NativeHttpSpec {
  return {
    engineId: c.id,
    url: `${c.baseUrl!.replace(/\/+$/, '')}/audio/transcriptions`,
    method: 'POST',
    headers: { Authorization: 'Bearer {{key}}' },
    fields: {
      model: c.model!,
      response_format: 'json',
      ...(c.languages.length === 1 ? { language: c.languages[0] } : {}),
      ...(c.keywords.length ? { prompt: c.keywords.join(', ') } : {}),
    },
    fileField: 'file',
  }
}
export function parseTranscription(body: string): string {
  const j = JSON.parse(body)
  if (typeof j.text !== 'string') throw new Error('no_text')
  return j.text.trim()
}
```

Tests:

- The URL normalises a trailing `/`.
- A single language sets `language`, while multiple languages leave it unset (Whisper-style APIs only take one).
- Keywords become `prompt`.
- The parser trims text and throws `no_text` on `{error:…}`.

Before merging, replace the `gpt-transcribe` language/context fields with the documented names. Keep `language`/`prompt` for Whisper-style providers by adding a `paramStyle: 'whisper' | 'gpt-transcribe'` field to `EngineConfig`, and cover it with a test.

Commit: `feat(speech): openai-compatible request builder`.

### Task 1.3: Native plugin — key store with host binding

**Files:**

- Create: `android/app/src/main/java/club/a_dobe/alma/SpeechKeyStore.java`
- Create: `android/app/src/main/java/club/a_dobe/alma/SpeechHostRules.java` (pure, no Android types)
- Test: `android/app/src/test/java/club/a_dobe/alma/SpeechHostRulesTest.java`

Rules (`SpeechHostRules.allowed(String boundUrl, String requestUrl)`):

- The scheme must be https. The only exception is `http://` to RFC1918, loopback or `.local` addresses, and only when `boundUrl` is also such an address (self-hosted on the LAN).
- The host and port must equal the bound URL's host and port.

JUnit cases:

- Same host passes; a different host fails.
- http to a public host fails; http to `192.168.x.x` bound to the same address passes.
- A userinfo trick (`https://api.openai.com@evil.com`) fails.

`SpeechKeyStore` is a thin wrapper over `EncryptedSharedPreferences` (adding `androidx.security:security-crypto`) and stores `{key, boundUrl}` per engineId. Its API is `set`, `has`, `delete` and `resolve(engineId, requestUrl)`. There is deliberately **no `get` exposed to JS**.

Run: `JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./android/gradlew -p android testDebugUnitTest --tests '*SpeechHostRules*'`

Commit: `feat(speech): native key store with host binding`.

### Task 1.4: Native plugin — recorder + batch upload

**Files:**

- Create: `android/app/src/main/java/club/a_dobe/alma/SpeechPlugin.java`
- Create: `android/app/src/main/java/club/a_dobe/alma/WavWriter.java`
- Test: `android/app/src/test/java/club/a_dobe/alma/WavWriterTest.java`
- Modify: `android/app/src/main/java/club/a_dobe/alma/MainActivity.java:53` (`registerPlugin(SpeechPlugin.class)`)
- Modify: `android/app/src/main/AndroidManifest.xml:85` (add `RECORD_AUDIO`)

Plugin methods:

| Method                                                                             | Behaviour                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startRecording()`                                                                 | Requests the permission, then runs `AudioRecord` at 16 kHz/16-bit mono. Emits a `level` event (RMS 0–1) about every 100 ms. Hard cap of 5 min.                                                                                    |
| `stopRecording() → {durationMs}`                                                   |                                                                                                                                                                                                                                   |
| `cancelRecording()`                                                                |                                                                                                                                                                                                                                   |
| `transcribe(spec: NativeHttpSpec) → {status, body}`                                | Writes a temp WAV, builds a multipart POST, and calls `SpeechKeyStore.resolve` (on failure, rejects with `key_missing` / `host_not_allowed`). Replaces `{{key}}` only inside headers. Timeout 60 s. Deletes the WAV in `finally`. |
| `setKey({engineId, key, boundUrl})`, `hasKey({engineId})`, `deleteKey({engineId})` |                                                                                                                                                                                                                                   |

The `WavWriterTest` checks that the 44-byte header has correct RIFF/data sizes for N samples.

Commit: `feat(speech): native recorder and batch transcription`.

### Task 1.5: Native plugin — system recogniser

**File:** `SpeechPlugin.java`

`listenSystem({languages, preferOffline}) → final text`. It emits `partial` events.

- If `SpeechRecognizer.isOnDeviceRecognitionAvailable` and `preferOffline` is set, it uses `createOnDeviceSpeechRecognizer`. Otherwise it uses `createSpeechRecognizer`.
- `EXTRA_LANGUAGE` is the first language. `EXTRA_PARTIAL_RESULTS` is true.

The system path does not use our own recorder, since the recogniser owns the mic. No JUnit: the logic is all framework calls. It gets verified on the device instead (Task 1.9).

Commit: `feat(speech): system recogniser`.

### Task 1.6: TS bridge + `useDictation` hook

**Files:**

- Create: `src/speech/nativeSpeech.ts` (registerPlugin wrapper, same pattern as `src/updates/nativeUpdater.ts`)
- Create: `src/speech/useDictation.ts`
- Test: `src/speech/useDictation.test.tsx` (the plugin is mocked)

State machine: `idle → recording → transcribing → done(text) | error(code)`. On the system engine: `idle → listening(partial) → done`.

Tests:

- Batch: start → stop → `transcribe` is called with the preset's spec, and the result text is returned.
- `key_missing` becomes the `needs_key` error.
- Cancel never calls `transcribe`.
- The system engine forwards partials.

Commit: `feat(speech): dictation hook`.

### Task 1.7: Mic button in both composers

**Files:**

- Create: `src/speech/MicButton.tsx`, `src/speech/DictationSheet.tsx`
- Modify: `src/components/Composer.tsx` (button beside send; inserts at the cursor, never auto-sends)
- Modify: `src/herdr/HerdrScreens.tsx` (agent composer, same component)
- Modify: `src/i18n/en/*.ts`, `src/i18n/zh/*.ts`
- Test: `src/speech/MicButton.test.tsx`

UX:

- Tap opens a bottom sheet showing a level bar, the engine label ("Groq · whisper-large-v3-turbo"), elapsed time and live partials, with Stop / Cancel.
- On Stop the text is inserted at the cursor and the sheet closes.
- On `needs_key` the sheet shows a link to Settings → Voice input.
- The button is hidden when not native (browser dev) unless `?speechMock=1`.

Tests:

- The inserted text lands at the selection position.
- Send is never triggered.
- The engine label renders.

Add screenshots to `scripts/screenshots/capture.mjs`: the sheet while recording and the `needs_key` state, en + zh at 412 px. Follow the button rules in `docs/design-language.md`.

Commit: `feat(speech): mic button in composers`.

### Task 1.8: Settings → Voice input

**Files:**

- Create: `src/screens/VoiceSettings.tsx`, `src/speech/engineStore.ts` (non-secret config in localStorage `alma.speech.*`)
- Modify: `src/screens/SettingsScreen.tsx` (new section before About, `:799`)
- Test: `src/speech/engineStore.test.ts`, `src/screens/VoiceSettings.test.tsx`

Contents:

- Default engine picker.
- Per-engine card: key field (write-only, shows "saved ✓" and Delete), model, base URL (custom only), languages (default zh+en), keywords.
- "Test" button: records 5 s, transcribes, and shows the text and latency.
- "Prefer offline" for the system engine.
- Custom engines are add/remove.

Tests:

- The key is never written to localStorage. Assert that `localStorage` has no value containing the typed key.
- Changing the base URL of a saved custom engine clears the key binding: native `deleteKey` is called and the user must re-enter the key.

Commit: `feat(speech): voice settings`.

### Task 1.9: Verify and ship to a test build

1. `npm run check` passes with rc=0. Then `npm run android:build`.
2. Run the screenshots.
3. Private + public test builds go onto the Fold7 (skill `alma手机端迭代交付`).
4. On the device, for each configured engine: dictate zh, zh-en and noisy speech into a thread and into a Herdr pane. Record the results under **Results**.
5. On the device: deny the mic permission, then confirm the sheet explains it and recovers once it is granted.

---

## Phase 2 — Doubao streaming

### Task 2.1: Doubao frame codec (TS, pure)

**Files:**

- Create: `src/speech/doubao.ts`
- Test: `src/speech/doubao.test.ts`

First, pin down the protocol from the official doc: the 4-byte header (version / header size, message type + flags, serialization + compression), the full-client-request JSON, audio-only frames, the last-packet flag, and the server response with `result.text` / `utterances`. Then implement `encodeFullRequest(cfg)`, `encodeAudio(pcm, last)` and `decodeServer(buf) → {partial|final|error}`. gzip uses `CompressionStream` or `fflate`, whichever check allows.

Tests: round-trip header bits, the last-flag bit, and decoding a recorded sample server frame, which goes into a fixture with keys stripped.

### Task 2.2: Native authenticated WebSocket

**Files:**

- Modify: `SpeechPlugin.java`, `android/app/build.gradle` (OkHttp)

`openSocket({engineId, url, headers})` injects `{{key}}` into headers using the same host rules. It has `send(base64)`, `close()`, and the events `message(base64)` / `closed(code)`. While a socket is open, the recorder pushes 200 ms PCM chunks as `pcm` events. JS encodes them and sends them back to the socket. That round trip over the bridge is about 6.4 KB per 200 ms. If it lags on the device, move the encoding to native.

Doubao needs two secrets (App Key + Access Key). Store them as one JSON blob per engineId and expand `{{key.app}}` / `{{key.access}}`.

### Task 2.3: Streaming engine in the hook + sheet

Live partials replace the sheet text, and Stop sends the last frame and waits for the final result (timeout 5 s). Tests use a mocked socket that replays fixture frames.

---

## Phase 3 — Optional (only if Phase 0/1 results justify it)

- `openai-realtime` (`gpt-live-transcribe`) as a second streaming engine.
- Gemini / DashScope batch adapters.
- On-device SenseVoice via sherpa-onnx: the model is downloaded on demand, never in the APK.
- "Compare" mode in Voice settings: one recording goes to every configured engine side by side.

---

## Results

(fill in from Task 0.1 and 1.9)
