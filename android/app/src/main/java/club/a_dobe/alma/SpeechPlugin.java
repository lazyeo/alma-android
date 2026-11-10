package club.a_dobe.alma;

import android.Manifest;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.security.GeneralSecurityException;
import java.util.Iterator;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

/**
 * Voice input: records the mic and talks to the speech engine itself, so the
 * engine's API key never enters the WebView. JS sees only key status, mic
 * level, the engine's raw replies and errors (contract: src/speech/nativeSpeech.ts).
 *
 * One dictation at a time: either a batch recording (kept in memory, then
 * uploaded as WAV) or a real-time stream (PCM pushed over a WebSocket).
 */
@CapacitorPlugin(
    name = "Speech",
    permissions = @Permission(alias = SpeechPlugin.MIC, strings = { Manifest.permission.RECORD_AUDIO })
)
public class SpeechPlugin extends Plugin {
    static final String MIC = "microphone";
    private static final long TRANSCRIBE_TIMEOUT_S = 120;
    /** How long a stopped stream may take to deliver its final tokens. */
    private static final long DRAIN_TIMEOUT_MS = 10_000;
    private static final int ERROR_MESSAGE_LIMIT = 160;
    private static final MediaType WAV = MediaType.get("audio/wav");
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    // Redirects are off: the host check runs on the URL JS asked for, so a
    // 3xx must not carry the key (stream config frame) or audio elsewhere.
    private final OkHttpClient http = new OkHttpClient.Builder()
        .followRedirects(false)
        .followSslRedirects(false)
        .build();
    // Shares the pool with `http`. The server only answers after it has
    // transcribed up to 5 min of audio, so the read wait spans the whole call.
    private final OkHttpClient batchHttp = http.newBuilder()
        .callTimeout(TRANSCRIBE_TIMEOUT_S, TimeUnit.SECONDS)
        .readTimeout(TRANSCRIBE_TIMEOUT_S, TimeUnit.SECONDS)
        .writeTimeout(TRANSCRIBE_TIMEOUT_S, TimeUnit.SECONDS)
        .build();
    private final ScheduledExecutorService timers = Executors.newSingleThreadScheduledExecutor();
    private SpeechKeyStore keys;

    private final Object lock = new Object();
    /** Batch recorder while recording. Guarded by lock. */
    private SpeechRecorder recorder;
    /** Batch audio from start until transcribe or cancel. Guarded by lock. */
    private ByteArrayOutputStream pcm;
    /** Upload in flight. Guarded by lock. */
    private Call transcribing;
    /** Bumped by cancelRecording so an upload that was about to start is dropped. */
    private long batchEpoch;
    /** Current real-time stream, connecting, live or draining. Guarded by lock. */
    private Stream stream;

    @Override
    public void load() {
        keys = new SpeechKeyStore(getContext());
    }

    // ---- microphone permission ----

    @PluginMethod
    public void checkMicPermission(PluginCall call) {
        call.resolve(micResult());
    }

    @PluginMethod
    public void requestMicPermission(PluginCall call) {
        if (micGranted()) {
            call.resolve(micResult());
            return;
        }
        requestPermissionForAlias(MIC, call, "micPermissionCallback");
    }

    @PermissionCallback
    private void micPermissionCallback(PluginCall call) {
        call.resolve(micResult());
    }

    private boolean micGranted() {
        return getPermissionState(MIC) == PermissionState.GRANTED;
    }

    private JSObject micResult() {
        PermissionState state = getPermissionState(MIC);
        JSObject result = new JSObject();
        result.put("mic", state == PermissionState.GRANTED ? "granted" : state == PermissionState.DENIED ? "denied" : "prompt");
        return result;
    }

    // ---- keys (write-only towards JS) ----

    @PluginMethod
    public void setKey(PluginCall call) {
        String engineId = call.getString("engineId");
        String key = call.getString("key");
        String boundUrl = call.getString("boundUrl");
        if (!SpeechKeyStore.validEngineId(engineId) || key == null || key.trim().isEmpty()) {
            call.reject("Missing engine or key", "io");
            return;
        }
        if (!SpeechHostRules.bindable(boundUrl)) {
            call.reject("A key can only be bound to an https or wss address", SpeechKeyStore.HOST_NOT_ALLOWED);
            return;
        }
        try {
            keys.set(engineId, key.trim(), boundUrl.trim());
            call.resolve();
        } catch (GeneralSecurityException | IOException error) {
            // No cause attached: the message must never carry key material.
            call.reject("Could not store the key", "io");
        }
    }

    @PluginMethod
    public void keyStatus(PluginCall call) {
        String engineId = call.getString("engineId");
        JSObject result = new JSObject();
        if (!SpeechKeyStore.validEngineId(engineId)) {
            result.put("set", false);
            call.resolve(result);
            return;
        }
        SpeechKeyStore.Status status = keys.status(engineId);
        result.put("set", status.set);
        if (status.last4 != null) result.put("last4", status.last4);
        call.resolve(result);
    }

    @PluginMethod
    public void deleteKey(PluginCall call) {
        String engineId = call.getString("engineId");
        if (SpeechKeyStore.validEngineId(engineId)) keys.delete(engineId);
        call.resolve();
    }

    // ---- batch ----

    @PluginMethod
    public void startRecording(PluginCall call) {
        if (!micGranted()) {
            call.reject("Microphone permission denied", "mic_denied");
            return;
        }
        Stream drained;
        synchronized (lock) {
            if (recorder != null || transcribing != null || (stream != null && !stream.draining)) {
                call.reject("Voice input is already running", "busy");
                return;
            }
            drained = stream;
            stream = null;
        }
        if (drained != null) drained.cancel();
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        SpeechRecorder started;
        synchronized (lock) {
            if (recorder != null || transcribing != null || stream != null) {
                call.reject("Voice input is already running", "busy");
                return;
            }
            pcm = buffer;
            try {
                started = SpeechRecorder.start(new SpeechRecorder.Listener() {
                    @Override
                    public void onChunk(byte[] chunk) {
                        synchronized (lock) {
                            // A cancelled or uploaded recording no longer takes audio.
                            if (pcm == buffer) buffer.write(chunk, 0, chunk.length);
                        }
                        emitLevel(chunk);
                    }

                    @Override
                    public void onStopped(SpeechRecorder self, String reason) {
                        synchronized (lock) {
                            if (recorder == self) recorder = null;
                            // A failed recording is never uploaded; free it now.
                            if ("error".equals(reason) && pcm == buffer) pcm = null;
                        }
                        emitRecordingStopped(reason);
                    }
                });
            } catch (IOException error) {
                pcm = null;
                call.reject("Microphone unavailable", "io");
                return;
            }
            recorder = started;
        }
        call.resolve();
    }

    @PluginMethod
    public void stopRecording(PluginCall call) {
        SpeechRecorder active;
        synchronized (lock) {
            active = recorder;
            recorder = null;
        }
        // Outside the lock: stop() waits for the recorder thread, which takes it.
        if (active != null) active.stop();
        long bytes;
        synchronized (lock) {
            bytes = pcm == null ? 0 : pcm.size();
        }
        JSObject result = new JSObject();
        result.put("durationMs", bytes * 1000L / (SpeechWav.SAMPLE_RATE * 2L));
        call.resolve(result);
    }

    @PluginMethod
    public void cancelRecording(PluginCall call) {
        cancelBatch();
        call.resolve();
    }

    private void cancelBatch() {
        SpeechRecorder active;
        Call upload;
        synchronized (lock) {
            active = recorder;
            recorder = null;
            pcm = null;
            upload = transcribing;
            transcribing = null;
            batchEpoch++;
        }
        if (active != null) active.stop();
        if (upload != null) upload.cancel();
    }

    @PluginMethod
    public void transcribe(PluginCall call) {
        String engineId = call.getString("engineId");
        String url = call.getString("url");
        String fileField = call.getString("fileField", "file");
        JSObject fields = call.getObject("fields", new JSObject());
        if (!SpeechKeyStore.validEngineId(engineId) || url == null || fileField == null || fileField.isEmpty()) {
            call.reject("Invalid transcription request", "io");
            return;
        }
        byte[] audio;
        long epoch;
        synchronized (lock) {
            if (recorder != null || transcribing != null) {
                call.reject("Voice input is already running", "busy");
                return;
            }
            if (pcm == null || pcm.size() == 0) {
                call.reject("Nothing was recorded", "no_recording");
                return;
            }
            // Taking the audio here is the "drop after transcribe": whatever
            // happens next, this recording is uploaded at most once.
            audio = pcm.toByteArray();
            pcm = null;
            epoch = batchEpoch;
        }
        String key;
        try {
            key = keys.resolve(engineId, url);
        } catch (SpeechKeyStore.KeyException error) {
            call.reject(error.getMessage(), error.code);
            return;
        }
        Request request;
        try {
            MultipartBody.Builder body = new MultipartBody.Builder().setType(MultipartBody.FORM);
            if (fields != null) {
                Iterator<String> names = fields.keys();
                while (names.hasNext()) {
                    String name = names.next();
                    Object value = fields.opt(name);
                    if (value != null && value != org.json.JSONObject.NULL) body.addFormDataPart(name, String.valueOf(value));
                }
            }
            body.addFormDataPart(fileField, "audio.wav", RequestBody.create(SpeechWav.wav(audio), WAV));
            request = new Request.Builder()
                .url(url)
                .header("Authorization", "Bearer " + key)
                .post(body.build())
                .build();
        } catch (IllegalArgumentException error) {
            call.reject("Invalid transcription request", "io");
            return;
        }
        Call upload = batchHttp.newCall(request);
        synchronized (lock) {
            if (epoch != batchEpoch) {
                call.reject("Transcription cancelled", "io");
                return;
            }
            transcribing = upload;
        }
        upload.enqueue(new Callback() {
            @Override
            public void onFailure(Call failed, IOException error) {
                finishUpload(failed);
                rejectTransport(call, failed, error);
            }

            @Override
            public void onResponse(Call done, Response response) {
                try (ResponseBody body = response.body()) {
                    String text = body == null ? "" : body.string();
                    JSObject result = new JSObject();
                    result.put("status", response.code());
                    result.put("body", text);
                    call.resolve(result);
                } catch (IOException error) {
                    rejectTransport(call, done, error);
                } finally {
                    finishUpload(done);
                }
            }
        });
    }

    /**
     * A small JSON call to the bound host (Soniox async job, status,
     * transcript, delete). Independent of the recorder: it never touches
     * the batch audio, so it is not counted as "running" voice input.
     */
    @PluginMethod
    public void request(PluginCall call) {
        String engineId = call.getString("engineId");
        String method = call.getString("method");
        String url = call.getString("url");
        String json = call.getString("body");
        boolean known = "GET".equals(method) || "POST".equals(method) || "DELETE".equals(method);
        if (!SpeechKeyStore.validEngineId(engineId) || url == null || !known) {
            call.reject("Invalid speech request", "io");
            return;
        }
        String key;
        try {
            key = keys.resolve(engineId, url);
        } catch (SpeechKeyStore.KeyException error) {
            call.reject(error.getMessage(), error.code);
            return;
        }
        Request request;
        try {
            Request.Builder builder = new Request.Builder().url(url).header("Authorization", "Bearer " + key);
            if ("POST".equals(method)) builder.post(RequestBody.create(json == null ? "{}" : json, JSON));
            else if ("DELETE".equals(method)) builder.delete();
            else builder.get();
            request = builder.build();
        } catch (IllegalArgumentException error) {
            call.reject("Invalid speech request", "io");
            return;
        }
        http.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call failed, IOException error) {
                rejectTransport(call, failed, error);
            }

            @Override
            public void onResponse(Call done, Response response) {
                try (ResponseBody body = response.body()) {
                    JSObject result = new JSObject();
                    result.put("status", response.code());
                    result.put("body", body == null ? "" : body.string());
                    call.resolve(result);
                } catch (IOException error) {
                    rejectTransport(call, done, error);
                }
            }
        });
    }

    private void finishUpload(Call done) {
        synchronized (lock) {
            if (transcribing == done) transcribing = null;
        }
    }

    private static void rejectTransport(PluginCall call, Call failed, IOException error) {
        if (failed.isCanceled()) call.reject("Transcription cancelled", "io");
        // OkHttp's call timeout and socket timeouts are both InterruptedIOException.
        else if (error instanceof InterruptedIOException) call.reject("The speech service timed out", "timeout");
        else call.reject("Could not reach the speech service", "network");
    }

    // ---- real-time ----

    @PluginMethod
    public void startStream(PluginCall call) {
        String engineId = call.getString("engineId");
        String url = call.getString("url");
        String config = call.getString("config");
        if (!micGranted()) {
            call.reject("Microphone permission denied", "mic_denied");
            return;
        }
        if (!SpeechKeyStore.validEngineId(engineId) || url == null || config == null) {
            call.reject("Invalid stream request", "io");
            return;
        }
        String firstFrame;
        try {
            firstFrame = SpeechConfigFrame.withApiKey(config, keys.resolve(engineId, url));
        } catch (SpeechKeyStore.KeyException error) {
            call.reject(error.getMessage(), error.code);
            return;
        } catch (IllegalArgumentException error) {
            call.reject("Invalid stream config", "io");
            return;
        }
        Request request;
        try {
            request = new Request.Builder().url(url).build();
        } catch (IllegalArgumentException error) {
            call.reject("Invalid stream address", "io");
            return;
        }
        Stream next = new Stream(call, firstFrame);
        Stream drained;
        synchronized (lock) {
            if (recorder != null || transcribing != null || (stream != null && !stream.draining)) {
                call.reject("Voice input is already running", "busy");
                return;
            }
            // A previous stream still waiting for its final tokens gives way
            // to the new dictation; its late events would confuse the new one.
            drained = stream;
            stream = next;
        }
        if (drained != null) drained.cancel();
        WebSocket socket = http.newWebSocket(request, next);
        boolean cancelledMeanwhile;
        synchronized (lock) {
            if (next.socket == null) next.socket = socket;
            cancelledMeanwhile = next.ended;
        }
        if (cancelledMeanwhile) socket.cancel();
    }

    @PluginMethod
    public void stopStream(PluginCall call) {
        Stream current;
        synchronized (lock) {
            current = stream;
        }
        if (current != null) current.finishAudio();
        call.resolve();
    }

    @PluginMethod
    public void cancelStream(PluginCall call) {
        Stream current;
        synchronized (lock) {
            current = stream;
            stream = null;
        }
        if (current != null) current.cancel();
        call.resolve();
    }

    /**
     * One WebSocket dictation. Every event it emits is dropped once it has
     * been cancelled or replaced, so a stale stream never talks to the
     * session that followed it.
     */
    private final class Stream extends WebSocketListener {
        private final PluginCall startCall;
        /** Holds the key; cleared as soon as it is sent. Guarded by lock. */
        private String firstFrame;
        WebSocket socket;
        SpeechRecorder streamRecorder;
        boolean opened;
        boolean draining;
        boolean ended;
        boolean startSettled;
        ScheduledFuture<?> drainTimer;

        Stream(PluginCall startCall, String firstFrame) {
            this.startCall = startCall;
            this.firstFrame = firstFrame;
        }

        @Override
        public void onOpen(WebSocket webSocket, Response response) {
            String frame;
            synchronized (lock) {
                if (ended) {
                    webSocket.cancel();
                    return;
                }
                socket = webSocket;
                opened = true;
                frame = firstFrame;
                firstFrame = null;
            }
            if (frame == null || !webSocket.send(frame)) {
                failStart(webSocket, "Could not reach the speech service", "network");
                return;
            }
            SpeechRecorder started;
            try {
                started = SpeechRecorder.start(new SpeechRecorder.Listener() {
                    @Override
                    public void onChunk(byte[] chunk) {
                        webSocket.send(ByteString.of(chunk, 0, chunk.length));
                        if (isLive()) emitLevel(chunk);
                    }

                    @Override
                    public void onStopped(SpeechRecorder self, String reason) {
                        boolean live;
                        synchronized (lock) {
                            if (streamRecorder == self) streamRecorder = null;
                            live = !ended;
                        }
                        if (!live) return;
                        emitRecordingStopped(reason);
                        // At the cap JS ends the audio itself (stopStream);
                        // a dead mic leaves nothing worth waiting for.
                        if ("error".equals(reason)) cancelSilently();
                    }
                });
            } catch (IOException error) {
                failStart(webSocket, "Microphone unavailable", "io");
                return;
            }
            boolean keep;
            synchronized (lock) {
                keep = !ended && !draining;
                if (keep) {
                    streamRecorder = started;
                    startSettled = true;
                }
            }
            if (!keep) {
                started.stop();
                return;
            }
            startCall.resolve();
        }

        @Override
        public void onMessage(WebSocket webSocket, String text) {
            if (!isLive()) return;
            JSObject event = new JSObject();
            event.put("data", text);
            notifyListeners("streamMessage", event);
        }

        @Override
        public void onMessage(WebSocket webSocket, ByteString bytes) {
            // The protocol replies in text only.
        }

        @Override
        public void onClosing(WebSocket webSocket, int code, String reason) {
            webSocket.close(1000, null);
            end(code, reason, null);
        }

        @Override
        public void onClosed(WebSocket webSocket, int code, String reason) {
            end(code, reason, null);
        }

        @Override
        public void onFailure(WebSocket webSocket, Throwable error, Response response) {
            boolean wasOpen;
            synchronized (lock) {
                wasOpen = opened;
            }
            if (!wasOpen) {
                String message = response != null
                    ? "Speech service refused the connection (HTTP " + response.code() + ")"
                    : "Could not reach the speech service";
                if (response != null) response.close();
                failStart(webSocket, message, "network");
                return;
            }
            end(1006, "", shortMessage(error));
        }

        /** Stops the mic and tells the server the audio is over; the socket stays for final tokens. */
        void finishAudio() {
            SpeechRecorder active;
            WebSocket ws;
            synchronized (lock) {
                if (ended || draining) return;
                draining = true;
                active = streamRecorder;
                streamRecorder = null;
                ws = opened ? socket : null;
            }
            if (active != null) active.stop();
            if (ws == null) {
                // Still connecting: there is no audio to finish.
                cancel();
                return;
            }
            ws.send("");
            ScheduledFuture<?> timer = timers.schedule(
                () -> {
                    WebSocket late;
                    synchronized (lock) {
                        late = socket;
                    }
                    end(1000, "drain timeout", null);
                    if (late != null) late.cancel();
                },
                DRAIN_TIMEOUT_MS,
                TimeUnit.MILLISECONDS
            );
            synchronized (lock) {
                drainTimer = timer;
                if (ended) timer.cancel(false);
            }
        }

        /** Closes at once without any further event; resolves nothing but the pending start. */
        void cancel() {
            SpeechRecorder active = markEnded();
            if (active != null) active.stop();
            WebSocket ws;
            synchronized (lock) {
                ws = socket;
                firstFrame = null;
            }
            if (ws != null) ws.cancel();
            settleStart("Voice input was cancelled", "io");
        }

        private void cancelSilently() {
            synchronized (lock) {
                if (stream == this) stream = null;
            }
            cancel();
        }

        private void failStart(WebSocket webSocket, String message, String code) {
            synchronized (lock) {
                if (stream == this) stream = null;
            }
            SpeechRecorder active = markEnded();
            if (active != null) active.stop();
            webSocket.cancel();
            settleStart(message, code);
        }

        /** Emits streamClosed once, for a stream that ended on its own. */
        private void end(int code, String reason, String error) {
            boolean live;
            synchronized (lock) {
                // Checked and set together: onClosing, onClosed and the drain
                // timer can race here from different threads.
                live = !ended;
                ended = true;
                if (stream == this) stream = null;
            }
            SpeechRecorder active = markEnded();
            if (active != null) active.stop();
            if (!live) return;
            // Closed before the start call resolved: report it there, not as an event.
            if (settleStart("The speech service closed the connection", "network")) return;
            JSObject event = new JSObject();
            event.put("code", code);
            event.put("reason", reason == null ? "" : reason);
            if (error != null) event.put("error", error);
            notifyListeners("streamClosed", event);
        }

        /** Marks the stream ended and hands back the recorder to stop outside the lock. */
        private SpeechRecorder markEnded() {
            synchronized (lock) {
                ended = true;
                firstFrame = null;
                if (drainTimer != null) drainTimer.cancel(false);
                drainTimer = null;
                SpeechRecorder active = streamRecorder;
                streamRecorder = null;
                return active;
            }
        }

        /** Rejects the start call if it is still pending; true when it was. */
        private boolean settleStart(String message, String code) {
            synchronized (lock) {
                if (startSettled) return false;
                startSettled = true;
            }
            startCall.reject(message, code);
            return true;
        }

        private boolean isLive() {
            synchronized (lock) {
                return !ended && stream == this;
            }
        }
    }

    private static String shortMessage(Throwable error) {
        String message = error.getMessage();
        if (message == null || message.isEmpty()) message = error.getClass().getSimpleName();
        return message.length() > ERROR_MESSAGE_LIMIT ? message.substring(0, ERROR_MESSAGE_LIMIT) : message;
    }

    // ---- events ----

    private void emitLevel(byte[] chunk) {
        JSObject event = new JSObject();
        event.put("rms", SpeechWav.rms(chunk, chunk.length));
        notifyListeners("level", event);
    }

    private void emitRecordingStopped(String reason) {
        JSObject event = new JSObject();
        event.put("reason", reason);
        notifyListeners("recordingStopped", event);
    }

    @Override
    protected void handleOnDestroy() {
        cancelBatch();
        Stream current;
        synchronized (lock) {
            current = stream;
            stream = null;
        }
        if (current != null) current.cancel();
        timers.shutdownNow();
        super.handleOnDestroy();
    }
}
