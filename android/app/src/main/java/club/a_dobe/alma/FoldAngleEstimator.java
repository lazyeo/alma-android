package club.a_dobe.alma;

/**
 * Smooth pseudo-continuous hinge angle for devices whose public hinge sensor
 * only exposes stops. All constants below come from Galaxy Z Fold7 traces:
 * TENT at the start of opening, the public 90° stop while the raw hinge is
 * about 40°, HALF_OPENED shortly before the display swap, and OPENED/180 when
 * the raw hinge is already about 170–180°. Closing uses the measured mirror
 * points (HALF_OPENED about 160°, 90° stop at about 136°, CLOSED near 10°).
 */
final class FoldAngleEstimator {
    static final float CLOSED_DEGREES = 0f;
    static final float TENT_DEGREES = 15f;
    static final float OPENING_NINETY_STOP_DEGREES = 40f;
    static final float OPENING_HALF_OPENED_DEGREES = 145f;
    static final float CLOSING_HALF_OPENED_DEGREES = 160f;
    static final float CLOSING_NINETY_STOP_DEGREES = 136f;
    static final float CLOSED_EVENT_DEGREES = 10f;
    static final float OPENED_DEGREES = 178f;

    private static final float SPRING_OMEGA = 11f;
    private static final float EXTRAPOLATION_DECAY_SECONDS = 1.0f;
    /**
     * Typical hand opening speed on Fold7 (TENT 15° to the 40° stop in
     * 0.4–0.9s). Used when the previous event is too old to give a speed,
     * e.g. TENT seconds after CLOSED, and as a floor so slow events never
     * freeze the estimate halfway.
     */
    static final float NOMINAL_VELOCITY = 60f;
    private static final long STALE_EVENT_MS = 600;
    private static final float MAX_EVENT_VELOCITY = 240f;
    private static final float SETTLED_VELOCITY = 0.05f;
    private static final long MAX_STEP_MS = 16;

    private float angle = Float.NaN;
    private float velocity;
    private float eventAngle;
    private float eventVelocity;
    private float expectedAngle;
    private long eventMs = -1;
    private long updateMs = -1;
    private float previousEventAngle;
    private long previousEventMs = -1;

    void reset(float angle, long nowMs) {
        this.angle = clampAngle(angle);
        velocity = 0f;
        eventAngle = this.angle;
        eventVelocity = 0f;
        expectedAngle = this.angle;
        eventMs = nowMs;
        updateMs = nowMs;
        previousEventAngle = this.angle;
        previousEventMs = nowMs;
    }

    void reset() {
        angle = Float.NaN;
        velocity = 0f;
        eventMs = -1;
        updateMs = -1;
        previousEventMs = -1;
    }

    /**
     * Adds an observed event angle and the bound of the next expected event.
     * The rendered angle is first advanced to {@code nowMs}, then retained so
     * the new event changes acceleration rather than causing a visible jump.
     */
    void keyframe(float measuredAngle, float nextExpectedAngle, long nowMs) {
        if (Float.isNaN(angle)) {
            reset(measuredAngle, nowMs);
            expectedAngle = clampAngle(nextExpectedAngle);
            return;
        }
        angle(nowMs);
        float nextEvent = clampAngle(measuredAngle);
        float direction = Math.signum(clampAngle(nextExpectedAngle) - nextEvent);
        if (previousEventMs >= 0 && nowMs > previousEventMs
            && nowMs - previousEventMs <= STALE_EVENT_MS) {
            float seconds = (nowMs - previousEventMs) / 1000f;
            eventVelocity = clamp((nextEvent - previousEventAngle) / seconds,
                -MAX_EVENT_VELOCITY, MAX_EVENT_VELOCITY);
        } else {
            eventVelocity = 0f;
        }
        // Keep moving toward the next expected event at least at the
        // nominal hand speed; the bound below still prevents overshoot.
        if (direction != 0f && eventVelocity * direction < NOMINAL_VELOCITY)
            eventVelocity = direction * NOMINAL_VELOCITY;
        previousEventAngle = nextEvent;
        previousEventMs = nowMs;
        eventAngle = nextEvent;
        expectedAngle = clampAngle(nextExpectedAngle);
        eventMs = nowMs;
    }

    float angle(long nowMs) {
        if (Float.isNaN(angle)) return Float.NaN;
        if (nowMs <= updateMs) return angle;
        while (updateMs < nowMs) {
            long stepMs = Math.min(MAX_STEP_MS, nowMs - updateMs);
            updateMs += stepMs;
            integrate(stepMs / 1000f, updateMs);
        }
        return angle;
    }

    float angle() { return angle; }
    float velocity() { return velocity; }

    private void integrate(float dt, long nowMs) {
        float elapsed = Math.max(0f, (nowMs - eventMs) / 1000f);
        float decay = (float) Math.exp(-elapsed / EXTRAPOLATION_DECAY_SECONDS);
        float travel = eventVelocity * EXTRAPOLATION_DECAY_SECONDS * (1f - decay);
        float target = bounded(eventAngle + travel, eventAngle, expectedAngle);

        // Critically damped spring: x'' + 2ωx' + ω²(x-target) = 0.
        float acceleration = SPRING_OMEGA * SPRING_OMEGA * (target - angle)
            - 2f * SPRING_OMEGA * velocity;
        velocity += acceleration * dt;
        angle += velocity * dt;

        if ((expectedAngle >= eventAngle && angle > expectedAngle)
            || (expectedAngle < eventAngle && angle < expectedAngle)) {
            angle = expectedAngle;
            velocity = 0f;
        }
        angle = clampAngle(angle);
        if (Math.abs(target - angle) < 0.01f && Math.abs(velocity) < SETTLED_VELOCITY) {
            angle = target;
            velocity = 0f;
        }
    }

    private static float bounded(float value, float from, float to) {
        return to >= from ? clamp(value, from, to) : clamp(value, to, from);
    }

    private static float clampAngle(float value) { return clamp(value, 0f, 180f); }

    private static float clamp(float value, float min, float max) {
        return Math.min(max, Math.max(min, value));
    }
}
