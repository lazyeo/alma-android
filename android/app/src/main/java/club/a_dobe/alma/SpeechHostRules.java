package club.a_dobe.alma;

import java.net.URI;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Decides where a saved speech key may be sent. A key is bound to the
 * scheme, host and port it was saved for, so a WebView that asks native to
 * call some other URL can never make native attach the key to it.
 */
final class SpeechHostRules {
    private SpeechHostRules() {}

    /** True when a key may be saved for this URL at all. */
    static boolean bindable(String url) {
        return parse(url) != null;
    }

    /** The one key shared by two endpoints: Soniox real-time and Soniox async. */
    static final String SHARED_SONIOX_KEY_ID = "soniox";
    /** The only pair a shared key may be bound to, fixed here rather than trusted from JS. */
    private static final Set<String> SHARED_SONIOX_ORIGINS =
        new HashSet<>(Arrays.asList("wss://stt-rt.soniox.com:443", "https://api.soniox.com:443"));

    /**
     * True when a key saved under {@code keyId} may be bound to all of
     * {@code urls}: one bindable URL, or for the shared Soniox key exactly
     * its two fixed origins. No other key may span several hosts.
     */
    static boolean bindable(String keyId, List<String> urls) {
        if (urls == null || urls.isEmpty()) return false;
        if (urls.size() == 1) return bindable(urls.get(0));
        if (!SHARED_SONIOX_KEY_ID.equals(keyId) || urls.size() != SHARED_SONIOX_ORIGINS.size()) return false;
        Set<String> origins = new HashSet<>();
        for (String url : urls) {
            Target target = parse(url);
            if (target == null) return false;
            origins.add(target.origin());
        }
        return origins.equals(SHARED_SONIOX_ORIGINS);
    }

    /** True when any of the bound URLs admits {@code requestUrl}. */
    static boolean allowedAny(List<String> boundUrls, String requestUrl) {
        if (boundUrls == null) return false;
        for (String bound : boundUrls) if (allowed(bound, requestUrl)) return true;
        return false;
    }

    /** True when a key bound to {@code boundUrl} may be sent to {@code requestUrl}. */
    static boolean allowed(String boundUrl, String requestUrl) {
        Target bound = parse(boundUrl);
        Target request = parse(requestUrl);
        if (bound == null || request == null) return false;
        // Exact scheme: an https-bound key must not leak over ws, and a key
        // saved for a batch endpoint is not silently reused for streaming.
        return bound.scheme.equals(request.scheme)
            && bound.host.equals(request.host)
            && bound.port == request.port;
    }

    private static final class Target {
        final String scheme;
        final String host;
        final int port;

        Target(String scheme, String host, int port) {
            this.scheme = scheme;
            this.host = host;
            this.port = port;
        }

        String origin() {
            return scheme + "://" + host + ":" + port;
        }
    }

    /** Parses a URL a key may travel to, or null when it must be refused. */
    private static Target parse(String value) {
        if (value == null) return null;
        URI uri;
        try {
            uri = new URI(value.trim());
        } catch (Exception error) {
            return null;
        }
        String rawScheme = uri.getScheme();
        if (rawScheme == null || !uri.isAbsolute() || uri.isOpaque()) return null;
        // userinfo is how "https://api.example.com@evil.example" smuggles a
        // trusted-looking name in front of the real host.
        if (uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null) return null;
        String host = uri.getHost();
        if (host == null || host.isEmpty()) return null;
        host = host.toLowerCase(Locale.ROOT);
        String scheme = rawScheme.toLowerCase(Locale.ROOT);
        int defaultPort;
        switch (scheme) {
            case "https":
            case "wss":
                defaultPort = 443;
                break;
            // No plain http/ws, not even on the LAN: the app's network
            // security config forbids cleartext, so such a key could be
            // saved but never used.
            default:
                return null;
        }
        int port = uri.getPort() == -1 ? defaultPort : uri.getPort();
        if (port < 1 || port > 65535) return null;
        return new Target(scheme, host, port);
    }
}
