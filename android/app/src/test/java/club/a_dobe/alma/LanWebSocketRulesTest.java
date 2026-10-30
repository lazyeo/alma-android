package club.a_dobe.alma;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import java.net.URI;
import org.junit.Test;

public class LanWebSocketRulesTest {
    @Test
    public void acceptsOnlyPrivateIpv4AndSingleLabelLocalHosts() throws Exception {
        assertEquals("192.168.1.9", LanWebSocketRules.validate("ws://192.168.1.9:23019/__alma_e2e__").getHost());
        assertEquals("desk.local", LanWebSocketRules.validate("ws://desk.local:23019/__alma_e2e__").getHost());
        assertEquals("172.31.4.2", LanWebSocketRules.validate("ws://172.31.4.2:49152/__alma_e2e__").getHost());
        rejects("ws://8.8.8.8:23019/__alma_e2e__");
        rejects("ws://example.com:23019/__alma_e2e__");
        rejects("wss://desk.local:23019/__alma_e2e__");
        rejects("ws://desk.local:23019/other");
        rejects("ws://user@desk.local:23019/__alma_e2e__");
        rejects("ws://desk.local:80/__alma_e2e__?x=1");
    }

    private static void rejects(String value) throws Exception {
        try {
            URI ignored = LanWebSocketRules.validate(value);
            fail("expected rejection: " + ignored);
        } catch (IllegalArgumentException expected) {
            // rejected before DNS or socket creation
        }
    }
}
