package club.a_dobe.alma;

/**
 * Hinge motion, swap detection and transition strength: the pure, Android-free
 * part of FoldTransitionPlugin, covered by FoldTransitionModelTest (JUnit).
 * src/foldTransition.ts is a simplified TypeScript reference of the same
 * strength formulas (unfiltered velocity, no swap detection); keep shared
 * formulas in step. All times are SystemClock.uptimeMillis().
 */
final class FoldTransitionModel {
    /** Below this the effect is invisible and the frame loop stops. */
    static final float ACTIVE_EPSILON = 0.02f;
    // exp(-4) < ACTIVE_EPSILON: a quarter of a "clear in N ms" budget as the
    // time constant reaches the epsilon right at N ms.
    private static final float CLEAR_TIME_CONSTANTS = 4f;

    static final class Tuning {
        boolean enabled = true;
        float strength = 0.7f;
        float activationAngle = 150f;
        boolean logging = false;
        float angleSmoothing = 0.22f;
        /** Sensor-reported resolution; below 10° uses continuous angle tracking. */
        float sensorResolutionDegrees;
        float rampInMs = 180f;
        float openingClearMs = 400f;
        float halfOpenHoldMs = 700f;
        float halfOpenClearMs = 200f;
        float blurSpread = 0.12f;
        float darkening = 0.015f;
        float eyeDistanceMm = 450f;
        float velocitySmoothing = 0.35f;
        float openingDecay = 4f;
        float closingClearMs = 250f;
        float idleClearMs = 600f;
        float motionVelocity = 15f;
        long logIntervalMs = 50;
        long previewMs = 3000;
    }

    enum Posture { UNKNOWN, CLOSED, TENT, HALF_OPENED, FLAT }

    private enum TimedPhase { NONE, RAMP_IN, HOLD_FULL, CLEAR_OPENING, CLEAR_CLOSING, CLEAR_IDLE }

    static final class Frame {
        boolean active;
        boolean opening;
        /** 0–1, before the user strength multiplier. */
        float strength;
        /** Pseudo-continuous hinge angle used by perspective and material shading. */
        float angle;
        /** Always 1: swapped content renders at its final layout immediately. */
        float aspectRecovery = 1f;
    }

    /** Opening on the cover display holds until the swap, ~2s after TENT on Fold7. */
    static final long OPENING_HOLD_MS = 3000;
    /** CLOSED precedes the swap to the cover by ~150ms. */
    static final long CLOSED_HOLD_MS = 400;
    /**
     * With real hinge readings the frost follows the angle and holds while the
     * hinge pauses; only a hinge left still this long fades (e.g. Flex mode).
     */
    static final long MEASURED_IDLE_HOLD_MS = 4000;
    private static final float MEASURED_RISE_SECONDS = 0.08f;
    private static final float MEASURED_FADE_SECONDS = 0.25f;

    private final Tuning tuning;
    private final FoldAngleEstimator angleEstimator = new FoldAngleEstimator();
    private final FoldAngleSource angleSource = new FoldAngleSource();
    private float angle = Float.NaN;
    private float velocity;
    private long sampleMs = -1;
    private long lastMotionMs = -1;
    private long lastClosingMs = -1;
    private long swapMs = -1;
    private float swapAngle;
    private boolean opening;
    private boolean continuousAngle;
    /** A real sub-10° hinge step was seen; the declared resolution alone is not trusted. */
    private boolean continuousObserved;
    private float previousRawAngle = Float.NaN;
    private Posture posture = Posture.UNKNOWN;
    private boolean postureFromHingeStop;
    private long postureMs = -1;
    private TimedPhase timedPhase = TimedPhase.NONE;
    private long timedPhaseMs = -1;
    private float timedPhaseStartStrength;
    private float lastStrength;
    private float measuredStrength;
    private long measuredStrengthMs = -1;
    private final Frame frame = new Frame();

    FoldTransitionModel(Tuning tuning) {
        this.tuning = tuning;
        continuousAngle = tuning.sensorResolutionDegrees <= 0f
            || tuning.sensorResolutionDegrees < 10f;
    }

    float angle() { return angle; }
    float estimatedAngle(long nowMs) {
        float estimated = continuousAngle ? angle : angleEstimator.angle(nowMs);
        return angleSource.angle(nowMs, estimated);
    }
    float velocity() { return continuousAngle ? velocity : angleEstimator.velocity(); }
    boolean usesMeasuredAngle(long nowMs) { return angleSource.isMeasuredActive(nowMs); }
    void setMeasuredFeedLive(boolean live) { angleSource.setFeedLive(live); }

    boolean measured(float measuredAngle, long nowMs) {
        float before = estimatedAngle(nowMs);
        angleSource.measured(measuredAngle, nowMs);
        // Keep the fallback anchored to the latest real keyframe. Posture
        // callbacks remain suppressed while the real feed is fresh.
        angleEstimator.reset(measuredAngle, nowMs);
        if (!Float.isNaN(angle)) {
            float seconds = sampleMs < 0 ? 0f : Math.max(0.001f, (nowMs - sampleMs) / 1000f);
            if (seconds > 0f) velocity = (measuredAngle - angle) / seconds;
        }
        angle = measuredAngle;
        sampleMs = nowMs;
        boolean moving = Float.isNaN(before)
            || Math.abs(measuredAngle - before) >= 0.5f
            || Math.abs(velocity) >= tuning.motionVelocity;
        if (moving) {
            lastMotionMs = nowMs;
            opening = velocity >= 0f;
            if (velocity < 0f) lastClosingMs = nowMs;
        }
        return moving;
    }
    long lastMotionMs() { return lastMotionMs; }
    boolean opening() { return opening; }
    boolean usesContinuousAngle() { return continuousAngle; }

    void reset() {
        angle = Float.NaN;
        angleEstimator.reset();
        angleSource.reset();
        velocity = 0;
        sampleMs = -1;
        lastMotionMs = -1;
        lastClosingMs = -1;
        swapMs = -1;
        previousRawAngle = Float.NaN;
        continuousObserved = false;
        posture = Posture.UNKNOWN;
        postureFromHingeStop = false;
        postureMs = -1;
        timedPhase = TimedPhase.NONE;
        timedPhaseMs = -1;
        lastStrength = 0f;
        measuredStrength = 0f;
        measuredStrengthMs = -1;
        continuousAngle = tuning.sensorResolutionDegrees <= 0f
            || tuning.sensorResolutionDegrees < 10f;
    }

    /** Low-pass filters a raw hinge reading; returns true while the hinge moves. */
    boolean observe(float rawAngle, long nowMs) {
        if (!Float.isNaN(previousRawAngle)) {
            float step = Math.abs(rawAngle - previousRawAngle);
            if (step > 0f && step < 10f) {
                continuousAngle = true;
                continuousObserved = true;
            }
        }
        previousRawAngle = rawAngle;
        if (Float.isNaN(angle) || sampleMs < 0) {
            angle = rawAngle;
            sampleMs = nowMs;
            velocity = 0;
            return false;
        }
        float seconds = Math.max(0.001f, (nowMs - sampleMs) / 1000f);
        float previous = angle;
        angle = previous + (rawAngle - previous) * tuning.angleSmoothing;
        sampleMs = nowMs;
        float rawVelocity = (angle - previous) / seconds;
        velocity += (rawVelocity - velocity) * tuning.velocitySmoothing;
        boolean moving = Math.abs(velocity) >= tuning.motionVelocity;
        if (moving) lastMotionMs = nowMs;
        if (moving) {
            opening = velocity > 0;
            if (velocity < 0) lastClosingMs = nowMs;
        }
        return moving;
    }

    /** Starts a timed transition for stepped public hinge sensors. */
    void posture(Posture next, boolean onInnerDisplay, long nowMs) {
        posture(next, onInnerDisplay, false, nowMs);
    }

    /** @param hingeStop true when this posture was inferred from TYPE_HINGE_ANGLE. */
    void posture(Posture next, boolean onInnerDisplay, boolean hingeStop, long nowMs) {
        if (continuousObserved) return;
        // A hinge may declare a fine resolution yet only report stops (Fold7:
        // 0/90/180), so a posture before any real small step means stepped.
        continuousAngle = false;
        boolean duplicate = next == posture;
        // HALF_OPENED arrives twice in the measured opening trace: first the
        // 90° sensor stop, then DEVICE_STATE. Consume that pair in either
        // order, but ignore duplicate callbacks from WindowLayout/device state.
        if (duplicate && hingeStop == postureFromHingeStop) return;
        if (!angleSource.isMeasuredActive(nowMs))
            updateEstimatedKeyframe(next, onInnerDisplay, hingeStop, nowMs);
        posture = next;
        postureFromHingeStop = hingeStop;
        postureMs = nowMs;
        boolean frosted = timedPhase == TimedPhase.RAMP_IN || timedPhase == TimedPhase.HOLD_FULL;
        if (next == Posture.TENT || next == Posture.HALF_OPENED) {
            opening = !onInnerDisplay;
            // TENT and the 90° stop arrive ~0.4s apart in one motion; the
            // second only extends the hold instead of restarting the ramp.
            if (!frosted) {
                timedPhase = TimedPhase.RAMP_IN;
                timedPhaseMs = nowMs;
                timedPhaseStartStrength = lastStrength;
            }
        } else if (next == Posture.FLAT) {
            opening = true;
            startTimedClear(TimedPhase.CLEAR_OPENING, nowMs,
                timedPhase == TimedPhase.HOLD_FULL ? 1f : lastStrength);
        } else if (next == Posture.CLOSED) {
            opening = false;
            swapMs = -1;
            // The swap to the cover follows within ~150ms, so the frost holds;
            // if it never comes (a hesitant open) it fades instead of cutting.
        }
    }

    private void updateEstimatedKeyframe(Posture next, boolean onInnerDisplay,
                                         boolean hingeStop, long nowMs) {
        if (Float.isNaN(angleEstimator.angle())) {
            float seed = onInnerDisplay ? FoldAngleEstimator.OPENED_DEGREES
                : FoldAngleEstimator.CLOSED_DEGREES;
            angleEstimator.reset(seed, nowMs);
        }
        if (next == Posture.TENT) {
            angleEstimator.keyframe(FoldAngleEstimator.TENT_DEGREES,
                FoldAngleEstimator.OPENING_NINETY_STOP_DEGREES, nowMs);
        } else if (next == Posture.HALF_OPENED && hingeStop) {
            angleEstimator.keyframe(onInnerDisplay
                    ? FoldAngleEstimator.CLOSING_NINETY_STOP_DEGREES
                    : FoldAngleEstimator.OPENING_NINETY_STOP_DEGREES,
                onInnerDisplay ? FoldAngleEstimator.CLOSED_EVENT_DEGREES
                    : FoldAngleEstimator.OPENING_HALF_OPENED_DEGREES, nowMs);
        } else if (next == Posture.HALF_OPENED) {
            angleEstimator.keyframe(onInnerDisplay
                    ? FoldAngleEstimator.CLOSING_HALF_OPENED_DEGREES
                    : FoldAngleEstimator.OPENING_HALF_OPENED_DEGREES,
                onInnerDisplay ? FoldAngleEstimator.CLOSING_NINETY_STOP_DEGREES
                    : FoldAngleEstimator.OPENED_DEGREES, nowMs);
        } else if (next == Posture.FLAT) {
            angleEstimator.keyframe(FoldAngleEstimator.OPENED_DEGREES, 180f, nowMs);
        } else if (next == Posture.CLOSED) {
            angleEstimator.keyframe(FoldAngleEstimator.CLOSED_EVENT_DEGREES,
                FoldAngleEstimator.CLOSED_DEGREES, nowMs);
        }
    }

    /**
     * Starts the post-swap settle. Direction comes from the display area
     * (the inner display is larger), falling back to hinge velocity.
     */
    void swap(long nowMs, float atAngle, int areaChange) {
        opening = areaChange != 0 ? areaChange > 0 : velocity >= 0;
        swapAngle = atAngle;
        swapMs = nowMs;
        if (!continuousAngle) {
            float estimated = angleEstimator.angle(nowMs);
            if (Float.isNaN(estimated)) angleEstimator.reset(atAngle, nowMs);
            if (opening) {
                timedPhase = TimedPhase.HOLD_FULL;
                timedPhaseMs = nowMs;
                timedPhaseStartStrength = 1f;
            } else {
                startTimedClear(TimedPhase.CLEAR_CLOSING, nowMs, 1f);
            }
        }
    }

    boolean inTransition() { return swapMs >= 0 || timedPhase != TimedPhase.NONE; }

    Frame frame(long nowMs, float atAngle) {
        frame.angle = angleSource.angle(nowMs,
            continuousAngle ? atAngle : angleEstimator.angle(nowMs));
        if (angleSource.isMeasuredActive(nowMs)) return measuredFrame(nowMs, frame.angle);
        if (!continuousAngle) return timedFrame(nowMs);
        if (swapMs < 0) return preSwap(nowMs, atAngle);
        long elapsed = Math.max(0, nowMs - swapMs);
        float strength = opening
            ? openingStrength(nowMs, atAngle)
            : decay(elapsed, tuning.closingClearMs / CLEAR_TIME_CONSTANTS);
        frame.active = strength >= ACTIVE_EPSILON;
        frame.opening = opening;
        frame.strength = frame.active ? strength : 0f;
        frame.aspectRecovery = 1f;
        if (!frame.active) swapMs = -1;
        return frame;
    }

    /**
     * Real hinge angle: tilt comes from the angle alone (clear at closed and
     * flat), so pausing holds the frost and reversing unwinds it along the
     * same curve. No posture timers here; those caused the snap to clear
     * when the hinge stopped or turned back.
     */
    private Frame measuredFrame(long nowMs, float atAngle) {
        long idle = lastMotionMs < 0 ? Long.MAX_VALUE : nowMs - lastMotionMs;
        boolean closedRest = posture == Posture.CLOSED && postureMs >= 0
            && nowMs - postureMs >= CLOSED_HOLD_MS;
        float target = idle >= MEASURED_IDLE_HOLD_MS || closedRest ? 0f : 1f;
        float dt = measuredStrengthMs < 0 ? 0f
            : Math.min(0.1f, Math.max(0f, (nowMs - measuredStrengthMs) / 1000f));
        measuredStrengthMs = nowMs;
        float tau = target > measuredStrength ? MEASURED_RISE_SECONDS : MEASURED_FADE_SECONDS;
        measuredStrength += (target - measuredStrength) * (1f - (float) Math.exp(-dt / tau));
        if (Math.abs(target - measuredStrength) < 0.002f) measuredStrength = target;
        boolean inRange = atAngle > CLOSED_HINGE_DEGREES && atAngle < FLAT_HINGE_DEGREES;
        frame.active = inRange && (measuredStrength >= ACTIVE_EPSILON || target > 0f);
        frame.opening = opening;
        frame.strength = measuredStrength >= ACTIVE_EPSILON ? measuredStrength : 0f;
        frame.aspectRecovery = 1f;
        lastStrength = frame.strength;
        return frame;
    }

    private Frame timedFrame(long nowMs) {
        float strength = 0f;
        long elapsed = Math.max(0, nowMs - timedPhaseMs);
        switch (timedPhase) {
            case RAMP_IN:
                strength = timedPhaseStartStrength
                    + (1f - timedPhaseStartStrength) * easeIn(elapsed / Math.max(1f, tuning.rampInMs));
                if (elapsed >= tuning.rampInMs) {
                    timedPhase = TimedPhase.HOLD_FULL;
                    timedPhaseMs = nowMs;
                    strength = 1f;
                }
                long postureElapsed = postureMs < 0 ? 0 : Math.max(0, nowMs - postureMs);
                if (postureElapsed >= idleHoldMs()) {
                    startTimedClear(TimedPhase.CLEAR_IDLE, postureMs + idleHoldMs(), strength);
                    strength = timedClear(nowMs - timedPhaseMs, tuning.halfOpenClearMs);
                }
                break;
            case HOLD_FULL:
                strength = 1f;
                if (posture != Posture.FLAT && posture != Posture.UNKNOWN && swapMs < 0
                    && postureMs >= 0 && nowMs - postureMs >= idleHoldMs()) {
                    startTimedClear(TimedPhase.CLEAR_IDLE, postureMs + idleHoldMs(), strength);
                    strength = timedClear(nowMs - timedPhaseMs, tuning.halfOpenClearMs);
                }
                break;
            case CLEAR_OPENING:
                strength = timedClear(elapsed, tuning.openingClearMs);
                break;
            case CLEAR_CLOSING:
                strength = timedClear(elapsed, tuning.closingClearMs);
                break;
            case CLEAR_IDLE:
                strength = timedClear(elapsed, tuning.halfOpenClearMs);
                break;
            default:
                break;
        }
        lastStrength = strength;
        // A ramp starts from zero; it stays active so the frame loop keeps
        // running until the strength has grown.
        frame.active = strength >= ACTIVE_EPSILON
            || timedPhase == TimedPhase.RAMP_IN || timedPhase == TimedPhase.HOLD_FULL;
        frame.opening = opening;
        frame.strength = strength >= ACTIVE_EPSILON ? strength : 0f;
        frame.aspectRecovery = 1f;
        if (!frame.active && (timedPhase == TimedPhase.CLEAR_OPENING
            || timedPhase == TimedPhase.CLEAR_CLOSING || timedPhase == TimedPhase.CLEAR_IDLE)) {
            timedPhase = TimedPhase.NONE;
            swapMs = -1;
        }
        return frame;
    }

    /**
     * Opening on the cover starts at TENT, about 2s before the display swap
     * on Fold7, so it holds through the stops instead of idling out.
     */
    private long idleHoldMs() {
        if (posture == Posture.CLOSED) return CLOSED_HOLD_MS;
        return opening
            ? Math.max((long) tuning.halfOpenHoldMs, OPENING_HOLD_MS)
            : (long) tuning.halfOpenHoldMs;
    }

    private void startTimedClear(TimedPhase phase, long nowMs, float strength) {
        timedPhase = phase;
        timedPhaseMs = nowMs;
        timedPhaseStartStrength = clamp01(strength);
    }

    private float timedClear(long elapsed, float duration) {
        float progress = clamp01(elapsed / Math.max(1f, duration));
        return timedPhaseStartStrength * (1f - easeOut(progress));
    }

    private static float easeIn(float progress) {
        float t = clamp01(progress);
        return t * t;
    }

    private static float easeOut(float progress) {
        float t = clamp01(progress);
        float inverse = 1f - t;
        return 1f - inverse * inverse * inverse;
    }

    private Frame preSwap(long nowMs, float atAngle) {
        long lastDirectionalMotion = opening ? lastMotionMs : lastClosingMs;
        float motion = lastDirectionalMotion < 0 ? 0f
            : decay(nowMs - lastDirectionalMotion, tuning.idleClearMs / CLEAR_TIME_CONSTANTS);
        float strength = angleProgress(atAngle, tuning.activationAngle) * motion;
        frame.active = strength >= ACTIVE_EPSILON;
        frame.opening = opening;
        frame.strength = frame.active ? strength : 0f;
        frame.aspectRecovery = 1f;
        return frame;
    }

    private float openingStrength(long nowMs, float atAngle) {
        if (atAngle >= tuning.activationAngle) return 0f;
        float span = Math.max(1f, tuning.activationAngle - swapAngle);
        float progress = clamp01((atAngle - swapAngle) / span);
        float byAngle = (float) Math.exp(-tuning.openingDecay * progress);
        // A hinge left half-open must not stay blurred.
        long since = lastMotionMs >= 0 ? lastMotionMs : swapMs;
        float byIdle = decay(nowMs - since - tuning.idleClearMs,
            tuning.closingClearMs / CLEAR_TIME_CONSTANTS);
        return byAngle * byIdle;
    }

    static final float MAX_TILT_DEGREES = 45f;
    static final float CLOSED_HINGE_DEGREES = 6f;
    static final float FLAT_HINGE_DEGREES = 172f;
    /** Fold7 fallback; duo-open learns this per device. */
    static final float FOLD7_SWAP_HINGE_DEGREES = 85f;

    static float innerTiltForHinge(float hingeDegrees, float strength) {
        if (Float.isNaN(hingeDegrees)) return 0f;
        float from = Math.min(FLAT_HINGE_DEGREES - 10f,
            Math.max(CLOSED_HINGE_DEGREES + 1f, FOLD7_SWAP_HINGE_DEGREES));
        float progress = clamp01((FLAT_HINGE_DEGREES - hingeDegrees)
            / (FLAT_HINGE_DEGREES - from));
        return MAX_TILT_DEGREES * progress * clamp01(strength);
    }

    static float coverTiltForHinge(float hingeDegrees, float strength) {
        if (Float.isNaN(hingeDegrees)) return 0f;
        float peakAt = Math.min(FLAT_HINGE_DEGREES - 10f,
            Math.max(CLOSED_HINGE_DEGREES + 1f, FOLD7_SWAP_HINGE_DEGREES));
        float progress = clamp01((hingeDegrees - CLOSED_HINGE_DEGREES)
            / (peakAt - CLOSED_HINGE_DEGREES));
        return MAX_TILT_DEGREES * progress * clamp01(strength);
    }

    /** 0 at or above the activation angle, 1 when fully closed. */
    static float angleProgress(float atAngle, float activationAngle) {
        if (Float.isNaN(atAngle)) return 0f;
        float threshold = Math.max(1f, activationAngle);
        return clamp01((threshold - atAngle) / threshold);
    }

    private static float decay(float elapsedMs, float timeConstantMs) {
        return (float) Math.exp(-Math.max(0f, elapsedMs) / Math.max(1f, timeConstantMs));
    }

    private static float clamp01(float value) {
        return Math.min(1f, Math.max(0f, value));
    }

    /**
     * Tells a display swap from other large window resizes. A swap changes
     * the window area by more than {@link #AREA_RATIO} (rotations keep it)
     * and must coincide with real fold evidence: recent hinge motion, or a
     * change of the maximum window bounds (the display itself). Split-screen
     * and freeform resizes change only the window, so they never count. On a
     * Fold7 both panels are display 0; its maximum bounds still change size.
     */
    static final class SwapDetector {
        enum Kind { NONE, RESIZE, SWAP }

        /** Rotations keep the area; a display swap on a Fold roughly doubles it. */
        static final float AREA_RATIO = 1.15f;
        /** How long hinge motion or a display change counts as evidence for a resize. */
        static final long EVIDENCE_MS = 1000;

        private int width;
        private int height;
        private int maxWidth;
        private int maxHeight;
        private long displayChangeMs = -1;
        private int fromWidth;
        private int fromHeight;

        /** Starts from the current window and display size without reporting anything. */
        void reset(int width, int height, int maxWidth, int maxHeight) {
            this.width = width;
            this.height = height;
            this.maxWidth = maxWidth;
            this.maxHeight = maxHeight;
            displayChangeMs = -1;
        }

        /**
         * Feeds the current window (decor) and maximum window size. Returns
         * NONE when the window keeps its size, RESIZE for a resize that is not
         * a swap, SWAP otherwise; {@link #fromWidth()} and {@link #fromHeight()}
         * then hold the previous window size.
         */
        Kind update(int width, int height, int maxWidth, int maxHeight,
                    long nowMs, long lastHingeMotionMs) {
            if (maxWidth > 0 && maxHeight > 0
                && (maxWidth != this.maxWidth || maxHeight != this.maxHeight)) {
                // The display may report before the decor relayouts; remember
                // when so the following resize still counts.
                if (this.maxWidth > 0 && this.maxHeight > 0) displayChangeMs = nowMs;
                this.maxWidth = maxWidth;
                this.maxHeight = maxHeight;
            }
            if (width <= 0 || height <= 0 || (width == this.width && height == this.height))
                return Kind.NONE;
            fromWidth = this.width;
            fromHeight = this.height;
            this.width = width;
            this.height = height;
            long fromArea = (long) fromWidth * fromHeight;
            if (fromArea <= 0) return Kind.NONE;
            float ratio = (float) ((long) width * height) / fromArea;
            if (ratio < AREA_RATIO && ratio > 1f / AREA_RATIO) return Kind.RESIZE;
            boolean displayChanged = displayChangeMs >= 0 && nowMs - displayChangeMs <= EVIDENCE_MS;
            boolean hingeMoved = lastHingeMotionMs >= 0 && nowMs - lastHingeMotionMs <= EVIDENCE_MS;
            return displayChanged || hingeMoved ? Kind.SWAP : Kind.RESIZE;
        }

        int fromWidth() { return fromWidth; }
        int fromHeight() { return fromHeight; }
    }
}
