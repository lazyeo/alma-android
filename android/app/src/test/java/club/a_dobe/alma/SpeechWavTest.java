package club.a_dobe.alma;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class SpeechWavTest {
    @Test
    public void writesCanonicalPcmHeader() {
        byte[] pcm = new byte[3200];
        for (int i = 0; i < pcm.length; i++) pcm[i] = (byte) i;
        byte[] wav = SpeechWav.wav(pcm);
        ByteBuffer header = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN);

        assertEquals(44 + pcm.length, wav.length);
        assertEquals("RIFF", tag(wav, 0));
        assertEquals(36 + pcm.length, header.getInt(4));
        assertEquals("WAVE", tag(wav, 8));
        assertEquals("fmt ", tag(wav, 12));
        assertEquals(16, header.getInt(16));
        assertEquals(1, header.getShort(20));
        assertEquals(1, header.getShort(22));
        assertEquals(16000, header.getInt(24));
        assertEquals(32000, header.getInt(28));
        assertEquals(2, header.getShort(32));
        assertEquals(16, header.getShort(34));
        assertEquals("data", tag(wav, 36));
        assertEquals(pcm.length, header.getInt(40));
        byte[] body = new byte[pcm.length];
        System.arraycopy(wav, 44, body, 0, pcm.length);
        assertArrayEquals(pcm, body);
    }

    @Test
    public void emptyPcmStillHasHeader() {
        byte[] wav = SpeechWav.wav(new byte[0]);
        assertEquals(44, wav.length);
        assertEquals(36, ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN).getInt(4));
    }

    @Test
    public void rmsOfSilenceIsZero() {
        assertEquals(0.0, SpeechWav.rms(new byte[3200], 3200), 0.0);
        assertEquals(0.0, SpeechWav.rms(new byte[0], 0), 0.0);
    }

    @Test
    public void rmsOfFullScaleSquareWaveIsAboutOne() {
        ByteBuffer pcm = ByteBuffer.allocate(3200).order(ByteOrder.LITTLE_ENDIAN);
        for (int i = 0; i < 1600; i++) pcm.putShort(i % 2 == 0 ? Short.MAX_VALUE : Short.MIN_VALUE);
        assertEquals(1.0, SpeechWav.rms(pcm.array(), 3200), 0.001);
    }

    @Test
    public void rmsReadsOnlyTheGivenLength() {
        ByteBuffer pcm = ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN);
        pcm.putShort((short) 0).putShort((short) 0).putShort(Short.MAX_VALUE).putShort(Short.MAX_VALUE);
        assertEquals(0.0, SpeechWav.rms(pcm.array(), 4), 0.0);
    }

    private static String tag(byte[] wav, int at) {
        return new String(wav, at, 4, StandardCharsets.US_ASCII);
    }
}
