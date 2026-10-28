package club.a_dobe.alma;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import club.a_dobe.alma.FoldTransitionModel.SwapDetector;
import club.a_dobe.alma.FoldTransitionModel.SwapDetector.Kind;
import org.junit.Test;

public class FoldTransitionModelTest {
    private static final float EPS = 1e-3f;

    private static FoldTransitionModel.Tuning tuning() {
        return new FoldTransitionModel.Tuning();
    }

    /** Feeds raw angles 10 ms apart, unfiltered, so velocity is exact. */
    private static FoldTransitionModel unfiltered(long startMs, float... angles) {
        FoldTransitionModel.Tuning t = tuning();
        t.angleSmoothing = 1f;
        t.velocitySmoothing = 1f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        for (int i = 0; i < angles.length; i++) model.observe(angles[i], startMs + i * 10L);
        return model;
    }

    // ── filtering and velocity ─────────────────────────────────────────────

    @Test
    public void firstReadingSeedsTheFilterWithoutMotion() {
        FoldTransitionModel model = new FoldTransitionModel(tuning());
        assertFalse(model.observe(180f, 1_000));
        assertEquals(180f, model.angle(), EPS);
        assertEquals(0f, model.velocity(), EPS);
        assertEquals(-1, model.lastMotionMs());
    }

    @Test
    public void lowPassFiltersAngleAndReportsAngularVelocity() {
        FoldTransitionModel.Tuning t = tuning();
        t.angleSmoothing = 0.25f;
        t.velocitySmoothing = 1f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        model.observe(180f, 1_000);
        assertTrue(model.observe(100f, 1_100));
        assertEquals(160f, model.angle(), EPS);
        assertEquals(-200f, model.velocity(), 0.1f);
        assertEquals(1_100, model.lastMotionMs());
    }

    @Test
    public void lowPassFiltersVelocity() {
        FoldTransitionModel.Tuning t = tuning();
        t.angleSmoothing = 1f;
        t.velocitySmoothing = 0.5f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        model.observe(100f, 1_000);
        model.observe(110f, 1_100);
        assertEquals(50f, model.velocity(), 0.1f);
        model.observe(120f, 1_200);
        assertEquals(75f, model.velocity(), 0.1f);
    }

    @Test
    public void slowDriftIsNotMotion() {
        FoldTransitionModel model = unfiltered(1_000, 100f, 100.05f, 100.1f);
        assertEquals(-1, model.lastMotionMs());
    }

    // ── angle progress ─────────────────────────────────────────────────────

    @Test
    public void angleProgressIsZeroFromTheActivationAngleAndOneWhenClosed() {
        assertEquals(0f, FoldTransitionModel.angleProgress(180f, 150f), EPS);
        assertEquals(0f, FoldTransitionModel.angleProgress(150f, 150f), EPS);
        assertEquals(0.5f, FoldTransitionModel.angleProgress(75f, 150f), EPS);
        assertEquals(1f, FoldTransitionModel.angleProgress(0f, 150f), EPS);
        assertEquals(0f, FoldTransitionModel.angleProgress(Float.NaN, 150f), EPS);
    }

    @Test
    public void coverTiltIsZeroClosedAndReachesMaximumAtSwap() {
        assertEquals(0f, FoldTransitionModel.coverTiltForHinge(0f, 1f), EPS);
        assertEquals(0f, FoldTransitionModel.coverTiltForHinge(6f, 1f), EPS);
        assertEquals(45f, FoldTransitionModel.coverTiltForHinge(85f, 1f), EPS);
        assertEquals(45f, FoldTransitionModel.coverTiltForHinge(130f, 1f), EPS);
    }

    @Test
    public void coverTiltIncreasesMonotonicallyTowardSwap() {
        float previous = 0f;
        for (float angle : new float[] {6f, 20f, 45f, 85f}) {
            float tilt = FoldTransitionModel.coverTiltForHinge(angle, 1f);
            assertTrue(tilt >= previous);
            previous = tilt;
        }
    }

    @Test
    public void innerTiltFallsFromMaximumAtSwapToZeroWhenFlat() {
        assertEquals(45f, FoldTransitionModel.innerTiltForHinge(85f, 1f), EPS);
        assertEquals(0f, FoldTransitionModel.innerTiltForHinge(172f, 1f), EPS);
        assertEquals(0f, FoldTransitionModel.innerTiltForHinge(180f, 1f), EPS);
    }

    @Test
    public void innerTiltDecreasesMonotonicallyAfterSwap() {
        float previous = 45f;
        for (float angle : new float[] {85f, 100f, 130f, 172f}) {
            float tilt = FoldTransitionModel.innerTiltForHinge(angle, 1f);
            assertTrue(tilt <= previous);
            previous = tilt;
        }
    }

    @Test
    public void tiltMappingScalesWithTransitionAndUserStrength() {
        assertEquals(11.25f, FoldTransitionModel.coverTiltForHinge(85f, 0.25f), EPS);
        assertEquals(22.5f, FoldTransitionModel.innerTiltForHinge(85f, 0.5f), EPS);
        assertEquals(0f, FoldTransitionModel.innerTiltForHinge(Float.NaN, 1f), EPS);
    }

    // ── before the swap ────────────────────────────────────────────────────

    @Test
    public void closingMotionBeforeTheSwapRampsWithAngleProgress() {
        FoldTransitionModel model = unfiltered(1_000, 80f, 75f);
        FoldTransitionModel.Frame frame = model.frame(1_010, 75f);
        assertTrue(frame.active);
        assertEquals(0.5f, frame.strength, EPS);
        assertEquals(1f, frame.aspectRecovery, EPS);
    }

    @Test
    public void openingMotionBeforeTheSwapFrostsTheCoverImmediately() {
        FoldTransitionModel model = unfiltered(1_000, 0f, 5f, 10f);
        assertTrue(model.lastMotionMs() >= 0);
        FoldTransitionModel.Frame frame = model.frame(1_020, 10f);
        assertTrue(frame.active);
        assertTrue(frame.opening);
    }

    @Test
    public void aTentDeviceStateStartsTheCoverOpeningBeforeTheNinetyDegreeStop() {
        FoldTransitionModel.Tuning t = tuning();
        t.sensorResolutionDegrees = 90f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        model.posture(FoldTransitionModel.Posture.TENT, false, 1_000);

        assertEquals(0f, model.frame(1_000, 45f).strength, EPS);
        assertTrue(model.frame(1_090, 45f).strength > 0.2f);
        assertTrue(model.opening());
    }

    @Test
    public void closingBlurFadesOnceTheHingeRests() {
        FoldTransitionModel model = unfiltered(1_000, 80f, 75f);
        float idle = tuning().idleClearMs;
        assertTrue(model.frame(1_010 + (long) (idle / 2), 75f).active);
        assertFalse(model.frame(1_010 + (long) idle, 75f).active);
    }

    @Test
    public void aRestingHingeShowsNoEffect() {
        FoldTransitionModel model = unfiltered(1_000, 0f, 0f, 0f);
        assertFalse(model.frame(1_020, 0f).active);
        assertFalse(model.inTransition());
    }

    // ── swap direction and decay ───────────────────────────────────────────

    @Test
    public void displayAreaDecidesDirectionAndVelocityIsTheFallback() {
        FoldTransitionModel closing = unfiltered(1_000, 100f, 90f);
        closing.swap(1_020, 90f, 1);
        assertTrue(closing.opening());
        closing.swap(1_030, 90f, -1);
        assertFalse(closing.opening());
        closing.swap(1_040, 90f, 0);
        assertFalse(closing.opening());

        FoldTransitionModel opening = unfiltered(1_000, 80f, 90f);
        opening.swap(1_020, 90f, 0);
        assertTrue(opening.opening());
    }

    @Test
    public void closingSwapClearsByTimeInAboutClosingClearMs() {
        FoldTransitionModel model = unfiltered(1_000, 100f, 60f);
        model.swap(1_020, 60f, -1);
        assertTrue(model.inTransition());
        FoldTransitionModel.Frame start = model.frame(1_020, 40f);
        assertTrue(start.active);
        assertFalse(start.opening);
        assertEquals(1f, start.strength, EPS);
        assertTrue(model.frame(1_020 + 125, 40f).active);
        FoldTransitionModel.Frame end = model.frame(1_020 + 250, 40f);
        assertFalse(end.active);
        assertEquals(0f, end.strength, EPS);
        assertEquals(1f, end.aspectRecovery, EPS);
        assertFalse(model.inTransition());
    }

    @Test
    public void swappedContentUsesItsFinalLayoutFromTheFirstFrame() {
        FoldTransitionModel model = unfiltered(1_000, 100f, 60f);
        model.swap(1_020, 60f, -1);
        assertEquals(1f, model.frame(1_020, 60f).aspectRecovery, EPS);
        assertEquals(1f, model.frame(1_120, 60f).aspectRecovery, EPS);
    }

    @Test
    public void openingSwapClearsExponentiallyWithAngle() {
        FoldTransitionModel model = unfiltered(1_000, 80f, 90f);
        model.swap(1_020, 90f, 1);
        FoldTransitionModel.Frame start = model.frame(1_020, 90f);
        assertTrue(start.active);
        assertTrue(start.opening);
        assertEquals(1f, start.strength, EPS);
        float openingDecay = tuning().openingDecay;
        assertEquals((float) Math.exp(-openingDecay / 2), model.frame(1_030, 120f).strength, EPS);
        assertFalse(model.frame(1_040, 150f).active);
        assertFalse(model.inTransition());
    }

    @Test
    public void openingStalledBelowTheActivationAngleClearsAfterIdle() {
        FoldTransitionModel model = unfiltered(1_000, 80f, 90f);
        model.swap(1_020, 90f, 1);
        long lastMotion = model.lastMotionMs();
        FoldTransitionModel.Tuning t = tuning();
        assertTrue(model.frame(lastMotion + (long) t.idleClearMs - 10, 100f).active);
        assertFalse(model.frame(lastMotion + (long) (t.idleClearMs + t.closingClearMs), 100f).active);
    }

    @Test
    public void resetForgetsMotionAndTransition() {
        FoldTransitionModel model = unfiltered(1_000, 100f, 60f);
        model.swap(1_020, 60f, -1);
        model.reset();
        assertFalse(model.inTransition());
        assertEquals(-1, model.lastMotionMs());
        assertTrue(Float.isNaN(model.angle()));
        assertFalse(model.frame(1_030, 60f).active);
    }

    // ── stepped sensors and posture timing ─────────────────────────────────

    @Test
    public void steppedOpeningPosturesDriveTheEstimatedAngle() {
        FoldTransitionModel.Tuning t = tuning();
        t.sensorResolutionDegrees = 90f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        model.posture(FoldTransitionModel.Posture.TENT, false, false, 1_000);
        assertEquals(FoldAngleEstimator.CLOSED_DEGREES, model.estimatedAngle(1_000), EPS);
        assertTrue(model.estimatedAngle(1_200) > FoldAngleEstimator.CLOSED_DEGREES);
        model.posture(FoldTransitionModel.Posture.HALF_OPENED, false, true, 1_600);
        assertTrue(model.estimatedAngle(1_600) < FoldAngleEstimator.OPENING_NINETY_STOP_DEGREES);
        assertTrue(model.estimatedAngle(1_900) > FoldAngleEstimator.TENT_DEGREES);
        model.posture(FoldTransitionModel.Posture.HALF_OPENED, false, false, 2_300);
        assertTrue(model.estimatedAngle(2_500) > FoldAngleEstimator.OPENING_NINETY_STOP_DEGREES);
        model.swap(2_350, model.estimatedAngle(2_350), 1);
        model.posture(FoldTransitionModel.Posture.FLAT, true, false, 2_700);
        assertTrue(model.estimatedAngle(3_100) > 170f);
    }

    @Test
    public void steppedClosingPosturesDriveTheMirroredEstimatedAngle() {
        FoldTransitionModel.Tuning t = tuning();
        t.sensorResolutionDegrees = 90f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        model.posture(FoldTransitionModel.Posture.FLAT, true, false, 1_000);
        model.posture(FoldTransitionModel.Posture.HALF_OPENED, true, false, 1_300);
        model.posture(FoldTransitionModel.Posture.HALF_OPENED, true, true, 1_600);
        assertTrue(model.estimatedAngle(1_900) < 160f);
        model.posture(FoldTransitionModel.Posture.CLOSED, false, false, 2_000);
        assertTrue(model.estimatedAngle(2_300) < 136f);
    }

    @Test
    public void steppedSensorUsesTimedPostureRampInsteadOfFilteredAngle() {
        FoldTransitionModel.Tuning t = tuning();
        t.sensorResolutionDegrees = 90f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        model.posture(FoldTransitionModel.Posture.HALF_OPENED, false, 1_000);

        assertEquals(0f, model.frame(1_000, 90f).strength, EPS);
        assertTrue(model.frame(1_090, 90f).strength > 0.2f);
        assertEquals(1f, model.frame(1_000 + (long) t.rampInMs, 90f).strength, EPS);
    }

    @Test
    public void steppedOpeningStaysFullyFrostedAcrossSwapThenClearsOnFlat() {
        FoldTransitionModel.Tuning t = tuning();
        t.sensorResolutionDegrees = 90f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        model.posture(FoldTransitionModel.Posture.HALF_OPENED, false, 1_000);
        model.swap(1_200, 90f, 1);
        assertEquals(1f, model.frame(1_200, 90f).strength, EPS);

        model.posture(FoldTransitionModel.Posture.FLAT, true, 1_220);
        assertEquals(1f, model.frame(1_220, 180f).strength, EPS);
        assertTrue(model.frame(1_420, 180f).active);
        assertFalse(model.frame(1_220 + (long) t.openingClearMs, 180f).active);
    }

    @Test
    public void steppedClosingClearsOnTheCoverAfterSwap() {
        FoldTransitionModel.Tuning t = tuning();
        t.sensorResolutionDegrees = 90f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        model.posture(FoldTransitionModel.Posture.FLAT, true, 1_000);
        model.posture(FoldTransitionModel.Posture.HALF_OPENED, true, 1_100);
        assertTrue(model.frame(1_190, 90f).active);
        model.swap(1_300, 90f, -1);
        assertEquals(1f, model.frame(1_300, 90f).strength, EPS);
        assertFalse(model.frame(1_300 + (long) t.closingClearMs, 90f).active);
    }

    @Test
    public void halfOpenOnTheInnerDisplayFadesWithoutASwap() {
        FoldTransitionModel.Tuning t = tuning();
        t.sensorResolutionDegrees = 90f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        model.posture(FoldTransitionModel.Posture.HALF_OPENED, true, 1_000);
        assertTrue(model.frame(1_000 + (long) t.halfOpenHoldMs - 1, 90f).active);
        assertFalse(model.frame(1_000 + (long) (t.halfOpenHoldMs + t.halfOpenClearMs), 90f).active);
    }

    @Test
    public void tentOnTheOuterDisplayFrostsEvenWhenTheSensorClaimsFineResolution() {
        FoldTransitionModel.Tuning t = tuning();
        t.sensorResolutionDegrees = 1f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        model.observe(0f, 900);
        model.posture(FoldTransitionModel.Posture.TENT, false, 1_000);
        assertFalse(model.usesContinuousAngle());
        FoldTransitionModel.Frame frame = model.frame(1_000 + (long) t.rampInMs, 0f);
        assertTrue(frame.active);
        assertTrue(frame.opening);
        // Held until the swap rather than idling out after halfOpenHoldMs.
        assertTrue(model.frame(1_000 + FoldTransitionModel.OPENING_HOLD_MS - 1, 0f).active);
        assertFalse(model.frame(
            1_000 + FoldTransitionModel.OPENING_HOLD_MS + (long) t.halfOpenClearMs, 0f).active);
    }

    @Test
    public void theNinetyDegreeStopAfterTentDoesNotRestartTheRamp() {
        FoldTransitionModel.Tuning t = tuning();
        t.sensorResolutionDegrees = 90f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        model.posture(FoldTransitionModel.Posture.TENT, false, 1_000);
        long mid = 1_000 + (long) t.rampInMs / 2;
        float before = model.frame(mid, 0f).strength;
        model.posture(FoldTransitionModel.Posture.HALF_OPENED, false, mid);
        assertTrue(model.frame(mid + 16, 90f).strength >= before);
        // Still frosted ~1.9s later, when Fold7 swaps to the inner display.
        assertEquals(1f, model.frame(mid + 1_900, 90f).strength, 0.001f);
    }

    @Test
    public void closedFadesTheFrostInsteadOfCuttingIt() {
        FoldTransitionModel.Tuning t = tuning();
        t.sensorResolutionDegrees = 90f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        model.posture(FoldTransitionModel.Posture.TENT, false, 1_000);
        model.frame(1_000 + (long) t.rampInMs, 0f);
        long closed = 1_000 + (long) t.rampInMs + 10;
        model.posture(FoldTransitionModel.Posture.CLOSED, false, closed);
        assertTrue(model.frame(closed + 16, 0f).strength > 0.9f);
        long fading = closed + FoldTransitionModel.CLOSED_HOLD_MS + (long) t.halfOpenClearMs / 3;
        float mid = model.frame(fading, 0f).strength;
        assertTrue(mid > 0f && mid < 1f);
        assertFalse(model.frame(closed + FoldTransitionModel.CLOSED_HOLD_MS
            + (long) t.halfOpenClearMs + 50, 0f).active);
    }

    @Test
    public void rampInIsActiveFromItsFirstFrameSoTheFrameLoopKeepsRunning() {
        FoldTransitionModel.Tuning t = tuning();
        t.sensorResolutionDegrees = 90f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        model.posture(FoldTransitionModel.Posture.TENT, false, 1_000);
        // Same-millisecond frame: strength is still zero, but the loop must continue.
        assertTrue(model.frame(1_000, 0f).active);
        assertTrue(model.frame(1_000 + (long) t.rampInMs / 2, 0f).strength > 0f);
    }

    @Test
    public void observedSmallStepsKeepPosturesFromOverridingContinuousTracking() {
        FoldTransitionModel.Tuning t = tuning();
        t.sensorResolutionDegrees = 1f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        model.observe(10f, 1_000);
        model.observe(14f, 1_050);
        model.posture(FoldTransitionModel.Posture.TENT, false, 1_100);
        assertTrue(model.usesContinuousAngle());
    }

    @Test
    public void fineResolutionSensorKeepsTheContinuousAnglePath() {
        FoldTransitionModel.Tuning t = tuning();
        t.sensorResolutionDegrees = 1f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        model.observe(140f, 1_000);
        model.observe(75f, 1_100);
        assertEquals(0.5f, model.frame(1_100, 75f).strength, 0.02f);
        assertTrue(model.usesContinuousAngle());
    }

    @Test
    public void smallObservedStepsPromoteAnUnknownSensorToContinuous() {
        FoldTransitionModel.Tuning t = tuning();
        t.sensorResolutionDegrees = 90f;
        FoldTransitionModel model = new FoldTransitionModel(t);
        model.observe(90f, 1_000);
        model.observe(96f, 1_020);
        assertTrue(model.usesContinuousAngle());
    }

    // ── swap detection ─────────────────────────────────────────────────────

    private static final int COVER_W = 1080, COVER_H = 2520;
    private static final int INNER_W = 2160, INNER_H = 1856;

    private static SwapDetector onCover() {
        SwapDetector detector = new SwapDetector();
        detector.reset(COVER_W, COVER_H, COVER_W, COVER_H);
        return detector;
    }

    @Test
    public void unchangedWindowIsNotAResize() {
        assertEquals(Kind.NONE, onCover().update(COVER_W, COVER_H, COVER_W, COVER_H, 1_000, -1));
    }

    @Test
    public void rotationKeepsTheAreaSoItIsOnlyAResize() {
        SwapDetector detector = onCover();
        assertEquals(Kind.RESIZE, detector.update(COVER_H, COVER_W, COVER_H, COVER_W, 1_000, 990));
    }

    @Test
    public void splitScreenResizeWithoutFoldEvidenceIsNotASwap() {
        SwapDetector detector = new SwapDetector();
        detector.reset(INNER_W, INNER_H, INNER_W, INNER_H);
        assertEquals(Kind.RESIZE, detector.update(INNER_W / 2, INNER_H, INNER_W, INNER_H, 5_000, -1));
        assertEquals(INNER_W, detector.fromWidth());
        assertEquals(Kind.RESIZE, detector.update(INNER_W, INNER_H, INNER_W, INNER_H, 6_000, -1));
    }

    @Test
    public void freeformResizeLongAfterHingeMotionIsNotASwap() {
        SwapDetector detector = new SwapDetector();
        detector.reset(INNER_W, INNER_H, INNER_W, INNER_H);
        long staleMotion = 5_000 - SwapDetector.EVIDENCE_MS - 1;
        assertEquals(Kind.RESIZE, detector.update(1200, 900, INNER_W, INNER_H, 5_000, staleMotion));
    }

    @Test
    public void largeResizeDuringHingeMotionIsASwap() {
        SwapDetector detector = onCover();
        assertEquals(Kind.SWAP, detector.update(INNER_W, INNER_H, COVER_W, COVER_H, 5_000, 4_800));
        assertEquals(COVER_W, detector.fromWidth());
        assertEquals(COVER_H, detector.fromHeight());
    }

    @Test
    public void displaySizeChangeIsASwapWithoutHingeMotion() {
        // Fold7: both panels are display 0, so only its size changes.
        SwapDetector detector = onCover();
        assertEquals(Kind.SWAP, detector.update(INNER_W, INNER_H, INNER_W, INNER_H, 5_000, -1));
    }

    @Test
    public void displayChangeReportedBeforeTheRelayoutStillCounts() {
        SwapDetector detector = onCover();
        assertEquals(Kind.NONE, detector.update(COVER_W, COVER_H, INNER_W, INNER_H, 5_000, -1));
        assertEquals(Kind.SWAP, detector.update(INNER_W, INNER_H, INNER_W, INNER_H, 5_040, -1));
    }

    @Test
    public void staleDisplayChangeDoesNotLicenseALaterResize() {
        SwapDetector detector = new SwapDetector();
        detector.reset(INNER_W, INNER_H, COVER_W, COVER_H);
        assertEquals(Kind.NONE, detector.update(INNER_W, INNER_H, INNER_W, INNER_H, 5_000, -1));
        long later = 5_000 + SwapDetector.EVIDENCE_MS + 1;
        assertEquals(Kind.RESIZE, detector.update(INNER_W / 2, INNER_H, INNER_W, INNER_H, later, -1));
    }
}
