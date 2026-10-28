package club.a_dobe.alma;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class FoldTransitionMeasuredAngleTest {
    private static FoldTransitionModel liveModel() {
        FoldTransitionModel.Tuning tuning = new FoldTransitionModel.Tuning();
        tuning.sensorResolutionDegrees = 90f;
        FoldTransitionModel model = new FoldTransitionModel(tuning);
        model.setMeasuredFeedLive(true);
        return model;
    }

    /** Runs the frame loop at 60 Hz and returns the last frame's strength. */
    private static float run(FoldTransitionModel model, long from, long to) {
        float strength = 0f;
        for (long now = from; now <= to; now += 16) {
            FoldTransitionModel.Frame frame = model.frame(now, Float.NaN);
            strength = frame.active ? frame.strength : 0f;
        }
        return strength;
    }

    @Test
    public void pausingOnTheCoverHoldsTheFrost() {
        FoldTransitionModel model = liveModel();
        model.posture(FoldTransitionModel.Posture.TENT, false, 1_000);
        model.measured(21f, 1_000);
        model.measured(33f, 1_200);
        model.measured(45f, 1_400);
        assertTrue(run(model, 1_400, 1_600) > 0.9f);
        // HAL is silent while the hinge is still; the frost stays.
        assertTrue(model.usesMeasuredAngle(3_400));
        assertTrue(run(model, 1_600, 3_400) > 0.9f);
        assertEquals(45f, model.estimatedAngle(3_400), 1f);
    }

    @Test
    public void turningBackOnTheCoverUnwindsInsteadOfSnappingClear() {
        FoldTransitionModel model = liveModel();
        model.posture(FoldTransitionModel.Posture.TENT, false, 1_000);
        model.measured(33f, 1_000);
        model.measured(45f, 1_200);
        model.posture(FoldTransitionModel.Posture.HALF_OPENED, false, true, 1_300);
        run(model, 1_200, 2_200);
        model.measured(33f, 2_200);
        assertTrue(run(model, 2_200, 2_400) > 0.9f);
        model.measured(21f, 2_400);
        assertTrue(run(model, 2_400, 2_600) > 0.9f);
        // Below the closed threshold the tilt itself is zero, so it is clear.
        model.measured(5f, 2_700);
        assertFalse(model.frame(3_000, Float.NaN).active);
    }

    @Test
    public void closingFromTheInnerDisplayHoldsThroughAPause() {
        FoldTransitionModel model = liveModel();
        model.measured(175f, 1_000);
        model.posture(FoldTransitionModel.Posture.HALF_OPENED, true, 1_100);
        model.measured(150f, 1_200);
        model.measured(128f, 1_400);
        model.posture(FoldTransitionModel.Posture.HALF_OPENED, true, true, 1_500);
        model.measured(101f, 1_700);
        // The old posture timer cleared this ~700ms after HALF_OPENED.
        assertTrue(run(model, 1_700, 3_200) > 0.9f);
    }

    @Test
    public void aLongStillHingeFadesAndMotionBringsTheFrostBack() {
        FoldTransitionModel model = liveModel();
        model.measured(90f, 1_000);
        model.measured(101f, 1_200);
        run(model, 1_200, 1_400);
        long faded = 1_200 + FoldTransitionModel.MEASURED_IDLE_HOLD_MS + 1_500;
        assertEquals(0f, run(model, 1_400, faded), 0.001f);
        model.measured(112f, faded + 16);
        assertTrue(run(model, faded + 16, faded + 400) > 0.9f);
    }

    @Test
    public void closedDeviceStateClearsAResidualCoverReading() {
        FoldTransitionModel model = liveModel();
        model.measured(21f, 1_000);
        model.measured(9f, 1_200);
        model.posture(FoldTransitionModel.Posture.CLOSED, false, 1_250);
        assertEquals(0f, run(model, 1_250,
            1_250 + FoldTransitionModel.CLOSED_HOLD_MS + 1_500), 0.001f);
    }

    @Test
    public void aDisconnectedFeedStillGoesStale() {
        FoldTransitionModel model = liveModel();
        model.measured(57f, 1_000);
        model.setMeasuredFeedLive(false);
        assertFalse(model.usesMeasuredAngle(2_100));
    }
    @Test
    public void postureKeyframesDoNotOverrideFreshMeasuredAngle() {
        FoldTransitionModel.Tuning tuning = new FoldTransitionModel.Tuning();
        tuning.sensorResolutionDegrees = 90f;
        FoldTransitionModel model = new FoldTransitionModel(tuning);

        model.measured(57f, 1_000);
        model.posture(FoldTransitionModel.Posture.FLAT, true, 1_100);

        assertTrue(model.usesMeasuredAngle(1_100));
        assertEquals(57f, model.estimatedAngle(1_100), 0.001f);
    }

    @Test
    public void staleMeasuredAngleFallsBackFromItsLastRealKeyframe() {
        FoldTransitionModel.Tuning tuning = new FoldTransitionModel.Tuning();
        tuning.sensorResolutionDegrees = 90f;
        FoldTransitionModel model = new FoldTransitionModel(tuning);

        model.measured(57f, 1_000);

        assertFalse(model.usesMeasuredAngle(2_001));
        assertEquals(57f, model.estimatedAngle(2_001), 0.001f);
    }

    @Test
    public void postureEstimatorResumesAfterMeasuredAngleGoesStale() {
        FoldTransitionModel.Tuning tuning = new FoldTransitionModel.Tuning();
        tuning.sensorResolutionDegrees = 90f;
        FoldTransitionModel model = new FoldTransitionModel(tuning);

        model.measured(57f, 1_000);
        model.posture(FoldTransitionModel.Posture.FLAT, true, 2_100);

        assertFalse(model.usesMeasuredAngle(2_100));
        // No jump at the keyframe itself: anchored at the last real reading,
        // then it moves on toward the posture angle.
        assertEquals(57f, model.estimatedAngle(2_100), 0.5f);
        assertTrue(model.estimatedAngle(2_400) > 57f);
    }
}
