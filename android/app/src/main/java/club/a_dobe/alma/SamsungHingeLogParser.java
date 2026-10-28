package club.a_dobe.alma;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses Samsung sensor-HAL hinge messages. Regexes are adapted from the MIT
 * licensed duo-open projects by marcoazeem and OrangeHubX.
 */
final class SamsungHingeLogParser {
    enum Kind { NONE, FOLDING_ANGLE, LID_ANGLE, DEVICE_MODE }

    static final class Sample {
        final Kind kind;
        final long sensorTimestampNs;
        final float angleDegrees;

        Sample(Kind kind, long sensorTimestampNs, float angleDegrees) {
            this.kind = kind;
            this.sensorTimestampNs = sensorTimestampNs;
            this.angleDegrees = angleDegrees;
        }

        boolean isAngle() { return kind == Kind.FOLDING_ANGLE; }
    }

    private static final Sample NONE = new Sample(Kind.NONE, 0L, Float.NaN);
    private static final Pattern FOLDING = Pattern.compile(
        "\\]folding_angle\\s+ts=(\\d+)\\s+ns\\s+value\\s+\\[\\s*(\\d+(?:\\.\\d+)?)/");
    private static final Pattern LID = Pattern.compile(
        "\\]lid_angle_fusion\\s+ts=(\\d+)\\s+ns\\s+value\\s+\\[");
    private static final Pattern DEVICE_MODE = Pattern.compile(
        "\\]folding_angle\\s+device_mode\\(");

    private SamsungHingeLogParser() {}

    static Sample parse(String line) {
        if (line == null || line.isEmpty()) return NONE;
        Matcher folding = FOLDING.matcher(line);
        if (folding.find()) {
            try {
                float angle = Float.parseFloat(folding.group(2));
                if (angle < 0f || angle > 180f) return NONE;
                return new Sample(Kind.FOLDING_ANGLE,
                    Long.parseLong(folding.group(1)), angle);
            } catch (NumberFormatException ignored) {
                return NONE;
            }
        }
        if (LID.matcher(line).find()) return new Sample(Kind.LID_ANGLE, 0L, Float.NaN);
        if (DEVICE_MODE.matcher(line).find()) return new Sample(Kind.DEVICE_MODE, 0L, Float.NaN);
        return NONE;
    }
}
