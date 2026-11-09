package club.a_dobe.alma;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import org.junit.Test;

public class SpeechConfigFrameTest {
    @Test
    public void prependsKeyToConfigObject() {
        assertEquals(
            "{\"api_key\":\"test-key\",\"model\":\"stt-rt-v6\",\"sample_rate\":16000}",
            SpeechConfigFrame.withApiKey("{\"model\":\"stt-rt-v6\",\"sample_rate\":16000}", "test-key")
        );
    }

    @Test
    public void toleratesWhitespace() {
        assertEquals(
            "{\"api_key\":\"k\",\"model\":\"m\"}",
            SpeechConfigFrame.withApiKey("  {  \"model\":\"m\"}\n", "k")
        );
    }

    @Test
    public void handlesEmptyObject() {
        assertEquals("{\"api_key\":\"k\"}", SpeechConfigFrame.withApiKey("{}", "k"));
        assertEquals("{\"api_key\":\"k\"}", SpeechConfigFrame.withApiKey(" { } ", "k"));
    }

    @Test
    public void escapesKey() {
        assertEquals(
            "{\"api_key\":\"a\\\"b\\\\c\\u000ad\\u0001\"}",
            SpeechConfigFrame.withApiKey("{}", "a\"b\\c\nd\u0001")
        );
        assertEquals("\"中/\"", SpeechConfigFrame.quote("中/"));
    }

    @Test
    public void rejectsNonObjects() {
        rejects("[]");
        rejects("\"text\"");
        rejects("");
        rejects("{\"model\":1");
        rejects(null);
    }

    private static void rejects(String config) {
        try {
            SpeechConfigFrame.withApiKey(config, "k");
            fail("expected rejection: " + config);
        } catch (IllegalArgumentException expected) {
            // non-object config never reaches the socket
        }
    }
}
