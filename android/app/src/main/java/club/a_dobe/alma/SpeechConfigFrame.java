package club.a_dobe.alma;

/**
 * Adds the API key to the streaming config frame JS built. Text splicing
 * instead of org.json keeps it a pure JVM unit (Android's org.json is a stub
 * in local tests), and the key is only ever added here, inside native.
 */
final class SpeechConfigFrame {
    private static final char[] HEX = "0123456789abcdef".toCharArray();

    private SpeechConfigFrame() {}

    static String withApiKey(String configJson, String key) {
        if (configJson == null || key == null) throw new IllegalArgumentException("Missing config or key");
        String trimmed = configJson.trim();
        if (!trimmed.startsWith("{") || !trimmed.endsWith("}"))
            throw new IllegalArgumentException("Config must be a JSON object");
        String field = "\"api_key\":" + quote(key);
        String rest = trimmed.substring(1).trim();
        if (rest.equals("}")) return "{" + field + "}";
        return "{" + field + "," + rest;
    }

    static String quote(String value) {
        StringBuilder out = new StringBuilder(value.length() + 2);
        out.append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '"') out.append("\\\"");
            else if (c == '\\') out.append("\\\\");
            else if (c < 0x20) out.append("\\u00").append(HEX[c >> 4]).append(HEX[c & 0xf]);
            else out.append(c);
        }
        return out.append('"').toString();
    }
}
