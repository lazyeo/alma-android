package club.a_dobe.alma;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BackgroundConnection")
public class BackgroundConnectionPlugin extends Plugin {
    private static BackgroundConnectionPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void start(PluginCall call) {
        Intent intent = serviceIntent(BackgroundConnectionService.ACTION_START, call);
        ContextCompat.startForegroundService(getContext(), intent);
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        if (BackgroundConnectionService.isRunning(getContext())) {
            getContext().startService(serviceIntent(BackgroundConnectionService.ACTION_UPDATE, call));
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), BackgroundConnectionService.class));
        getContext().getSharedPreferences("background-connection", android.content.Context.MODE_PRIVATE)
            .edit()
            .putBoolean("running", false)
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", BackgroundConnectionService.isRunning(getContext()));
        call.resolve(result);
    }

    private Intent serviceIntent(String action, PluginCall call) {
        return new Intent(getContext(), BackgroundConnectionService.class)
            .setAction(action)
            .putExtra(BackgroundConnectionService.EXTRA_STATUS, call.getString("status", ""))
            .putExtra(BackgroundConnectionService.EXTRA_TITLE, call.getString("title", ""))
            .putExtra(BackgroundConnectionService.EXTRA_CHANNEL_NAME, call.getString("channelName", ""))
            .putExtra(BackgroundConnectionService.EXTRA_CHANNEL_DESCRIPTION, call.getString("channelDescription", ""))
            .putExtra(BackgroundConnectionService.EXTRA_STOP, call.getString("stop", ""));
    }

    static void notifyStopped() {
        BackgroundConnectionPlugin plugin = instance;
        if (plugin != null) plugin.notifyListeners("stopped", new JSObject(), true);
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }
}
