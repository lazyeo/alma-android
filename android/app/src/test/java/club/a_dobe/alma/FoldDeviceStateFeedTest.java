package club.a_dobe.alma;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class FoldDeviceStateFeedTest {
    @Test
    public void mapsSamsungAndAospFoldStateNames() {
        assertEquals(FoldTransitionModel.Posture.CLOSED,
            FoldDeviceStateFeed.postureForName("CLOSED"));
        assertEquals(FoldTransitionModel.Posture.TENT,
            FoldDeviceStateFeed.postureForName("TENT"));
        assertEquals(FoldTransitionModel.Posture.HALF_OPENED,
            FoldDeviceStateFeed.postureForName("HALF_OPENED"));
        assertEquals(FoldTransitionModel.Posture.FLAT,
            FoldDeviceStateFeed.postureForName("OPENED"));
        assertEquals(FoldTransitionModel.Posture.FLAT,
            FoldDeviceStateFeed.postureForName("UNFOLDED"));
        assertEquals(FoldTransitionModel.Posture.UNKNOWN,
            FoldDeviceStateFeed.postureForName("CONCURRENT_INNER_DEFAULT"));
    }
}
