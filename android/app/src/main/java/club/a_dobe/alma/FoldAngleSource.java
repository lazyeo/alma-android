package club.a_dobe.alma;

/** Selects real hinge readings while fresh and the existing estimator otherwise. */
final class FoldAngleSource {
    static final long STALE_MS = 1_000L;

    private final FoldHingeTracker tracker = new FoldHingeTracker();
    private long lastMeasuredMs = -1L;
    /**
     * The HAL logs only on change, so a still hinge is silent. While the feed
     * is connected that silence means "not moving", not "unknown".
     */
    private boolean feedLive;

    void setFeedLive(boolean live) { feedLive = live; }

    void measured(float angle, long nowMs) {
        tracker.update(angle, nowMs);
        lastMeasuredMs = nowMs;
    }

    void reset() {
        tracker.reset();
        lastMeasuredMs = -1L;
        feedLive = false;
    }

    boolean isMeasuredActive(long nowMs) {
        return lastMeasuredMs >= 0 && (feedLive || nowMs - lastMeasuredMs <= STALE_MS);
    }

    float angle(long nowMs, float estimatedAngle) {
        return isMeasuredActive(nowMs) ? tracker.estimate(nowMs) : estimatedAngle;
    }
}
