package club.a_dobe.alma;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class SpeechClipboardKeyTest {
    @Test
    public void trimsOneKey() {
        assertEquals("sk-test-0000abcd", SpeechClipboardKey.from("  sk-test-0000abcd\n"));
    }

    @Test
    public void refusesWhatIsNotOneKey() {
        assertNull(SpeechClipboardKey.from(null));
        assertNull(SpeechClipboardKey.from(""));
        assertNull(SpeechClipboardKey.from("short"));
        assertNull(SpeechClipboardKey.from("two words here"));
        assertNull(SpeechClipboardKey.from("line-one-key\nline-two-key"));
        assertNull(SpeechClipboardKey.from("https://example.com/v1"));
        assertNull(SpeechClipboardKey.from("密钥密钥密钥密钥"));
        assertNull(SpeechClipboardKey.from(new String(new char[SpeechClipboardKey.MAX_LENGTH + 1]).replace('\0', 'a')));
    }
}
