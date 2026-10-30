package club.a_dobe.alma;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class LanWebSocketFramesTest {
    @Test
    public void clientFramesAreMaskedAndDecodeToTheOriginalPayload() throws Exception {
        byte[] payload = "hello".getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        LanWebSocketFrames.writeClientFrame(out, 1, payload, new byte[] { 1, 2, 3, 4 });
        byte[] wire = out.toByteArray();

        assertEquals(0x81, wire[0] & 0xff);
        assertTrue((wire[1] & 0x80) != 0);
        assertEquals(payload.length, wire[1] & 0x7f);
        byte[] decoded = new byte[payload.length];
        for (int i = 0; i < decoded.length; i++) decoded[i] = (byte) (wire[6 + i] ^ wire[2 + (i % 4)]);
        assertArrayEquals(payload, decoded);
    }

    @Test
    public void readsFragmentedServerMessagesAndControlFrames() throws Exception {
        ByteArrayOutputStream wire = new ByteArrayOutputStream();
        wire.write(new byte[] { 0x01, 0x02, 'h', 'i' });
        wire.write(new byte[] { (byte) 0x89, 0x01, 'p' });
        wire.write(new byte[] { (byte) 0x80, 0x01, '!' });
        ByteArrayInputStream in = new ByteArrayInputStream(wire.toByteArray());

        LanWebSocketFrames.Frame first = LanWebSocketFrames.readServerFrame(in);
        LanWebSocketFrames.Frame ping = LanWebSocketFrames.readServerFrame(in);
        LanWebSocketFrames.Frame last = LanWebSocketFrames.readServerFrame(in);

        assertEquals(1, first.opcode);
        assertTrue(!first.fin);
        assertEquals(9, ping.opcode);
        assertEquals(0, last.opcode);
        assertTrue(last.fin);
    }
}
