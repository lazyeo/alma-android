package club.a_dobe.alma;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "LanWebSocket")
public class LanWebSocketPlugin extends Plugin {
    private final Map<String, LanWebSocketClient> clients = new ConcurrentHashMap<>();

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null) { call.reject("Missing URL"); return; }
        String id = UUID.randomUUID().toString();
        try {
            LanWebSocketClient client = new LanWebSocketClient(url, new LanWebSocketClient.Listener() {
                public void onOpen() { emit("open", id, null, null); }
                public void onText(String value) { emit("message", id, "text", value); }
                public void onBinary(byte[] value) { emit("message", id, "binary", Base64.encodeToString(value, Base64.NO_WRAP)); }
                public void onClose(int code, String reason) { clients.remove(id); emitClose(id, code, reason); }
                public void onError(String message) { clients.remove(id); emit("error", id, null, message); }
            });
            clients.put(id, client);
            JSObject result = new JSObject(); result.put("id", id); call.resolve(result);
            client.connect();
        } catch (IllegalArgumentException error) { call.reject(error.getMessage()); }
    }

    @PluginMethod
    public void send(PluginCall call) {
        LanWebSocketClient client = clients.get(call.getString("id", ""));
        if (client == null) { call.reject("LAN socket is not open"); return; }
        try {
            String type = call.getString("type", "text");
            String data = call.getString("data", "");
            if ("binary".equals(type)) client.sendBinary(Base64.decode(data, Base64.DEFAULT));
            else client.sendText(data);
            call.resolve();
        } catch (Exception error) { call.reject(error.getMessage()); }
    }

    @PluginMethod
    public void close(PluginCall call) {
        LanWebSocketClient client = clients.remove(call.getString("id", ""));
        if (client != null) client.close(call.getInt("code", 1000), call.getString("reason", ""));
        call.resolve();
    }

    private void emit(String event, String id, String type, String data) {
        JSObject value = new JSObject(); value.put("id", id);
        if (type != null) value.put("type", type);
        if (data != null) value.put("data", data);
        notifyListeners(event, value, true);
    }

    private void emitClose(String id, int code, String reason) {
        JSObject value = new JSObject(); value.put("id", id); value.put("code", code); value.put("reason", reason);
        notifyListeners("close", value, true);
    }

    @Override
    protected void handleOnDestroy() {
        for (LanWebSocketClient client : clients.values()) client.close(1001, "App closed");
        clients.clear();
        super.handleOnDestroy();
    }
}
