package club.a_dobe.alma;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class FoldAngleEstimatorTest {
    private static final float EPS = 0.01f;

    @Test
    public void tentLongAfterClosedStillMovesAtHandSpeed() {
        // Device trace 08:58: CLOSED, then TENT 1.45s later, 90° stop 0.83s
        // after TENT, HALF_OPENED 5.5s later. The old estimate sat at ~8–15°.
        FoldAngleEstimator estimator = new FoldAngleEstimator();
        estimator.reset(0f, 0);
        estimator.keyframe(FoldAngleEstimator.CLOSED_EVENT_DEGREES, 0f, 1_000);
        estimator.keyframe(FoldAngleEstimator.TENT_DEGREES,
            FoldAngleEstimator.OPENING_NINETY_STOP_DEGREES, 2_450);
        assertTrue(estimator.angle(2_450 + 500) > 30f);
        estimator.keyframe(FoldAngleEstimator.OPENING_NINETY_STOP_DEGREES,
            FoldAngleEstimator.OPENING_HALF_OPENED_DEGREES, 3_280);
        // A slow open keeps advancing instead of freezing near the stop.
        assertTrue(estimator.angle(3_280 + 2_000) > 90f);
        assertTrue(estimator.angle(3_280 + 5_000)
            <= FoldAngleEstimator.OPENING_HALF_OPENED_DEGREES + EPS);
    }

    @Test
    public void openingEstimateIsMonotonicAndDoesNotOvershootNextKeyframe() {
        FoldAngleEstimator estimator = new FoldAngleEstimator();
        estimator.reset(0f, 0);
        estimator.keyframe(15f, 40f, 100);
        estimator.keyframe(40f, 145f, 600);

        float previous = estimator.angle(600);
        for (long now = 616; now <= 1_500; now += 16) {
            float angle = estimator.angle(now);
            assertTrue("opening angle must be monotonic", angle + EPS >= previous);
            assertTrue("opening angle must not pass the next event", angle <= 145f + EPS);
            previous = angle;
        }
    }

    @Test
    public void aNewKeyframeConvergesWithoutJumping() {
        FoldAngleEstimator estimator = new FoldAngleEstimator();
        estimator.reset(0f, 0);
        estimator.keyframe(15f, 40f, 100);
        float before = estimator.angle(400);
        estimator.keyframe(40f, 145f, 400);
        assertEquals(before, estimator.angle(400), EPS);
        assertTrue(estimator.angle(480) > before);
        assertTrue(estimator.angle(800) < 145f);
    }

    @Test
    public void hesitationDecaysVelocityAndSettles() {
        FoldAngleEstimator estimator = new FoldAngleEstimator();
        estimator.reset(0f, 0);
        estimator.keyframe(15f, 40f, 100);
        estimator.keyframe(40f, 145f, 600);
        estimator.angle(900);
        float later = estimator.angle(6_000);
        float muchLater = estimator.angle(9_000);
        assertEquals(later, muchLater, 0.5f);
        assertTrue(Math.abs(estimator.velocity()) < 0.5f);
    }

    @Test
    public void closingMirrorsOpeningWithoutUndershoot() {
        FoldAngleEstimator estimator = new FoldAngleEstimator();
        estimator.reset(180f, 0);
        estimator.keyframe(160f, 136f, 100);
        estimator.keyframe(136f, 10f, 400);

        float previous = estimator.angle(400);
        for (long now = 416; now <= 1_300; now += 16) {
            float angle = estimator.angle(now);
            assertTrue("closing angle must be monotonic", angle <= previous + EPS);
            assertTrue("closing angle must not pass the next event", angle >= 10f - EPS);
            previous = angle;
        }
    }

    @Test
    public void fold7KeyframeAnglesDocumentTheMeasuredStops() {
        assertEquals(0f, FoldAngleEstimator.CLOSED_DEGREES, EPS);
        assertEquals(15f, FoldAngleEstimator.TENT_DEGREES, EPS);
        assertEquals(40f, FoldAngleEstimator.OPENING_NINETY_STOP_DEGREES, EPS);
        assertEquals(145f, FoldAngleEstimator.OPENING_HALF_OPENED_DEGREES, EPS);
        assertEquals(160f, FoldAngleEstimator.CLOSING_HALF_OPENED_DEGREES, EPS);
        assertEquals(136f, FoldAngleEstimator.CLOSING_NINETY_STOP_DEGREES, EPS);
        assertEquals(178f, FoldAngleEstimator.OPENED_DEGREES, EPS);
        assertEquals(10f, FoldAngleEstimator.CLOSED_EVENT_DEGREES, EPS);
    }
}
