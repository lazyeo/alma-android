package club.a_dobe.alma;

import android.content.Intent;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.PluginHandle;
import java.io.ByteArrayInputStream;
import java.util.LinkedHashMap;
import java.util.Map;

public class AlmaWebViewClient extends BridgeWebViewClient {
    private final Bridge bridge;
    private final MainActivity activity;

    public AlmaWebViewClient(Bridge bridge, MainActivity activity) {
        super(bridge);
        this.bridge = bridge;
        this.activity = activity;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        HtmlPreviewServer.PreviewUrl preview = HtmlPreviewServer.parse(request.getUrl());
        if (preview == null) return super.shouldInterceptRequest(view, request);
        if (preview.path == null) return response(403, "text/plain", new byte[0]);
        PluginHandle handle = bridge.getPlugin("HtmlPreview");
        if (handle == null || !(handle.getInstance() instanceof HtmlPreviewPlugin plugin))
            return response(503, "text/plain", new byte[0]);
        HtmlPreviewPlugin.Session session = plugin.session(preview.token);
        if (session == null) return response(403, "text/plain", new byte[0]);
        try {
            HtmlPreviewPlugin.Result result = plugin.request(session, preview.path);
            return response(result.status, HtmlPreviewServer.mimeType(preview.path, result.mimeType), result.bytes);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            return response(504, "text/plain", new byte[0]);
        }
    }

    private static WebResourceResponse response(int status, String mimeType, byte[] bytes) {
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Content-Security-Policy", "default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors https://localhost");
        headers.put("X-Content-Type-Options", "nosniff");
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse(
            mimeType,
            mimeType.startsWith("text/") || mimeType.contains("javascript") || mimeType.contains("json") ? "UTF-8" : null,
            status,
            reason(status),
            headers,
            new ByteArrayInputStream(bytes)
        );
    }

    private static String reason(int status) {
        return switch (status) {
            case 200 -> "OK";
            case 403 -> "Forbidden";
            case 404 -> "Not Found";
            case 413 -> "Payload Too Large";
            case 504 -> "Gateway Timeout";
            default -> "Bad Gateway";
        };
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        if (!request.isForMainFrame()) return super.shouldOverrideUrlLoading(view, request);
        Uri url = request.getUrl();
        String scheme = url.getScheme();
        String host = url.getHost();
        String path = url.getPath() == null ? "" : url.getPath();
        if (("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) && "localhost".equalsIgnoreCase(host)) {
            if (isDesktopFilePath(path)) {
                activity.emitFileLink(Uri.decode(path));
                return true;
            }
            return false;
        }
        if ("file".equalsIgnoreCase(scheme) && isDesktopFilePath(path)) {
            activity.emitFileLink(Uri.decode(path));
            return true;
        }
        if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
            activity.startActivity(new Intent(Intent.ACTION_VIEW, url));
            return true;
        }
        return super.shouldOverrideUrlLoading(view, request);
    }

    static boolean isDesktopFilePath(String path) {
        return path.matches("/[U]sers/.*") ||
            path.startsWith("/tmp/") ||
            path.startsWith("/private/") ||
            path.startsWith("/home/") ||
            path.startsWith("/Volumes/") ||
            path.startsWith("/opt/") ||
            path.startsWith("/etc/") ||
            path.startsWith("/var/") ||
            path.startsWith("/usr/") ||
            path.startsWith("/srv/") ||
            path.startsWith("/mnt/") ||
            path.startsWith("/media/") ||
            path.startsWith("/root/") ||
            path.matches("/[A-Za-z]:/.*");
    }
}
