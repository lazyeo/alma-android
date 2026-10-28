package club.a_dobe.alma;

import android.net.Uri;
import java.io.ByteArrayOutputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

final class HtmlPreviewServer {
    static final String HOST = "alma-preview.localhost";
    static final long CACHE_BYTES = 30L * 1024L * 1024L;
    static final long TIMEOUT_MS = 20_000L;

    private static final Map<String, String> MIME = Map.ofEntries(
        Map.entry("css", "text/css"), Map.entry("csv", "text/csv"),
        Map.entry("gif", "image/gif"), Map.entry("htm", "text/html"),
        Map.entry("html", "text/html"), Map.entry("ico", "image/x-icon"),
        Map.entry("jpeg", "image/jpeg"), Map.entry("jpg", "image/jpeg"),
        Map.entry("js", "text/javascript"), Map.entry("json", "application/json"),
        Map.entry("map", "application/json"), Map.entry("md", "text/markdown"),
        Map.entry("mjs", "text/javascript"), Map.entry("mp3", "audio/mpeg"),
        Map.entry("mp4", "video/mp4"), Map.entry("otf", "font/otf"),
        Map.entry("pdf", "application/pdf"), Map.entry("png", "image/png"),
        Map.entry("svg", "image/svg+xml"), Map.entry("ttf", "font/ttf"),
        Map.entry("txt", "text/plain"), Map.entry("wasm", "application/wasm"),
        Map.entry("wav", "audio/wav"), Map.entry("webm", "video/webm"),
        Map.entry("webp", "image/webp"), Map.entry("woff", "font/woff"),
        Map.entry("woff2", "font/woff2"), Map.entry("xml", "application/xml")
    );

    static final class PreviewUrl {
        final String token;
        final String path;

        PreviewUrl(String token, String path) {
            this.token = token;
            this.path = path;
        }
    }

    static PreviewUrl parse(Uri uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme()) || !HOST.equalsIgnoreCase(uri.getHost())) return null;
        String raw = uri.getEncodedPath();
        if (raw == null || !raw.startsWith("/")) return null;
        int next = raw.indexOf('/', 1);
        String token = next < 0 ? raw.substring(1) : raw.substring(1, next);
        if (!token.matches("[0-9a-f]{32}")) return null;
        String relativeRaw = next < 0 ? "/" : raw.substring(next);
        String path = normalizePath(relativeRaw);
        return path == null ? new PreviewUrl(token, null) : new PreviewUrl(token, path);
    }

    static String normalizePath(String rawPath) {
        if (rawPath == null || (!rawPath.isEmpty() && !rawPath.startsWith("/"))) return null;
        if (rawPath.isEmpty() || "/".equals(rawPath)) return "";
        if (hasControl(rawPath) || rawPath.indexOf('\\') >= 0) return null;
        final String decoded;
        try {
            decoded = URLDecoder.decode(rawPath.replace("+", "%2B"), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException error) {
            return null;
        }
        if (hasControl(decoded) || decoded.indexOf('\\') >= 0 || decoded.indexOf(':') >= 0 || decoded.indexOf('%') >= 0) return null;
        StringBuilder out = new StringBuilder();
        for (String segment : decoded.split("/")) {
            if (segment.isEmpty() || ".".equals(segment)) continue;
            if ("..".equals(segment)) return null;
            if (out.length() > 0) out.append('/');
            out.append(segment);
        }
        return out.toString();
    }

    private static boolean hasControl(String value) {
        for (int index = 0; index < value.length(); index++) {
            char c = value.charAt(index);
            if (c <= 0x1f || c == 0x7f) return true;
        }
        return false;
    }

    static String mimeType(String name, String declared) {
        int dot = name.lastIndexOf('.');
        String extension = dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
        String known = MIME.get(extension);
        if (known != null) return known;
        String type = declared == null ? "" : declared.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        return type.matches("[a-z]+/[a-z0-9.+-]+") ? type : "application/octet-stream";
    }

    static final class CachedResponse {
        final byte[] bytes;
        final String mimeType;

        CachedResponse(byte[] bytes, String mimeType) {
            this.bytes = bytes;
            this.mimeType = mimeType;
        }
    }

    static final class SessionCache {
        private final long limit;
        private long bytes;
        private final LinkedHashMap<String, CachedResponse> entries = new LinkedHashMap<>(16, 0.75f, true);

        SessionCache(long limit) {
            this.limit = limit;
        }

        synchronized CachedResponse get(String path) {
            return entries.get(path);
        }

        synchronized boolean contains(String path) {
            return entries.containsKey(path);
        }

        synchronized long sizeBytes() {
            return bytes;
        }

        synchronized void put(String path, byte[] body, String mimeType) {
            CachedResponse old = entries.remove(path);
            if (old != null) bytes -= old.bytes.length;
            if (body.length > limit) return;
            entries.put(path, new CachedResponse(body, mimeType));
            bytes += body.length;
            while (bytes > limit && !entries.isEmpty()) {
                Map.Entry<String, CachedResponse> eldest = entries.entrySet().iterator().next();
                bytes -= eldest.getValue().bytes.length;
                entries.remove(eldest.getKey());
            }
        }
    }

    private HtmlPreviewServer() {}
}
