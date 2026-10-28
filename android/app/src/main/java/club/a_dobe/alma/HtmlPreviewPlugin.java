package club.a_dobe.alma;

import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.security.SecureRandom;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONException;

@CapacitorPlugin(name = "HtmlPreview")
public class HtmlPreviewPlugin extends Plugin {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();
    private final Map<String, PendingRequest> pending = new ConcurrentHashMap<>();

    static final class Session {
        final String token;
        final String ownerKey;
        final String rootPath;
        final HtmlPreviewServer.SessionCache cache = new HtmlPreviewServer.SessionCache(HtmlPreviewServer.CACHE_BYTES);

        Session(String token, String ownerKey, String rootPath) {
            this.token = token;
            this.ownerKey = ownerKey;
            this.rootPath = rootPath;
        }
    }

    static final class PendingRequest {
        final String token;
        final Object monitor = new Object();
        volatile Result result;

        PendingRequest(String token) {
            this.token = token;
        }
    }

    static final class Result {
        final int status;
        final String mimeType;
        final byte[] bytes;

        Result(int status, String mimeType, byte[] bytes) {
            this.status = status;
            this.mimeType = mimeType;
            this.bytes = bytes;
        }
    }

    @PluginMethod
    public void openSession(PluginCall call) {
        String rootPath = call.getString("rootPath");
        if (rootPath == null || rootPath.isBlank() || !(rootPath.startsWith("/") || rootPath.matches("^[A-Za-z]:[\\\\/].*"))) {
            call.reject("Invalid preview root");
            return;
        }
        String token = randomHex(16);
        String ownerKey = randomHex(16);
        sessions.put(token, new Session(token, ownerKey, rootPath));
        JSObject result = new JSObject();
        result.put("token", token);
        result.put("ownerKey", ownerKey);
        call.resolve(result);
    }

    @PluginMethod
    public void closeSession(PluginCall call) {
        String token = call.getString("token");
        String ownerKey = call.getString("ownerKey");
        Session session = token == null ? null : sessions.get(token);
        if (session == null || ownerKey == null || !constantEquals(session.ownerKey, ownerKey)) {
            call.reject("Unknown preview session");
            return;
        }
        sessions.remove(token, session);
        pending.entrySet().removeIf(entry -> entry.getValue().token.equals(token));
        call.resolve();
    }

    @PluginMethod
    public void respond(PluginCall call) {
        String requestId = call.getString("requestId");
        PendingRequest request = requestId == null ? null : pending.get(requestId);
        if (request == null) {
            call.reject("Unknown preview request");
            return;
        }
        String ownerKey = call.getString("ownerKey");
        Session session = sessions.get(request.token);
        if (session == null || ownerKey == null || !constantEquals(session.ownerKey, ownerKey)) {
            call.reject("Preview response did not come from the app session");
            return;
        }
        int status = call.getInt("status", 502);
        String mimeType = call.getString("mimeType", "application/octet-stream");
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            JSArray chunks = call.getArray("base64Chunks", new JSArray());
            for (int index = 0; index < chunks.length(); index++) {
                byte[] chunk = Base64.decode(chunks.getString(index), Base64.DEFAULT);
                if ((long) bytes.size() + chunk.length > 50L * 1024L * 1024L) {
                    call.reject("Preview response is too large", "FILE_TOO_LARGE");
                    return;
                }
                bytes.write(chunk, 0, chunk.length);
            }
            complete(request, new Result(status, mimeType, bytes.toByteArray()));
            call.resolve();
        } catch (JSONException error) {
            call.reject("Invalid preview response", error);
        }
    }

    Session session(String token) {
        return sessions.get(token);
    }

    Result request(Session session, String path) throws InterruptedException {
        HtmlPreviewServer.CachedResponse cached = session.cache.get(path);
        if (cached != null) return new Result(200, cached.mimeType, cached.bytes);
        String requestId = randomHex(16);
        PendingRequest request = new PendingRequest(session.token);
        pending.put(requestId, request);
        JSObject event = new JSObject();
        event.put("requestId", requestId);
        event.put("token", session.token);
        event.put("path", path);
        notifyListeners("request", event);
        synchronized (request.monitor) {
            if (request.result == null) request.monitor.wait(HtmlPreviewServer.TIMEOUT_MS);
        }
        pending.remove(requestId);
        Result result = request.result;
        if (result == null) return new Result(504, "text/plain", new byte[0]);
        if (result.status >= 200 && result.status < 300)
            session.cache.put(path, result.bytes, result.mimeType);
        return result;
    }

    private static void complete(PendingRequest request, Result result) {
        synchronized (request.monitor) {
            if (request.result != null) return;
            request.result = result;
            request.monitor.notifyAll();
        }
    }

    private static String randomHex(int bytes) {
        byte[] value = new byte[bytes];
        RANDOM.nextBytes(value);
        StringBuilder out = new StringBuilder(bytes * 2);
        for (byte b : value) out.append(String.format("%02x", b & 0xff));
        return out.toString();
    }

    private static boolean constantEquals(String left, String right) {
        if (left.length() != right.length()) return false;
        int diff = 0;
        for (int index = 0; index < left.length(); index++) diff |= left.charAt(index) ^ right.charAt(index);
        return diff == 0;
    }
}
