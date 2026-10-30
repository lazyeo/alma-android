package club.a_dobe.alma;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

final class LanWebSocketClient {
    interface Listener {
        void onOpen();
        void onText(String value);
        void onBinary(byte[] value);
        void onClose(int code, String reason);
        void onError(String message);
    }

    private final URI uri;
    private final Listener listener;
    private final SecureRandom random = new SecureRandom();
    private final Object writeLock = new Object();
    private volatile Socket socket;
    private volatile OutputStream output;
    private volatile boolean closed;

    LanWebSocketClient(String value, Listener listener) {
        this.uri = LanWebSocketRules.validate(value);
        this.listener = listener;
    }

    void connect() {
        Thread thread = new Thread(this::run, "alma-lan-websocket");
        thread.setDaemon(true);
        thread.start();
    }

    void sendText(String value) throws IOException { send(1, value.getBytes(StandardCharsets.UTF_8)); }
    void sendBinary(byte[] value) throws IOException { send(2, value); }

    void close(int code, String reason) {
        if (closed) return;
        closed = true;
        try {
            ByteArrayOutputStream payload = new ByteArrayOutputStream();
            payload.write(code >>> 8); payload.write(code);
            payload.write(reason.getBytes(StandardCharsets.UTF_8));
            send(8, payload.toByteArray());
        } catch (Exception ignored) {
        } finally {
            closeSocket();
        }
    }

    private void run() {
        try {
            Socket next = new Socket();
            socket = next;
            next.connect(new InetSocketAddress(uri.getHost(), uri.getPort()), 1_500);
            next.setSoTimeout(0);
            InputStream input = next.getInputStream();
            output = next.getOutputStream();
            performUpgrade(input, output);
            listener.onOpen();
            readLoop(input);
        } catch (Exception error) {
            if (!closed) listener.onError(error.getMessage() == null ? "LAN connection failed" : error.getMessage());
        } finally {
            closeSocket();
        }
    }

    private void performUpgrade(InputStream input, OutputStream out) throws Exception {
        byte[] keyBytes = new byte[16]; random.nextBytes(keyBytes);
        String key = Base64.getEncoder().encodeToString(keyBytes);
        String request = "GET " + uri.getRawPath() + " HTTP/1.1\r\n" +
            "Host: " + uri.getHost() + ":" + uri.getPort() + "\r\n" +
            "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
            "Sec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\n\r\n";
        out.write(request.getBytes(StandardCharsets.US_ASCII)); out.flush();
        ByteArrayOutputStream header = new ByteArrayOutputStream();
        int matched = 0;
        while (header.size() < 16 * 1024) {
            int value = input.read(); if (value < 0) throw new IOException("WebSocket upgrade ended early");
            header.write(value);
            int[] end = { '\r', '\n', '\r', '\n' };
            matched = value == end[matched] ? matched + 1 : value == '\r' ? 1 : 0;
            if (matched == 4) break;
        }
        String response = header.toString(StandardCharsets.US_ASCII);
        if (!response.startsWith("HTTP/1.1 101 ")) throw new IOException("WebSocket upgrade rejected");
        String expected = Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-1")
            .digest((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").getBytes(StandardCharsets.US_ASCII)));
        boolean accepted = false;
        for (String line : response.split("\r\n"))
            if (line.regionMatches(true, 0, "Sec-WebSocket-Accept:", 0, 21) && line.substring(21).trim().equals(expected)) accepted = true;
        if (!accepted) throw new IOException("Invalid WebSocket upgrade response");
    }

    private void readLoop(InputStream input) throws IOException {
        ByteArrayOutputStream message = null;
        int messageOpcode = 0;
        while (!closed) {
            LanWebSocketFrames.Frame frame = LanWebSocketFrames.readServerFrame(input);
            if (frame.opcode == 8) { listener.onClose(closeCode(frame.payload), closeReason(frame.payload)); return; }
            if (frame.opcode == 9) { send(10, frame.payload); continue; }
            if (frame.opcode == 10) continue;
            if (frame.opcode == 1 || frame.opcode == 2) { message = new ByteArrayOutputStream(); messageOpcode = frame.opcode; }
            else if (frame.opcode != 0 || message == null) throw new IOException("Unexpected WebSocket frame");
            message.write(frame.payload);
            if (message.size() > LanWebSocketFrames.MAX_PAYLOAD) throw new IOException("WebSocket message too large");
            if (frame.fin) {
                byte[] value = message.toByteArray();
                if (messageOpcode == 1) listener.onText(new String(value, StandardCharsets.UTF_8)); else listener.onBinary(value);
                message = null;
            }
        }
    }

    private void send(int opcode, byte[] payload) throws IOException {
        OutputStream out = output; if (out == null) throw new IOException("LAN socket is not open");
        byte[] mask = new byte[4]; random.nextBytes(mask);
        synchronized (writeLock) { LanWebSocketFrames.writeClientFrame(out, opcode, payload, mask); }
    }

    private int closeCode(byte[] payload) { return payload.length >= 2 ? ((payload[0] & 255) << 8) | (payload[1] & 255) : 1000; }
    private String closeReason(byte[] payload) { return payload.length > 2 ? new String(payload, 2, payload.length - 2, StandardCharsets.UTF_8) : ""; }
    private void closeSocket() { try { if (socket != null) socket.close(); } catch (IOException ignored) {} }
}
