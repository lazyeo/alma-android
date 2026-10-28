package club.a_dobe.alma;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class HtmlPreviewServerTest {
    @Test
    public void normalizesOnlySafeOriginRelativePaths() {
        assertEquals("", HtmlPreviewServer.normalizePath("/"));
        assertEquals("css/site.css", HtmlPreviewServer.normalizePath("/./css//site.css"));
        assertEquals("img/My Photo.png", HtmlPreviewServer.normalizePath("/img/My%20Photo.png"));
        for (String path : new String[] {
            "relative.html", "/../secret", "/%2e%2e/secret", "/a%2f..%2fb",
            "/a\\..\\b", "/a%5c..%5cb", "/C:/Windows/win.ini",
            "/%252e%252e/secret", "/bad%zz", "/a%00.html"
        }) assertNull(path, HtmlPreviewServer.normalizePath(path));
    }

    @Test
    public void usesExtensionBeforeDeclaredMime() {
        assertEquals("text/html", HtmlPreviewServer.mimeType("index.html", "text/plain"));
        assertEquals("text/javascript", HtmlPreviewServer.mimeType("app.js", "text/plain"));
        assertEquals("image/x-custom", HtmlPreviewServer.mimeType("blob.custom", "image/x-custom; charset=binary"));
        assertEquals("application/octet-stream", HtmlPreviewServer.mimeType("blob.unknown", "not a mime"));
    }

    @Test
    public void cacheIsPerSessionLruAndCappedByTotalBytes() {
        HtmlPreviewServer.SessionCache cache = new HtmlPreviewServer.SessionCache(6);
        cache.put("a", bytes("aaa"), "text/plain");
        cache.put("b", bytes("bbb"), "text/plain");
        assertArrayEquals(bytes("aaa"), cache.get("a").bytes);
        cache.put("c", bytes("ccc"), "text/plain");
        assertTrue(cache.contains("a"));
        assertFalse(cache.contains("b"));
        assertTrue(cache.contains("c"));
        assertEquals(6, cache.sizeBytes());
        cache.put("huge", bytes("1234567"), "text/plain");
        assertFalse(cache.contains("huge"));
    }

    private static byte[] bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }
}
