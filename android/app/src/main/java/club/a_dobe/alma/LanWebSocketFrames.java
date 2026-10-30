package club.a_dobe.alma;

import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

final class LanWebSocketFrames {
    static final int MAX_PAYLOAD = 64 * 1024 * 1024;

    static final class Frame {
        final boolean fin;
        final int opcode;
        final byte[] payload;
        Frame(boolean fin, int opcode, byte[] payload) { this.fin = fin; this.opcode = opcode; this.payload = payload; }
    }

    static void writeClientFrame(OutputStream out, int opcode, byte[] payload, byte[] mask) throws IOException {
        if (payload.length > MAX_PAYLOAD || mask.length != 4) throw new IOException("Invalid WebSocket frame");
        out.write(0x80 | opcode);
        int length = payload.length;
        if (length < 126) out.write(0x80 | length);
        else if (length <= 0xffff) { out.write(0x80 | 126); out.write(length >>> 8); out.write(length); }
        else { out.write(0x80 | 127); for (int i = 7; i >= 0; i--) out.write((int) (((long) length >>> (8 * i)) & 0xff)); }
        out.write(mask);
        for (int i = 0; i < length; i++) out.write(payload[i] ^ mask[i % 4]);
        out.flush();
    }

    static Frame readServerFrame(InputStream in) throws IOException {
        int first = in.read(), second = in.read();
        if (first < 0 || second < 0) throw new EOFException();
        if ((second & 0x80) != 0) throw new IOException("Masked server frame");
        boolean fin = (first & 0x80) != 0;
        int opcode = first & 0x0f;
        long length = second & 0x7f;
        if (length == 126) length = ((long) read(in) << 8) | read(in);
        else if (length == 127) { length = 0; for (int i = 0; i < 8; i++) length = (length << 8) | read(in); }
        if (length > MAX_PAYLOAD || length > Integer.MAX_VALUE) throw new IOException("WebSocket frame too large");
        byte[] payload = in.readNBytes((int) length);
        if (payload.length != length) throw new EOFException();
        return new Frame(fin, opcode, payload);
    }

    private static int read(InputStream in) throws IOException { int value = in.read(); if (value < 0) throw new EOFException(); return value; }
}
