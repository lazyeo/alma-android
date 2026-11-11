package club.a_dobe.alma;

/**
 * Decides whether clipboard text is plausibly one API key. Pasting goes
 * through native so the key never enters the WebView; this keeps a copied
 * sentence, URL or multi-line note from being saved as a key.
 */
final class SpeechClipboardKey {
    private SpeechClipboardKey() {}

    /** Shorter than any provider's key format; also hides last4 below 8. */
    static final int MIN_LENGTH = 8;
    static final int MAX_LENGTH = 512;

    /** The trimmed key, or null when the text is not a single key. */
    static String from(CharSequence clip) {
        if (clip == null) return null;
        String key = clip.toString().trim();
        if (key.length() < MIN_LENGTH || key.length() > MAX_LENGTH) return null;
        for (int i = 0; i < key.length(); i++) {
            char c = key.charAt(i);
            // Keys are printable ASCII without spaces.
            if (c <= ' ' || c > '~') return null;
        }
        if (key.contains("://")) return null;
        return key;
    }
}
