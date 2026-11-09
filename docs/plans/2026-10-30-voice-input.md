# Voice Input Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Dictate into the Alma chat composer and the Herdr agent composer. The recognised text fills the input field and is never sent automatically. Several recognition engines are pluggable: Soniox real-time ASR (the default) and a set of OpenAI-compatible transcription APIs. The Android system recogniser and on-device models are deferred and will be tested together later; Doubao streaming ASR moved to Phase 3.

**Architecture:**

- **Native `Speech` plugin.** It records 16 kHz mono PCM with `AudioRecord`. It keeps API keys in Keystore-backed storage, and the WebView can set them but never read them. It runs HTTP and WebSocket requests on the WebView's behalf and substitutes the key itself, which also avoids CORS.
- **TypeScript engine layer.** It holds the provider-specific logic: building requests, parsing responses, and accumulating Soniox token streams. Each engine is a pure function so it can be unit-tested with vitest.
- **Host binding.** Native refuses to attach a key to any host other than the one bound when the key was saved.

**Tech Stack:** Capacitor 7 plugin (Java, `AudioRecord`, `HttpURLConnection`, `EncryptedSharedPreferences` / Keystore; OkHttp only in Phase 2 for WS), React + TS, vitest, JUnit.

**Constraints:**

- Public repo: no bundled keys, no personal endpoints. The user brings their own key.
- Default engine = Soniox real-time with the term list (decided from the Phase 0 results). The user brings the key. The engine name is shown on the mic sheet so the user always knows where audio goes.
- Audio is never written to disk except a temp WAV for batch upload, which is deleted in `finally`.
- Every UI string goes through i18n (en + zh).

---

## Provider matrix (decides adapter count)

| Engine                                                                  | Adapter           | Mode               | Why                                                                                                                       | Verify before coding                                                                                                                         |
| ----------------------------------------------------------------------- | ----------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Soniox `stt-rt-v6`                                                      | `soniox-rt`       | streaming          | **default**; live partials, zh-en code-switching, `context.terms`; ~250 ms release-to-final                               | done (Phase 0)                                                                                                                               |
| Soniox `stt-async-v6`                                                   | `soniox-async`    | batch              | best batch accuracy with terms after gpt-transcribe; optional second Soniox option                                        | done (Phase 0)                                                                                                                               |
| Android system (`SpeechRecognizer`)                                     | `system`          | streaming partials | **deferred**: test later together with on-device models                                                                   | zh / mixed quality, `createOnDeviceSpeechRecognizer` availability                                                                            |
| OpenAI `gpt-transcribe`                                                 | `openai-compat`   | batch              | new recommended file model (~$0.0045/min), takes expected languages and a keyword/context prompt (handles code-switching) | exact param names for language list and context on `/v1/audio/transcriptions`                                                                |
| Groq `whisper-large-v3-turbo`                                           | `openai-compat`   | batch              | very fast and cheap                                                                                                       | base URL `https://api.groq.com/openai/v1`                                                                                                    |
| SiliconFlow `FunAudioLLM/SenseVoiceSmall`                               | `openai-compat`   | batch              | strong zh / zh-en, China-reachable, cheap                                                                                 | `.com` vs `.cn` host; whether a `language` field is accepted                                                                                 |
| Custom OpenAI-compatible (e.g. a self-hosted faster-whisper / speaches) | `openai-compat`   | batch              | own server, no third party                                                                                                | —                                                                                                                                            |
| Doubao streaming ASR 2.0 (Volcengine)                                   | `doubao-stream`   | streaming          | **Phase 3, optional**; strong zh, live partials                                                                           | resource id for 2.0 apps (`volc.bigasr.sauc.duration` reportedly fails on new 2.0 apps); App Key / Access Key headers; binary frame protocol |
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
3. Record about 10 clips (pure zh, zh-en code-switching with words like Herdr/Codex/Alma, numbers, a noisy street, a 30 s ramble).
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
export type EngineKind = 'soniox-rt' | 'soniox-async' | 'openai-compat'
export interface EngineConfig {
  id: string // 'soniox-rt', 'soniox-async', 'openai', 'groq', 'siliconflow', 'custom-1'
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

The `presets.ts` file exports `PRESETS: EngineConfig[]` for `soniox-rt`, `openai`, `groq` and `siliconflow` (`soniox-async` optional).

The test asserts:

- Every preset with `kind:'openai-compat'` has an https `baseUrl` and a `model`.
- Ids are unique.
- `soniox-rt` is first (the default).

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

### Task 1.5: Native plugin — system recogniser (deferred)

Deferred: test it later together with on-device models. This round ships the API engines only, so neither `listenSystem` nor a `system` preset exists yet.

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

## Phase 2 — Soniox real-time (`stt-rt-v6`)

### Task 2.1: Soniox token stream (TS, pure)

**Files:**

- Create: `src/speech/soniox.ts`
- Test: `src/speech/soniox.test.ts`

Protocol (`wss://stt-rt.soniox.com/transcribe-websocket`):

- First frame: a JSON text config `{api_key, model: "stt-rt-v6", audio_format: "pcm_s16le", sample_rate: 16000, num_channels: 1, language_hints: ["zh","en"], context: {terms: [...]}}`. JS builds it **without** `api_key`; native adds the key.
- Then binary PCM frames of 100 ms (3200 bytes).
- End of audio: an empty string frame.
- Server messages: `tokens[]` with `text` / `is_final`. Tokens whose text starts with `<` are markers (for example `<end>`) and are dropped. Final tokens append to the committed text; non-final tokens are the preview tail and are replaced by every message. `finished: true` ends the session. `error_code` / `error_message` is an error.

Implement `buildSonioxConfig(cfg)`, `parseSonioxMessage(json)` and `applySonioxMessage(state, msg) → state`, all pure. Tests cover marker filtering, final accumulation across messages, tail replacement, `finished` and errors.

### Task 2.2: Native authenticated WebSocket

**Files:**

- Modify: `SpeechPlugin.java`, `android/app/build.gradle` (OkHttp)

`startStream({engineId, url, config})` resolves the key with the same host rules, puts `api_key` into the config frame natively, opens the socket with OkHttp, and streams 100 ms PCM chunks from the recorder straight to it (audio never crosses the bridge). Text messages are forwarded verbatim to JS as `streamMessage` events; JS parses them. `stopStream()` sends the empty end frame; `cancelStream()` closes immediately. Close/failure becomes a `streamClosed` event with a code.

### Task 2.3: Streaming engine in the hook + sheet

Live preview in the sheet: final text normally, the non-final tail in a lighter colour. Stop sends the end frame and waits for `finished` (timeout 5 s), then the committed text is inserted. Tests use a mocked plugin that replays fixture messages.

### Task 2.4 (optional): Soniox async

`POST /v1/files` → `POST /v1/transcriptions {model: "stt-async-v6", file_id, language_hints, context: {terms}}` → poll → `GET /transcript` → delete the transcription and the file. Second Soniox option for batch mode.

## Phase 3 — Optional (only if Phase 0/1 results justify it)

- Doubao streaming ASR 2.0 (`doubao-stream`): binary frame codec, two secrets (App Key + Access Key) stored as one JSON blob per engineId.
- Android system recogniser (former Task 1.5), together with on-device models.
- `openai-realtime` (`gpt-live-transcribe`) as a second streaming engine.
- Gemini / DashScope batch adapters.
- On-device SenseVoice via sherpa-onnx: the model is downloaded on demand, never in the APK.
- "Compare" mode in Voice settings: one recording goes to every configured engine side by side.

---

## Results

### Phase 0 (offline bench)

10 clips of mixed Chinese/English speech; mixed error rate = character errors for Chinese plus word errors for English; 22 keywords checked.

| Engine                          | Terms | Mixed error rate | Keywords | Latency                         |
| ------------------------------- | ----- | ---------------- | -------- | ------------------------------- |
| OpenAI `gpt-transcribe`         | yes   | 2.1%             | 20/22    | whole result ≈ 0.11× audio      |
| Soniox `stt-async-v6`           | yes   | 2.2%             | 21/22    | ≈ 0.45× audio                   |
| Soniox `stt-rt-v6`              | yes   | 3.5%             | 21/22    | release-to-final median ~250 ms |
| Soniox `stt-rt-v6`              | no    | 5.7%             |          |                                 |
| OpenAI `gpt-transcribe`         | no    | 7.5%             |          |                                 |
| OpenAI `gpt-4o-mini-transcribe` | no    | 7.5%             |          |                                 |
| OpenAI `whisper-1`              | no    | 9.5%             |          |                                 |

**Conclusion:** the term list is the biggest variable (it cuts the error rate to about a third). Default = Soniox real-time + term list; fallback = OpenAI `gpt-transcribe` + prompt built from the same terms.

### Phase 1 (device)

(fill in from Task 1.9)
