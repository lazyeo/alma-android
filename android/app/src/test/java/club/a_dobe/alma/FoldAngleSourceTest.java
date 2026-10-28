package club.a_dobe.alma;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class FoldAngleSourceTest {
    @Test
    public void measuredAngleIsAuthoritativeUntilItIsStale() {
        FoldAngleSource source = new FoldAngleSource();
        source.measured(92f, 1_000);

        assertTrue(source.isMeasuredActive(1_999));
        assertEquals(92f, source.angle(1_000, 40f), 0.001f);
        assertFalse(source.isMeasuredActive(2_001));
        assertEquals(40f, source.angle(2_001, 40f), 0.001f);
    }

    @Test
    public void resetReturnsToEstimatedImmediately() {
        FoldAngleSource source = new FoldAngleSource();
        source.measured(106f, 1_000);
        source.reset();

        assertFalse(source.isMeasuredActive(1_001));
        assertEquals(55f, source.angle(1_001, 55f), 0.001f);
    }
}
