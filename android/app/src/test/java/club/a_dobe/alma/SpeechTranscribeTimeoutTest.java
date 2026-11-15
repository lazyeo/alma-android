package club.a_dobe.alma;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class SpeechTranscribeTimeoutTest {
    @Test
    public void shortClipKeepsTheBaseBudget() {
        assertEquals(120, SpeechPlugin.transcribeTimeoutSeconds(0));
        // Two seconds of 16 kHz mono s16le.
        assertEquals(122, SpeechPlugin.transcribeTimeoutSeconds(64_000));
    }

    @Test
    public void recordingAtTheCapGetsTimeToUploadOnASlowLink() {
        // 9.6 MB at 32 KB/s is 300 s of upload, on top of the provider's 120 s.
        assertEquals(420, SpeechPlugin.transcribeTimeoutSeconds(SpeechRecorder.MAX_BYTES));
    }
}
