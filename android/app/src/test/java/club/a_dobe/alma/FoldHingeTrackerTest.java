package club.a_dobe.alma;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class FoldHingeTrackerTest {
    @Test
    public void carriesMonotonicallyBetweenOpeningReadingsWithoutOvershootingBound() {
        FoldHingeTracker tracker = new FoldHingeTracker();
        tracker.update(21f, 0);
        tracker.update(33f, 200);

        float first = tracker.estimate(260);
        float second = tracker.estimate(320);
        assertTrue(first >= 33f);
        assertTrue(second >= first);
        assertTrue(second <= 45f);
    }

    @Test
    public void convergesImmediatelyOnNewReadingAndChangesDirection() {
        FoldHingeTracker tracker = new FoldHingeTracker();
        tracker.update(45f, 0);
        tracker.update(57f, 200);
        assertTrue(tracker.estimate(300) > 57f);

        tracker.update(50f, 320);
        assertEquals(50f, tracker.estimate(320), 0.001f);
        assertTrue(tracker.estimate(420) < 50f);
        assertTrue(tracker.estimate(420) >= 38f);
    }

    @Test
    public void carryDecaysWhenTheHingeHesitates() {
        FoldHingeTracker tracker = new FoldHingeTracker();
        tracker.update(68f, 0);
        tracker.update(81f, 200);

        float early = tracker.estimate(300);
        float late = tracker.estimate(900);
        float settled = tracker.estimate(1_400);
        assertTrue(early > 81f);
        assertTrue(late >= 81f);
        assertTrue(late <= early + 0.5f);
        assertEquals(81f, settled, 0.5f);
    }
}
