package club.a_dobe.alma;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SamsungHingeLogParserTest {
    @Test
    public void parsesRealFoldingAngleSamples() {
        SamsungHingeLogParser.Sample sample = SamsungHingeLogParser.parse(
            "I/sensors-hal( 2286): handle_sns_client_event:197, [0]folding_angle "
                + "ts=1295418353773872 ns value [  9/0] (...)");

        assertTrue(sample.isAngle());
        assertEquals(9f, sample.angleDegrees, 0.001f);
        assertEquals(1295418353773872L, sample.sensorTimestampNs);
    }

    @Test
    public void parsesLidAngleWithoutTreatingItAsPrimaryAngle() {
        SamsungHingeLogParser.Sample sample = SamsungHingeLogParser.parse(
            "I/sensors-hal( 2286): [0]lid_angle_fusion ts=1234 ns value [0/  2/1]");

        assertEquals(SamsungHingeLogParser.Kind.LID_ANGLE, sample.kind);
        assertFalse(sample.isAngle());
    }

    @Test
    public void recognizesDeviceModeLinesAndRejectsMalformedLines() {
        assertEquals(SamsungHingeLogParser.Kind.DEVICE_MODE,
            SamsungHingeLogParser.parse("[0]folding_angle device_mode(0 -> 1), book_mode(0 -> 0)").kind);
        assertEquals(SamsungHingeLogParser.Kind.NONE,
            SamsungHingeLogParser.parse("folding_angle ts=nope ns value [ xx/0]").kind);
        assertEquals(SamsungHingeLogParser.Kind.NONE, SamsungHingeLogParser.parse("").kind);
    }
}
