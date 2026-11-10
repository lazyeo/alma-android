package club.a_dobe.alma;

/** Pure PCM helpers: the WAV wrapper batch engines expect, and a mic level. */
final class SpeechWav {
    static final int SAMPLE_RATE = 16000;
    static final int CHANNELS = 1;
    private static final int BITS = 16;
    private static final int HEADER_BYTES = 44;

    private SpeechWav() {}

    static byte[] wav(byte[] pcm16le) {
        return wav(pcm16le, SAMPLE_RATE, CHANNELS);
    }

    /** Wraps raw signed 16-bit little-endian PCM in a canonical 44-byte RIFF header. */
    static byte[] wav(byte[] pcm16le, int sampleRate, int channels) {
        int dataBytes = pcm16le.length;
        int blockAlign = channels * BITS / 8;
        int byteRate = sampleRate * blockAlign;
        byte[] out = new byte[HEADER_BYTES + dataBytes];
        ascii(out, 0, "RIFF");
        int32(out, 4, 36 + dataBytes);
        ascii(out, 8, "WAVE");
        ascii(out, 12, "fmt ");
        int32(out, 16, 16); // fmt chunk size for PCM
        int16(out, 20, 1); // audio format 1 = PCM
        int16(out, 22, channels);
        int32(out, 24, sampleRate);
        int32(out, 28, byteRate);
        int16(out, 32, blockAlign);
        int16(out, 34, BITS);
        ascii(out, 36, "data");
        int32(out, 40, dataBytes);
        System.arraycopy(pcm16le, 0, out, HEADER_BYTES, dataBytes);
        return out;
    }

    /** Root mean square of the first {@code len} bytes of s16le PCM, 0..1. */
    static double rms(byte[] pcm, int len) {
        int samples = Math.min(len, pcm.length) / 2;
        if (samples == 0) return 0;
        double sum = 0;
        for (int i = 0; i < samples; i++) {
            int sample = (short) ((pcm[2 * i] & 0xff) | (pcm[2 * i + 1] << 8));
            double normalized = sample / 32768.0;
            sum += normalized * normalized;
        }
        return Math.min(1.0, Math.sqrt(sum / samples));
    }

    private static void ascii(byte[] out, int at, String tag) {
        for (int i = 0; i < 4; i++) out[at + i] = (byte) tag.charAt(i);
    }

    private static void int16(byte[] out, int at, int value) {
        out[at] = (byte) value;
        out[at + 1] = (byte) (value >> 8);
    }

    private static void int32(byte[] out, int at, int value) {
        out[at] = (byte) value;
        out[at + 1] = (byte) (value >> 8);
        out[at + 2] = (byte) (value >> 16);
        out[at + 3] = (byte) (value >> 24);
    }
}
