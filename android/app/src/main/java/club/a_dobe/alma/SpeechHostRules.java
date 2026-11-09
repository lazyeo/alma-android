package club.a_dobe.alma;

import java.net.URI;
import java.util.Locale;

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
