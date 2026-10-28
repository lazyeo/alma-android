package club.a_dobe.alma;

import android.content.Context;
import android.util.Log;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Locale;
import java.util.concurrent.Executor;

/**
 * Best-effort fold posture feed from Android's device_state service.
 *
 * The callback is not present in the public compile SDK on every Android
 * release, so this stays reflection-only. On Galaxy Z Fold devices it can
 * report TENT before the public 0/90/180 hinge sensor reaches its first stop.
 * If hidden-API enforcement or the OEM service blocks it, the plugin continues
 * with WindowManager posture and TYPE_HINGE_ANGLE.
 */
final class FoldDeviceStateFeed {
    interface Listener {
        void onPosture(FoldTransitionModel.Posture posture, String stateName);
    }

    private final Context context;
    private final Executor executor;
    private final Listener listener;
    private Object manager;
    private Object callback;
    private Class<?> callbackClass;

    FoldDeviceStateFeed(Context context, Executor executor, Listener listener) {
        this.context = context;
        this.executor = executor;
        this.listener = listener;
    }

    boolean start() {
        if (callback != null) return true;
        try {
            Object service = context.getSystemService("device_state");
            if (service == null) return false;
            Class<?> type = Class.forName(
                "android.hardware.devicestate.DeviceStateManager$DeviceStateCallback");
            Object proxy = Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] { type },
                (ignored, method, args) -> {
                    String methodName = method.getName();
                    if (("onDeviceStateChanged".equals(methodName)
                        || "onStateChanged".equals(methodName))
                        && args != null && args.length > 0) deliver(args[0]);
                    if ("hashCode".equals(methodName)) return System.identityHashCode(this);
                    if ("equals".equals(methodName)) return args != null && args.length > 0
                        && proxyEquals(args[0]);
                    if ("toString".equals(methodName)) return "AlmaFoldDeviceStateCallback";
                    return null;
                });
            Method register = service.getClass().getMethod(
                "registerCallback", Executor.class, type);
            register.invoke(service, executor, proxy);
            manager = service;
            callback = proxy;
            callbackClass = type;
            return true;
        } catch (ReflectiveOperationException | RuntimeException error) {
            Log.w(FoldTransitionPlugin.TAG, "DEVICE_STATE unavailable: " + error);
            manager = null;
            callback = null;
            callbackClass = null;
            return false;
        }
    }

    void stop() {
        Object service = manager;
        Object registered = callback;
        Class<?> type = callbackClass;
        manager = null;
        callback = null;
        callbackClass = null;
        if (service == null || registered == null || type == null) return;
        try {
            service.getClass().getMethod("unregisterCallback", type).invoke(service, registered);
        } catch (ReflectiveOperationException | RuntimeException ignored) {}
    }

    private boolean proxyEquals(Object other) {
        return callback != null && callback == other;
    }

    private void deliver(Object state) {
        String name = stateName(state);
        FoldTransitionModel.Posture posture = postureForName(name);
        if (posture != FoldTransitionModel.Posture.UNKNOWN)
            listener.onPosture(posture, name);
    }

    private static String stateName(Object state) {
        if (state instanceof Integer) {
            switch ((Integer) state) {
                case 0: return "CLOSED";
                case 1: return "TENT";
                case 2: return "HALF_OPENED";
                case 3: return "OPENED";
                default: return "#" + state;
            }
        }
        try {
            Object name = state.getClass().getMethod("getName").invoke(state);
            return name instanceof String ? (String) name : "";
        } catch (ReflectiveOperationException | RuntimeException ignored) {
            return "";
        }
    }

    static FoldTransitionModel.Posture postureForName(String name) {
        String normalized = name == null ? "" : name.toUpperCase(Locale.US);
        if (normalized.contains("CONCURRENT") || normalized.contains("REAR"))
            return FoldTransitionModel.Posture.UNKNOWN;
        if (normalized.contains("HALF")) return FoldTransitionModel.Posture.HALF_OPENED;
        if (normalized.contains("TENT")) return FoldTransitionModel.Posture.TENT;
        if (normalized.contains("CLOSE")
            || normalized.contains("FOLDED") && !normalized.contains("UNFOLDED"))
            return FoldTransitionModel.Posture.CLOSED;
        if (normalized.contains("OPEN") || normalized.contains("UNFOLDED"))
            return FoldTransitionModel.Posture.FLAT;
        return FoldTransitionModel.Posture.UNKNOWN;
    }
}
