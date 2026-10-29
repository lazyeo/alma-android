package club.a_dobe.alma;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

public class BackgroundConnectionService extends Service {
    static final String ACTION_START = "club.a_dobe.alma.background.START";
    static final String ACTION_STOP = "club.a_dobe.alma.background.STOP";
    static final String ACTION_UPDATE = "club.a_dobe.alma.background.UPDATE";
    static final String EXTRA_STATUS = "status";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_CHANNEL_NAME = "channelName";
    static final String EXTRA_CHANNEL_DESCRIPTION = "channelDescription";
    static final String EXTRA_STOP = "stop";
    private static final String CHANNEL_ID = "alma-background-connection";
    private static final int NOTIFICATION_ID = 0x41A3;

    private String status = "";
    private String title = "Alma Mobile";
    private String channelName = "Background connection";
    private String channelDescription = "Keeps the desktop connection active";
    private String stopLabel = "Stop";
    private PowerManager.WakeLock wakeLock;

    static boolean isRunning(Context context) {
        return context.getSharedPreferences("background-connection", MODE_PRIVATE)
            .getBoolean("running", false);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        setRunning(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopService(true);
            BackgroundConnectionPlugin.notifyStopped();
            return START_NOT_STICKY;
        }
        readLabels(intent);
        createChannel();
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // remoteMessaging fits Alma's user-enabled, ongoing text/task stream
            // between this device and a paired desktop. specialUse is only for
            // cases with no matching type, while dataSync is capped at six
            // background hours per day on Android 15 and later.
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        acquireWakeLock();
        setRunning(true);
        return START_STICKY;
    }

    private void readLabels(Intent intent) {
        if (intent == null) return;
        status = value(intent, EXTRA_STATUS, status);
        title = value(intent, EXTRA_TITLE, title);
        channelName = value(intent, EXTRA_CHANNEL_NAME, channelName);
        channelDescription = value(intent, EXTRA_CHANNEL_DESCRIPTION, channelDescription);
        stopLabel = value(intent, EXTRA_STOP, stopLabel);
    }

    private String value(Intent intent, String key, String fallback) {
        String value = intent.getStringExtra(key);
        return value == null || value.isEmpty() ? fallback : value;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            channelName,
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription(channelDescription);
        channel.setShowBadge(false);
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent open = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            0,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Intent stop = new Intent(this, BackgroundConnectionService.class).setAction(ACTION_STOP);
        PendingIntent stopIntent = PendingIntent.getService(
            this,
            1,
            stop,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_alma)
            .setContentTitle(title)
            .setContentText(status)
            .setContentIntent(contentIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(0, stopLabel, stopIntent)
            .build();
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        // The WebSocket reconnect backoff uses JavaScript timers. A foreground
        // service keeps the process important but does not keep the CPU awake
        // after screen-off, so a partial wake lock is required for the explicit
        // user-enabled promise that the live connection survives screen-off.
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Alma:BackgroundConnection");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
    }

    private void stopService(boolean removeNotification) {
        releaseWakeLock();
        setRunning(false);
        ServiceCompat.stopForeground(
            this,
            removeNotification ? ServiceCompat.STOP_FOREGROUND_REMOVE : ServiceCompat.STOP_FOREGROUND_DETACH
        );
        stopSelf();
    }

    private void setRunning(boolean running) {
        getSharedPreferences("background-connection", MODE_PRIVATE)
            .edit()
            .putBoolean("running", running)
            .apply();
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        setRunning(false);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
