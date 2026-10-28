package club.a_dobe.alma;

import android.content.ComponentName;
import android.content.Context;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.IBinder;
import android.os.ParcelFileDescriptor;
import android.util.Log;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import rikka.shizuku.Shizuku;

/** App-side lifecycle, permission, and reader for the shell hinge-log service. */
final class FoldHingeLogFeed {
    interface Listener {
        void onAngle(float angle);
        void onStateChanged();
    }

    private static final String TAG = "AlmaFold";
    private static final int REQUEST_CODE = 7312;
    private static final long RETRY_MIN_MS = 500L;
    private static final long RETRY_MAX_MS = 8_000L;

    private final Context context;
    private final Handler main;
    private final Listener listener;
    private final ExecutorService reader = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "alma-hinge-reader");
        thread.setDaemon(true);
        return thread;
    });
    private final Shizuku.UserServiceArgs serviceArgs;

    private volatile boolean started;
    private volatile boolean reading;
    private boolean binding;
    private boolean permissionRequested;
    private long retryMs = RETRY_MIN_MS;
    private IFoldHingeLogService service;
    private ParcelFileDescriptor descriptor;

    private final Runnable retry = () -> {
        if (started) connectIfReady();
    };

    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            binding = false;
            service = IFoldHingeLogService.Stub.asInterface(binder);
            retryMs = RETRY_MIN_MS;
            listener.onStateChanged();
            openReader();
        }

        @Override public void onServiceDisconnected(ComponentName name) {
            binding = false;
            service = null;
            closeReader();
            listener.onStateChanged();
            scheduleRetry("binder disconnected");
        }
    };

    private final Shizuku.OnBinderReceivedListener binderReceived = this::refresh;
    private final Shizuku.OnBinderDeadListener binderDead = () -> {
        service = null;
        binding = false;
        closeReader();
        refresh();
    };
    private final Shizuku.OnRequestPermissionResultListener permissionResult = (code, result) -> {
        if (code == REQUEST_CODE) refresh();
    };

    FoldHingeLogFeed(Context context, Handler main, Listener listener) {
        this.context = context.getApplicationContext();
        this.main = main;
        this.listener = listener;
        serviceArgs = new Shizuku.UserServiceArgs(
            new ComponentName(this.context, FoldHingeLogService.class))
            .daemon(false)
            .processNameSuffix("hinge")
            .debuggable(false)
            // Bumped when the service changes, so Shizuku replaces old processes.
            .version(2);
        try {
            Shizuku.addBinderReceivedListenerSticky(binderReceived);
            Shizuku.addBinderDeadListener(binderDead);
            Shizuku.addRequestPermissionResultListener(permissionResult);
        } catch (RuntimeException error) {
            Log.w(TAG, "Shizuku listeners unavailable", error);
        }
    }

    void start(boolean requestPermissionOnce) {
        started = true;
        if (requestPermissionOnce) requestPermissionOnce();
        connectIfReady();
        listener.onStateChanged();
    }

    void stop() {
        started = false;
        main.removeCallbacks(retry);
        closeReader();
        IFoldHingeLogService current = service;
        service = null;
        binding = false;
        if (current != null) {
            try { current.destroy(); } catch (Exception ignored) {}
        }
        try { Shizuku.unbindUserService(serviceArgs, connection, true); }
        catch (RuntimeException ignored) {}
        listener.onStateChanged();
    }

    void destroy() {
        stop();
        reader.shutdownNow();
        try {
            Shizuku.removeBinderReceivedListener(binderReceived);
            Shizuku.removeBinderDeadListener(binderDead);
            Shizuku.removeRequestPermissionResultListener(permissionResult);
        } catch (RuntimeException ignored) {}
    }

    void requestPermission() {
        permissionRequested = true;
        try {
            if (Shizuku.pingBinder()
                && Shizuku.checkSelfPermission() != PackageManager.PERMISSION_GRANTED)
                Shizuku.requestPermission(REQUEST_CODE);
        } catch (RuntimeException error) {
            Log.w(TAG, "Shizuku permission request failed", error);
        }
        listener.onStateChanged();
    }

    boolean isRunning() {
        try { return Shizuku.pingBinder() && !Shizuku.isPreV11(); }
        catch (RuntimeException ignored) { return false; }
    }

    boolean isActive() { return started && reading; }

    String permission() {
        if (!isRunning()) return "unavailable";
        try {
            if (Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED) return "granted";
            if (Shizuku.shouldShowRequestPermissionRationale()) return "denied";
            return permissionRequested ? "requested" : "not_requested";
        } catch (RuntimeException ignored) {
            return "unavailable";
        }
    }

    private void requestPermissionOnce() {
        if (permissionRequested || !isRunning() || "granted".equals(permission())) return;
        requestPermission();
    }

    private void refresh() {
        main.post(() -> {
            listener.onStateChanged();
            if (started) connectIfReady();
        });
    }

    private void connectIfReady() {
        if (!started || service != null || binding || !isRunning()
            || !"granted".equals(permission())) return;
        binding = true;
        try {
            Shizuku.bindUserService(serviceArgs, connection);
        } catch (RuntimeException error) {
            binding = false;
            scheduleRetry("bind failed");
        }
    }

    private void openReader() {
        IFoldHingeLogService current = service;
        if (!started || current == null || reading) return;
        reader.execute(() -> {
            try {
                descriptor = current.openHingeLog();
                reading = true;
                main.post(listener::onStateChanged);
                try (BufferedReader lines = new BufferedReader(new InputStreamReader(
                    new ParcelFileDescriptor.AutoCloseInputStream(descriptor)))) {
                    descriptor = null;
                    String line;
                    while (started && (line = lines.readLine()) != null) {
                        SamsungHingeLogParser.Sample sample = SamsungHingeLogParser.parse(line);
                        if (sample.isAngle()) {
                            float angle = sample.angleDegrees;
                            main.post(() -> {
                                if (started) listener.onAngle(angle);
                            });
                        }
                    }
                }
            } catch (Exception error) {
                if (started) Log.w(TAG, "hinge log reader stopped", error);
            } finally {
                reading = false;
                closeDescriptor();
                main.post(() -> {
                    listener.onStateChanged();
                    scheduleRetry("reader stopped");
                });
            }
        });
    }

    private void closeReader() {
        closeDescriptor();
        reading = false;
    }

    private synchronized void closeDescriptor() {
        ParcelFileDescriptor current = descriptor;
        descriptor = null;
        if (current != null) {
            try { current.close(); } catch (IOException ignored) {}
        }
    }

    private void scheduleRetry(String reason) {
        if (!started) return;
        main.removeCallbacks(retry);
        Log.w(TAG, "Shizuku retry in " + retryMs + "ms: " + reason);
        main.postDelayed(retry, retryMs);
        retryMs = Math.min(RETRY_MAX_MS, retryMs * 2L);
    }
}
