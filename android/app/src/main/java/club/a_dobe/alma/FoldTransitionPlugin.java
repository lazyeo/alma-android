package club.a_dobe.alma;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Point;
import android.graphics.Rect;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import android.view.Choreographer;
import android.view.Display;
import android.view.Surface;
import android.view.View;
import android.view.ViewGroup;
import androidx.annotation.RequiresApi;
import androidx.core.util.Consumer;
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter;
import androidx.window.layout.FoldingFeature;
import androidx.window.layout.WindowInfoTracker;
import androidx.window.layout.WindowLayoutInfo;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;
import java.util.concurrent.Executor;

/**
 * Blurs the WebView while a foldable swaps displays.
 *
 * Inputs: TYPE_HINGE_ANGLE (API 30+, SENSOR_DELAY_GAME) for angle/velocity,
 * and display/layout/configuration callbacks for the swap itself (see
 * {@link FoldTransitionModel.SwapDetector}: a large decor resize backed by
 * hinge motion or a display size change). Output: an AGSL RenderEffect
 * (API 33+) driven by a Choreographer callback that is posted only while the
 * hinge moves or a transition is visible. Everything runs on the main thread
 * and only while the activity is in the foreground.
 */
@CapacitorPlugin(name = "FoldTransition")
public class FoldTransitionPlugin extends Plugin implements SensorEventListener {
    static final String TAG = "AlmaFold";
    /** Long/short side ratio under which a display counts as the inner one. */
    private static final float INNER_MAX_ASPECT = 1.6f;
    /** A cleared effect is still on screen until the next frame has drawn. */

    private final FoldTransitionModel.Tuning tuning = new FoldTransitionModel.Tuning();
    private final FoldTransitionModel model = new FoldTransitionModel(tuning);
    private final FoldTransitionModel.SwapDetector swapDetector = new FoldTransitionModel.SwapDetector();
    private final Point maxWindow = new Point();
    private final Handler main = new Handler(Looper.getMainLooper());

    private SensorManager sensorManager;
    private Sensor hingeSensor;
    private DisplayManager displayManager;
    private DisplayManager.DisplayListener displayListener;
    private View.OnLayoutChangeListener layoutListener;
    private WindowInfoTrackerCallbackAdapter windowInfoTracker;
    private Consumer<WindowLayoutInfo> windowLayoutListener;
    private final Executor mainExecutor = command -> main.post(command);
    private FoldDeviceStateFeed deviceStateFeed;
    private FoldHingeLogFeed hingeLogFeed;
    private String angleSource = "estimated";
    private final Runnable angleStaleCheck = () -> updateAngleSource("reading timeout");
    private boolean listening;
    private boolean foreground;

    private float rawAngle = Float.NaN;
    private float windowMaxAngle = Float.NaN;
    private long lastLogMs;

    private boolean frameLoopPosted;
    private boolean effectApplied;
    private View effectTarget;
    private Object shaderEffect;
    /** Set once when the AGSL fails to compile; unlike tuning.enabled, configure never clears it. */
    private boolean shaderFailed;
    /** Last frame activity written to the log, so each transition logs its start and end once. */
    private boolean tracedActive;
    private final Object geometry = Build.VERSION.SDK_INT >= 33 ? new FoldShaderEffect.Geometry() : null;
    private boolean movingSideLeft = true;


    private long previewStartMs = -1;
    private boolean previewOpening;
    private int previewStep;

    private final Choreographer.FrameCallback frameCallback = new Choreographer.FrameCallback() {
        @Override
        public void doFrame(long frameTimeNanos) {
            frameLoopPosted = false;
            if (Build.VERSION.SDK_INT >= 33) renderFrame(SystemClock.uptimeMillis());
        }
    };

    @Override
    public void load() {
        super.load();
        sensorManager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null && Build.VERSION.SDK_INT >= 30)
            hingeSensor = sensorManager.getDefaultSensor(Sensor.TYPE_HINGE_ANGLE);
        tuning.sensorResolutionDegrees = hingeSensor == null ? 0f : hingeSensor.getResolution();
        windowInfoTracker = new WindowInfoTrackerCallbackAdapter(
            WindowInfoTracker.getOrCreate(getContext()));
        windowLayoutListener = this::onWindowLayoutInfo;
        deviceStateFeed = new FoldDeviceStateFeed(getContext(), mainExecutor,
            (posture, name) -> onPosture(posture, "DEVICE_STATE " + name));
        hingeLogFeed = new FoldHingeLogFeed(getContext(), main,
            new FoldHingeLogFeed.Listener() {
                @Override public void onAngle(float angle) { onMeasuredAngle(angle); }
                @Override public void onStateChanged() {
                    model.setMeasuredFeedLive(hingeLogFeed != null && hingeLogFeed.isActive());
                    updateAngleSource("feed state");
                }
            });
        displayManager = (DisplayManager) getContext().getSystemService(Context.DISPLAY_SERVICE);
        displayListener = new DisplayManager.DisplayListener() {
            @Override public void onDisplayAdded(int displayId) {}
            @Override public void onDisplayRemoved(int displayId) {}
            @Override public void onDisplayChanged(int displayId) {
                // The decor may relayout after this; checking now and after the
                // next layout pass covers both orders.
                checkSwap();
                decorView().post(FoldTransitionPlugin.this::checkSwap);
            }
        };
        layoutListener = (view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            if (right - left != oldRight - oldLeft || bottom - top != oldBottom - oldTop) checkSwap();
        };
        main.post(() -> {
            if (MainActivity.isAppForeground()) onForeground();
        });
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        onForeground();
    }

    @Override
    protected void handleOnPause() {
        onBackground();
        super.handleOnPause();
    }

    @Override
    protected void handleOnDestroy() {
        onBackground();
        if (hingeLogFeed != null) hingeLogFeed.destroy();
        super.handleOnDestroy();
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        decorView().post(this::checkSwap);
    }

    @PluginMethod
    public void configure(PluginCall call) {
        FoldTransitionModel.Tuning t = tuning;
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", t.enabled));
        boolean logging = Boolean.TRUE.equals(call.getBoolean("logging", t.logging));
        String movingSide = call.getString("movingSide", movingSideLeft ? "left" : "right");
        float strength = clamp(floatOf(call, "strength", t.strength), 0.1f, 1f);
        float activation = clamp(floatOf(call, "activationAngle", t.activationAngle), 90f, 175f);
        float angleSmoothing = clamp(floatOf(call, "angleSmoothing", t.angleSmoothing), 0.01f, 1f);
        float velocitySmoothing = clamp(floatOf(call, "velocitySmoothing", t.velocitySmoothing), 0.01f, 1f);
        float rampInMs = clamp(floatOf(call, "rampInMs", t.rampInMs), 40f, 1000f);
        float openingClearMs = clamp(floatOf(call, "openingClearMs", t.openingClearMs), 40f, 2000f);
        float halfOpenHoldMs = clamp(floatOf(call, "halfOpenHoldMs", t.halfOpenHoldMs), 100f, 5000f);
        float halfOpenClearMs = clamp(floatOf(call, "halfOpenClearMs", t.halfOpenClearMs), 40f, 2000f);
        float blurSpread = clamp(floatOf(call, "blurSpread", t.blurSpread), 0.01f, 0.5f);
        float darkening = clamp(floatOf(call, "darkening", t.darkening), 0f, 0.05f);
        float eyeDistanceMm = clamp(floatOf(call, "eyeDistanceMm", t.eyeDistanceMm), 100f, 1200f);
        float openingDecay = clamp(floatOf(call, "openingDecay", t.openingDecay), 0.5f, 12f);
        float closingClearMs = clamp(floatOf(call, "closingClearMs", t.closingClearMs), 40f, 2000f);
        float idleClearMs = clamp(floatOf(call, "idleClearMs", t.idleClearMs), 100f, 5000f);
        float motionVelocity = clamp(floatOf(call, "motionVelocity", t.motionVelocity), 1f, 500f);
        long logIntervalMs = (long) clamp(floatOf(call, "logIntervalMs", t.logIntervalMs), 16f, 5000f);
        long previewMs = (long) clamp(floatOf(call, "previewMs", t.previewMs), 1000f, 10000f);
        main.post(() -> {
            t.enabled = enabled;
            t.logging = logging;
            movingSideLeft = !"right".equals(movingSide);
            t.strength = strength;
            t.activationAngle = activation;
            t.angleSmoothing = angleSmoothing;
            t.velocitySmoothing = velocitySmoothing;
            t.rampInMs = adjustedDuration(rampInMs);
            t.openingClearMs = adjustedDuration(openingClearMs);
            t.halfOpenHoldMs = halfOpenHoldMs;
            t.halfOpenClearMs = adjustedDuration(halfOpenClearMs);
            t.blurSpread = blurSpread;
            t.darkening = darkening;
            t.eyeDistanceMm = eyeDistanceMm;
            t.openingDecay = openingDecay;
            t.closingClearMs = adjustedDuration(closingClearMs);
            t.idleClearMs = idleClearMs;
            t.motionVelocity = motionVelocity;
            t.logIntervalMs = logIntervalMs;
            t.previewMs = previewMs;
            if (logging) Log.i(TAG, String.format(Locale.US,
                "CONFIG enabled=%b strength=%.2f activation=%.0f hinge=%b shader=%b t=%d",
                enabled, strength, activation, hingeSensor != null,
                Build.VERSION.SDK_INT >= 33 && !shaderFailed, SystemClock.uptimeMillis()));
            if (!enabled && previewStartMs < 0) clearEffect();
            if (foreground) {
                updateListening();
                warmUpShader();
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void getAngleSource(PluginCall call) {
        main.post(() -> call.resolve(angleSourceResult()));
    }

    @PluginMethod
    public void requestShizukuPermission(PluginCall call) {
        main.post(() -> {
            if (hingeLogFeed != null) hingeLogFeed.requestPermission();
            call.resolve(angleSourceResult());
        });
    }

    private JSObject angleSourceResult() {
        long now = SystemClock.uptimeMillis();
        boolean measured = model.usesMeasuredAngle(now);
        JSObject result = new JSObject();
        result.put("source", measured ? "shizuku" : "estimated");
        result.put("shizukuRunning", hingeLogFeed != null && hingeLogFeed.isRunning());
        result.put("permission", hingeLogFeed == null ? "unavailable" : hingeLogFeed.permission());
        return result;
    }

    /** Plays a synthetic close → swap → open sequence so tuning is visible on any device. */
    @PluginMethod
    public void preview(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) {
            call.unavailable("The fold transition preview needs Android 13 or later.");
            return;
        }
        main.post(() -> {
            if (shaderFailed) {
                call.unavailable("The fold transition shader is unavailable on this device.");
                return;
            }
            if (!foreground) {
                call.reject("The fold transition preview needs the app in the foreground.");
                return;
            }
            String direction = call.getString("direction", "open");
            if (!"open".equals(direction) && !"close".equals(direction)) {
                call.reject("Preview direction must be open or close.");
                return;
            }
            model.reset();
            previewOpening = "open".equals(direction);
            previewStartMs = SystemClock.uptimeMillis();
            previewStep = -1;
            if (tuning.logging) Log.i(TAG, "PREVIEW " + direction + " start t=" + previewStartMs);
            ensureFrameLoop();
            JSObject result = new JSObject();
            result.put("durationMs", tuning.previewMs);
            call.resolve(result);
        });
    }

    // ── lifecycle ──────────────────────────────────────────────────────────

    private void onForeground() {
        foreground = true;
        updateListening();
        // After the resume work, so compiling never delays the first frame.
        main.post(this::warmUpShader);
    }

    /** Nothing runs in the background: no sensors, no frame callback, no effect. */
    private void onBackground() {
        foreground = false;
        stopListening();
        if (frameLoopPosted) {
            Choreographer.getInstance().removeFrameCallback(frameCallback);
            frameLoopPosted = false;
        }
        previewStartMs = -1;
        model.reset();
        updateAngleSource("background");
        clearEffect();
    }

    /** Sensors run while the effect or its logging is wanted, and only in the foreground. */
    private void updateListening() {
        boolean effectWanted = tuning.enabled && !shaderFailed;
        if (foreground && (effectWanted || tuning.logging)) startListening();
        else stopListening();
    }

    private void startListening() {
        if (listening) return;
        listening = true;
        model.reset();
        if (hingeSensor != null)
            sensorManager.registerListener(this, hingeSensor, SensorManager.SENSOR_DELAY_GAME, main);
        if (displayManager != null) displayManager.registerDisplayListener(displayListener, main);
        View decor = decorView();
        decor.addOnLayoutChangeListener(layoutListener);
        if (windowInfoTracker != null)
            windowInfoTracker.addWindowLayoutInfoListener(getActivity(), mainExecutor, windowLayoutListener);
        boolean deviceStateActive = deviceStateFeed != null && deviceStateFeed.start();
        if (hingeLogFeed != null) hingeLogFeed.start(tuning.enabled);
        if (tuning.logging) Log.i(TAG, "DEVICE_STATE active=" + deviceStateActive
            + " resolution=" + tuning.sensorResolutionDegrees);
        readMaxWindow();
        swapDetector.reset(decor.getWidth(), decor.getHeight(), maxWindow.x, maxWindow.y);
    }

    private void stopListening() {
        if (!listening) return;
        listening = false;
        if (hingeSensor != null) sensorManager.unregisterListener(this);
        if (displayManager != null) displayManager.unregisterDisplayListener(displayListener);
        if (windowInfoTracker != null) windowInfoTracker.removeWindowLayoutInfoListener(windowLayoutListener);
        if (deviceStateFeed != null) deviceStateFeed.stop();
        if (hingeLogFeed != null) hingeLogFeed.stop();
        main.removeCallbacks(angleStaleCheck);
        updateAngleSource("listening stopped");
        decorView().removeOnLayoutChangeListener(layoutListener);
    }

    // ── inputs ─────────────────────────────────────────────────────────────

    @Override
    public void onSensorChanged(SensorEvent event) {
        long now = SystemClock.uptimeMillis();
        rawAngle = event.values[0];
        windowMaxAngle = Float.isNaN(windowMaxAngle) ? rawAngle : Math.max(windowMaxAngle, rawAngle);
        boolean moving = previewStartMs < 0 && model.observe(rawAngle, now);
        if (!model.usesContinuousAngle()) {
            FoldTransitionModel.Posture posture = rawAngle >= 170f
                ? FoldTransitionModel.Posture.FLAT
                : rawAngle >= 45f && rawAngle <= 135f
                    ? FoldTransitionModel.Posture.HALF_OPENED
                    : FoldTransitionModel.Posture.UNKNOWN;
            if (posture != FoldTransitionModel.Posture.UNKNOWN)
                onPosture(posture, "HINGE_STOP", true);
        }
        if (tuning.logging && now - lastLogMs >= tuning.logIntervalMs) {
            lastLogMs = now;
            View decor = decorView();
            Log.i(TAG, String.format(Locale.US, "angle=%.1f max=%.1f raw=%.1f v=%.1f size=%dx%d t=%d",
                model.angle(), windowMaxAngle, rawAngle, model.velocity(),
                decor.getWidth(), decor.getHeight(), now));
            windowMaxAngle = Float.NaN;
        }
        if (moving && tuning.enabled && !shaderFailed) ensureFrameLoop();
    }

    private void onMeasuredAngle(float angle) {
        if (!listening || previewStartMs >= 0) return;
        long now = SystemClock.uptimeMillis();
        model.setMeasuredFeedLive(hingeLogFeed != null && hingeLogFeed.isActive());
        boolean moving = model.measured(angle, now);
        updateAngleSource("reading");
        main.removeCallbacks(angleStaleCheck);
        main.postDelayed(angleStaleCheck, FoldAngleSource.STALE_MS + 1L);
        if (tuning.logging && now - lastLogMs >= tuning.logIntervalMs) {
            lastLogMs = now;
            Log.i(TAG, String.format(Locale.US,
                "angle=%.1f raw=%.1f v=%.1f src=shizuku t=%d",
                model.estimatedAngle(now), angle, model.velocity(), now));
        }
        if (moving && tuning.enabled && !shaderFailed) ensureFrameLoop();
    }

    private void updateAngleSource(String reason) {
        long now = SystemClock.uptimeMillis();
        String next = model.usesMeasuredAngle(now) ? "shizuku" : "estimated";
        if (next.equals(angleSource)) return;
        angleSource = next;
        if (tuning.logging) Log.i(TAG, "ANGLE_SOURCE " + next + " reason=" + reason);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    private void onWindowLayoutInfo(WindowLayoutInfo info) {
        FoldingFeature feature = null;
        for (androidx.window.layout.DisplayFeature displayFeature : info.getDisplayFeatures()) {
            if (displayFeature instanceof FoldingFeature) {
                feature = (FoldingFeature) displayFeature;
                break;
            }
        }
        if (feature == null) return;
        FoldTransitionModel.Posture posture = feature.getState() == FoldingFeature.State.FLAT
            ? FoldTransitionModel.Posture.FLAT : FoldTransitionModel.Posture.HALF_OPENED;
        onPosture(posture, "WINDOW_LAYOUT");
    }

    private void onPosture(FoldTransitionModel.Posture posture, String source) {
        onPosture(posture, source, false);
    }

    private void onPosture(FoldTransitionModel.Posture posture, String source, boolean hingeStop) {
        long now = SystemClock.uptimeMillis();
        model.posture(posture, isInnerDisplay(), hingeStop, now);
        if (tuning.logging) Log.i(TAG, source + " posture=" + posture + " inner=" + isInnerDisplay()
            + " stepped=" + !model.usesContinuousAngle() + " t=" + now);
        if (tuning.enabled && !shaderFailed) ensureFrameLoop();
    }

    private boolean isInnerDisplay() {
        View decor = decorView();
        float longSide = Math.max(decor.getWidth(), decor.getHeight());
        float shortSide = Math.max(1, Math.min(decor.getWidth(), decor.getHeight()));
        return longSide / shortSide < INNER_MAX_ASPECT;
    }

    private void checkSwap() {
        // Display, layout and configuration callbacks post this, so it can
        // run after the activity paused; nothing may start in the background.
        if (!listening) return;
        View decor = decorView();
        int width = decor.getWidth();
        int height = decor.getHeight();
        long now = SystemClock.uptimeMillis();
        readMaxWindow();
        FoldTransitionModel.SwapDetector.Kind kind = swapDetector.update(
            width, height, maxWindow.x, maxWindow.y, now, model.lastMotionMs());
        if (kind == FoldTransitionModel.SwapDetector.Kind.NONE) return;
        int fromWidth = swapDetector.fromWidth();
        int fromHeight = swapDetector.fromHeight();
        boolean swap = kind == FoldTransitionModel.SwapDetector.Kind.SWAP;
        float angle = Float.isNaN(model.angle()) ? rawAngle : model.angle();
        if (tuning.logging) Log.i(TAG, String.format(Locale.US,
            "%s from=%dx%d to=%dx%d max=%dx%d angle=%.1f t=%d", swap ? "SWAP" : "RESIZE",
            fromWidth, fromHeight, width, height, maxWindow.x, maxWindow.y, angle, now));
        if (!swap || !tuning.enabled || shaderFailed || previewStartMs >= 0) return;
        model.swap(now, Float.isNaN(angle) ? 0f : angle,
            Long.compare((long) width * height, (long) fromWidth * fromHeight));
        ensureFrameLoop();
    }

    /** Maximum window bounds: the display size, unaffected by split-screen or freeform. */
    @SuppressWarnings("deprecation")
    private void readMaxWindow() {
        if (Build.VERSION.SDK_INT >= 30) {
            Rect bounds = getActivity().getWindowManager().getMaximumWindowMetrics().getBounds();
            maxWindow.set(bounds.width(), bounds.height());
        } else {
            getActivity().getWindowManager().getDefaultDisplay().getRealSize(maxWindow);
        }
    }

    // ── frame loop ─────────────────────────────────────────────────────────

    private void ensureFrameLoop() {
        if (frameLoopPosted || !foreground || Build.VERSION.SDK_INT < 33) return;
        frameLoopPosted = true;
        Choreographer.getInstance().postFrameCallback(frameCallback);
    }

    @RequiresApi(33)
    private void renderFrame(long now) {
        // A frame callback queued before pausing must not draw in the background.
        if (!foreground) return;
        float angle = previewStartMs >= 0 ? previewAngle(now) : model.estimatedAngle(now);
        updateAngleSource("reading stale");
        boolean previewing = previewStartMs >= 0;
        if (!previewing && (!tuning.enabled || shaderFailed)) {
            clearEffect();
            return;
        }
        FoldTransitionModel.Frame frame = model.frame(now, angle);
        if (tuning.logging && frame.active != tracedActive) {
            tracedActive = frame.active;
            View target = effectTarget();
            Log.i(TAG, String.format(Locale.US,
                "FRAME active=%b strength=%.2f angle=%.1f src=%s inner=%b target=%s t=%d",
                frame.active, frame.strength, frame.angle, angleSource, isInnerDisplay(),
                target == null ? "null" : target.getWidth() + "x" + target.getHeight(), now));
        }
        if (frame.active) applyEffect(frame);
        else clearEffect();
        if (frame.active || previewing) ensureFrameLoop();
    }

    /** Compiles the AGSL ahead of the first transition, never during one. */
    private void warmUpShader() {
        if (Build.VERSION.SDK_INT < 33 || !foreground || !tuning.enabled) return;
        if (effectApplied || previewStartMs >= 0 || model.inTransition()) return;
        prepareShader();
    }

    /** Compiles the AGSL once; false for the rest of the process if the device rejects it. */
    @RequiresApi(33)
    private boolean prepareShader() {
        if (shaderEffect != null) return true;
        if (shaderFailed) return false;
        try {
            shaderEffect = new FoldShaderEffect();
            return true;
        } catch (RuntimeException error) {
            // A shader compile failure must not take the WebView down; the
            // effect stays off for this process whatever configure sends.
            Log.e(TAG, "AGSL shader unavailable", error);
            shaderFailed = true;
            clearEffect();
            updateListening();
            return false;
        }
    }

    @RequiresApi(33)
    private void applyEffect(FoldTransitionModel.Frame frame) {
        View target = effectTarget();
        if (target == null || !prepareShader()) {
            Log.w(TAG, "apply skipped target=" + target + " shaderFailed=" + shaderFailed);
            return;
        }
        FoldShaderEffect.Geometry g = (FoldShaderEffect.Geometry) geometry;
        updateGeometry(g, target);
        float pxPerMm = getContext().getResources().getDisplayMetrics().xdpi / 25.4f;
        if (!Float.isFinite(pxPerMm) || pxPerMm <= 0f) pxPerMm = 6f;
        float materialStrength = frame.strength * tuning.strength;
        float tilt = g.inner
            ? FoldTransitionModel.innerTiltForHinge(frame.angle, materialStrength)
            : FoldTransitionModel.coverTiltForHinge(frame.angle, materialStrength);
        ((FoldShaderEffect) shaderEffect).apply(target, g, tilt, pxPerMm,
            tuning.blurSpread, tuning.darkening, tuning.eyeDistanceMm);
        effectApplied = true;
    }

    /**
     * Inner display: hinge on the centre line, parallel to the long side
     * (Galaxy Z Fold). Cover display: hinge on the left edge in natural
     * orientation, rotated with the display.
     */
    @RequiresApi(33)
    private void updateGeometry(FoldShaderEffect.Geometry g, View target) {
        int width = target.getWidth();
        int height = target.getHeight();
        float longSide = Math.max(width, height);
        float shortSide = Math.max(1, Math.min(width, height));
        g.inner = longSide / shortSide < INNER_MAX_ASPECT;
        if (g.inner) {
            g.axis = height >= width ? 0f : 1f;
            g.hinge = 0.5f;
            g.eye = 0.5f;
            g.movingSign = movingSideLeft ? -1f : 1f;
        } else {
            switch (displayRotation()) {
                case Surface.ROTATION_90: g.axis = 1f; g.hinge = 1f; break;
                case Surface.ROTATION_180: g.axis = 0f; g.hinge = 1f; break;
                case Surface.ROTATION_270: g.axis = 1f; g.hinge = 0f; break;
                default: g.axis = 0f; g.hinge = 0f;
            }
            g.eye = 0.5f;
            g.movingSign = g.hinge < 0.5f ? 1f : -1f;
        }
    }

    private int displayRotation() {
        Display display = Build.VERSION.SDK_INT >= 30
            ? getActivity().getDisplay()
            : getActivity().getWindowManager().getDefaultDisplay();
        return display == null ? Surface.ROTATION_0 : display.getRotation();
    }

    private void clearEffect() {
        if (!effectApplied) return;
        effectApplied = false;
        if (Build.VERSION.SDK_INT >= 33 && effectTarget != null) FoldShaderEffect.clear(effectTarget);
    }

    /** The WebView's parent renders it into a layer, which RenderEffect needs. */
    private View effectTarget() {
        if (effectTarget != null) return effectTarget;
        View webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView == null) return null;
        effectTarget = webView.getParent() instanceof ViewGroup ? (View) webView.getParent() : webView;
        return effectTarget;
    }

    // ── preview ────────────────────────────────────────────────────────────

    /**
     * Synthetic Fold7 event traces used by Settings previews. They enter the
     * exact same stepped-posture estimator path as real DEVICE_STATE,
     * HINGE_STOP and SWAP callbacks instead of drawing a linear fake angle.
     */
    private float previewAngle(long now) {
        long elapsed = now - previewStartMs;
        if (elapsed >= tuning.previewMs) {
            previewStartMs = -1;
            model.reset();
            if (tuning.logging) Log.i(TAG, "PREVIEW end t=" + now);
            return Float.NaN;
        }
        float scale = tuning.previewMs / 3000f;
        long tent = 0;
        long ninety = (long) ((previewOpening ? 600 : 350) * scale);
        long half = (long) ((previewOpening ? 1350 : 100) * scale);
        long swap = (long) ((previewOpening ? 1450 : 650) * scale);
        long terminal = (long) ((previewOpening ? 1800 : 500) * scale);
        if (previewStep < 0) {
            previewStep = 0;
            model.posture(previewOpening ? FoldTransitionModel.Posture.TENT
                : FoldTransitionModel.Posture.FLAT, !previewOpening, false, now);
        }
        if (previewOpening) {
            if (previewStep == 0 && elapsed >= ninety) {
                previewStep = 1;
                model.posture(FoldTransitionModel.Posture.HALF_OPENED, false, true, now);
            }
            if (previewStep == 1 && elapsed >= half) {
                previewStep = 2;
                model.posture(FoldTransitionModel.Posture.HALF_OPENED, false, false, now);
            }
            if (previewStep == 2 && elapsed >= swap) {
                previewStep = 3;
                model.swap(now, model.estimatedAngle(now), 1);
            }
            if (previewStep == 3 && elapsed >= terminal) {
                previewStep = 4;
                model.posture(FoldTransitionModel.Posture.FLAT, true, false, now);
            }
        } else {
            if (previewStep == 0 && elapsed >= half) {
                previewStep = 1;
                model.posture(FoldTransitionModel.Posture.HALF_OPENED, true, false, now);
            }
            if (previewStep == 1 && elapsed >= ninety) {
                previewStep = 2;
                model.posture(FoldTransitionModel.Posture.HALF_OPENED, true, true, now);
            }
            if (previewStep == 2 && elapsed >= terminal) {
                previewStep = 3;
                model.posture(FoldTransitionModel.Posture.CLOSED, false, false, now);
            }
            if (previewStep == 3 && elapsed >= swap) {
                previewStep = 4;
                model.swap(now, model.estimatedAngle(now), -1);
            }
        }
        return model.estimatedAngle(now);
    }

    // ── helpers ────────────────────────────────────────────────────────────

    private View decorView() {
        return getActivity().getWindow().getDecorView();
    }

    private float adjustedDuration(float durationMs) {
        float scale = 1f;
        try {
            scale = Settings.Global.getFloat(getContext().getContentResolver(),
                Settings.Global.ANIMATOR_DURATION_SCALE, 1f);
        } catch (SecurityException ignored) {}
        // Reduced motion shortens functional feedback instead of removing it.
        return scale == 0f ? Math.max(40f, durationMs * 0.35f) : durationMs;
    }

    private static float floatOf(PluginCall call, String key, float fallback) {
        Double value = call.getDouble(key);
        return value == null || value.isNaN() || value.isInfinite() ? fallback : value.floatValue();
    }

    private static float clamp(float value, float min, float max) {
        return Math.min(max, Math.max(min, value));
    }
}
