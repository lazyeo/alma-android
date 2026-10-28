package club.a_dobe.alma;

/**
 * Carries sparse Samsung hinge readings between log lines. Adapted from the
 * MIT licensed HingeTracker in marcoazeem/duo-open and
 * OrangeHubX/duo-open-for-galaxy.
 */
final class FoldHingeTracker {
    private static final float MAX_CARRY_DEGREES = 12f;
    private static final long FULL_CARRY_MS = 220L;
    private static final long SETTLE_MS = 1_000L;
    private static final float VELOCITY_BLEND = 0.65f;

    private float angle = Float.NaN;
    private float velocity;
    private long sampleMs = -1L;

    void reset() {
        angle = Float.NaN;
        velocity = 0f;
        sampleMs = -1L;
    }

    void update(float measuredAngle, long nowMs) {
        measuredAngle = clamp(measuredAngle, 0f, 180f);
        if (!Float.isNaN(angle) && sampleMs >= 0 && nowMs > sampleMs) {
            float seconds = Math.max(0.02f, (nowMs - sampleMs) / 1000f);
            float observed = (measuredAngle - angle) / seconds;
            velocity = velocity == 0f ? observed
                : velocity + (observed - velocity) * VELOCITY_BLEND;
            if (Math.signum(observed) != Math.signum(velocity)) velocity = observed;
        } else {
            velocity = 0f;
        }
        angle = measuredAngle;
        sampleMs = nowMs;
    }

    float estimate(long nowMs) {
        if (Float.isNaN(angle) || sampleMs < 0) return Float.NaN;
        long ageMs = Math.max(0L, nowMs - sampleMs);
        if (velocity == 0f || ageMs >= SETTLE_MS) return angle;
        float carryTimeSeconds = Math.min(ageMs, FULL_CARRY_MS) / 1000f;
        float fade = 1f - clamp((ageMs - FULL_CARRY_MS)
            / (float) (SETTLE_MS - FULL_CARRY_MS), 0f, 1f);
        float carry = clamp(velocity * carryTimeSeconds * fade,
            -MAX_CARRY_DEGREES, MAX_CARRY_DEGREES);
        return clamp(angle + carry, 0f, 180f);
    }

    private static float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }
}
