package club.a_dobe.alma;

import android.annotation.SuppressLint;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import java.io.IOException;
import java.util.Arrays;

/**
 * Reads 16 kHz mono s16le from the microphone on its own thread and hands
 * out 100 ms chunks. It stops by itself at the 5 minute cap or when the mic
 * fails; the caller learns that through {@link Listener#onStopped}.
 */
final class SpeechRecorder {
    static final int CHUNK_BYTES = SpeechWav.SAMPLE_RATE / 10 * 2;
    static final long MAX_BYTES = 5L * 60L * SpeechWav.SAMPLE_RATE * 2L;
    private static final long JOIN_TIMEOUT_MS = 1000;

    interface Listener {
        /** A chunk of PCM; {@code chunk} is owned by the listener. */
        void onChunk(byte[] chunk);

        /** The recorder stopped on its own: "limit" or "error". Not called after {@link #stop}. */
        void onStopped(SpeechRecorder recorder, String reason);
    }

    private final AudioRecord record;
    private final Listener listener;
    private final Thread thread;
    private volatile boolean running = true;

    private SpeechRecorder(AudioRecord record, Listener listener) {
        this.record = record;
        this.listener = listener;
        this.thread = new Thread(this::loop, "alma-speech-recorder");
    }

    /**
     * Starts recording. The caller has already checked RECORD_AUDIO; a
     * revoked permission still surfaces here as an IOException.
     */
    @SuppressLint("MissingPermission")
    static SpeechRecorder start(Listener listener) throws IOException {
        int minBuffer = AudioRecord.getMinBufferSize(
            SpeechWav.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minBuffer <= 0) throw new IOException("Microphone format unsupported");
        AudioRecord record;
        try {
            // VOICE_RECOGNITION is tuned for ASR: no aggressive AGC or noise gating.
            record = new AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SpeechWav.SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                Math.max(minBuffer, CHUNK_BYTES * 4)
            );
        } catch (IllegalArgumentException | SecurityException error) {
            throw new IOException("Microphone unavailable", error);
        }
        if (record.getState() != AudioRecord.STATE_INITIALIZED) {
            record.release();
            throw new IOException("Microphone unavailable");
        }
        try {
            record.startRecording();
        } catch (IllegalStateException | SecurityException error) {
            record.release();
            throw new IOException("Microphone unavailable", error);
        }
        // Another app holding the mic leaves the record stopped without throwing.
        if (record.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) {
            record.release();
            throw new IOException("Microphone is in use");
        }
        SpeechRecorder recorder = new SpeechRecorder(record, listener);
        recorder.thread.start();
        return recorder;
    }

    /** Stops and waits for the last chunk to be delivered. Safe to call twice. */
    void stop() {
        running = false;
        if (Thread.currentThread() == thread) return;
        try {
            thread.join(JOIN_TIMEOUT_MS);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
    }

    private void loop() {
        String reason = null;
        long total = 0;
        byte[] chunk = new byte[CHUNK_BYTES];
        int filled = 0;
        try {
            while (running) {
                int read = record.read(chunk, filled, CHUNK_BYTES - filled);
                if (read < 0) {
                    reason = "error";
                    break;
                }
                filled += read;
                if (filled < CHUNK_BYTES) continue;
                listener.onChunk(chunk);
                chunk = new byte[CHUNK_BYTES];
                filled = 0;
                total += CHUNK_BYTES;
                if (total >= MAX_BYTES) {
                    reason = "limit";
                    break;
                }
            }
            // Keep the tail the user spoke just before letting go.
            if (reason == null && filled > 0) listener.onChunk(Arrays.copyOf(chunk, filled));
        } catch (RuntimeException error) {
            reason = "error";
        } finally {
            try {
                record.stop();
            } catch (IllegalStateException ignored) {
                // already stopped; release below is what matters
            }
            record.release();
        }
        // A stop() that raced a failure is a user stop, not a self-stop.
        if (reason != null && running) {
            running = false;
            listener.onStopped(this, reason);
        }
    }
}
