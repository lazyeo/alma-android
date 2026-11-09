package club.a_dobe.alma;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SpeechHostRulesTest {
    private static final String OPENAI = "https://api.openai.com/v1";
    private static final String SONIOX = "wss://stt-rt.soniox.com/transcribe-websocket";

    @Test
    public void sameHostPassesWhatever() {
        assertTrue(SpeechHostRules.allowed(OPENAI, "https://api.openai.com/v1/audio/transcriptions"));
        assertTrue(SpeechHostRules.allowed(OPENAI, "https://api.openai.com/other/path"));
        assertTrue(SpeechHostRules.allowed(OPENAI, "https://api.openai.com:443/v1/audio/transcriptions"));
    }

    @Test
    public void differentHostFails() {
        assertFalse(SpeechHostRules.allowed(OPENAI, "https://api.groq.com/openai/v1/audio/transcriptions"));
        assertFalse(SpeechHostRules.allowed(OPENAI, "https://openai.com/v1/audio/transcriptions"));
        assertFalse(SpeechHostRules.allowed(OPENAI, "https://api.openai.com.evil.example/v1"));
    }

    @Test
    public void plainHttpToPublicHostFails() {
        assertFalse(SpeechHostRules.bindable("http://api.openai.com/v1"));
        assertFalse(SpeechHostRules.allowed("http://api.openai.com/v1", "http://api.openai.com/v1/audio/transcriptions"));
        assertFalse(SpeechHostRules.allowed(OPENAI, "http://api.openai.com/v1/audio/transcriptions"));
        assertFalse(SpeechHostRules.bindable("ws://stt-rt.soniox.com/transcribe-websocket"));
    }

    @Test
    public void plainHttpIsRefusedEvenOnTheLan() {
        // Cleartext is blocked app-wide by network_security_config.xml.
        assertFalse(SpeechHostRules.bindable("http://192.168.1.20:8000/v1"));
        assertFalse(SpeechHostRules.bindable("http://localhost:9000/v1"));
        assertFalse(SpeechHostRules.bindable("ws://desk.local/v1"));
    }

    @Test
    public void userinfoAndQueryTricksFail() {
        assertFalse(SpeechHostRules.allowed(OPENAI, "https://api.openai.com@evil.example/v1/audio/transcriptions"));
        assertFalse(SpeechHostRules.allowed(OPENAI, "https://user:pass@api.openai.com/v1/audio/transcriptions"));
        assertFalse(SpeechHostRules.bindable("https://api.openai.com@evil.example/v1"));
        assertFalse(SpeechHostRules.allowed(OPENAI, "https://evil.example/?https://api.openai.com/v1"));
        assertFalse(SpeechHostRules.allowed(OPENAI, "https://api.openai.com/v1#frag"));
        assertFalse(SpeechHostRules.allowed(OPENAI, "?https://api.openai.com/v1"));
        assertFalse(SpeechHostRules.allowed(OPENAI, "/v1/audio/transcriptions"));
        assertFalse(SpeechHostRules.allowed(OPENAI, "https:///v1"));
        assertFalse(SpeechHostRules.allowed(OPENAI, null));
        assertFalse(SpeechHostRules.allowed(null, OPENAI));
        assertFalse(SpeechHostRules.bindable(""));
        assertFalse(SpeechHostRules.bindable("ftp://api.openai.com/v1"));
    }

    @Test
    public void portMismatchFails() {
        assertFalse(SpeechHostRules.allowed(OPENAI, "https://api.openai.com:8443/v1/audio/transcriptions"));
        assertFalse(SpeechHostRules.allowed("https://192.168.1.20:8000/v1", "https://192.168.1.20/v1/audio/transcriptions"));
    }

    @Test
    public void schemeMustMatchBound() {
        assertFalse(SpeechHostRules.allowed("https://stt-rt.soniox.com", SONIOX));
        assertFalse(SpeechHostRules.allowed(SONIOX, "https://stt-rt.soniox.com/transcribe-websocket"));
        assertFalse(SpeechHostRules.allowed("https://192.168.1.20/v1", "wss://192.168.1.20/v1"));
    }

    @Test
    public void sonioxSocketBoundToItselfPasses() {
        assertTrue(SpeechHostRules.bindable(SONIOX));
        assertTrue(SpeechHostRules.allowed(SONIOX, SONIOX));
    }

    @Test
    public void hostComparisonIgnoresCase() {
        assertTrue(SpeechHostRules.allowed(OPENAI, "https://API.OpenAI.com/v1/audio/transcriptions"));
        assertTrue(SpeechHostRules.allowed("HTTPS://Api.OpenAI.COM/v1", "https://api.openai.com/v1/audio/transcriptions"));
    }
}
