package club.a_dobe.alma;

import android.os.ParcelFileDescriptor;
import java.io.IOException;

/**
 * Shizuku UserService running as shell. The logcat technique is adapted from
 * the MIT licensed duo-open projects by marcoazeem and OrangeHubX.
 */
public final class FoldHingeLogService extends IFoldHingeLogService.Stub {
    private Process logcat;

    @Override
    public synchronized ParcelFileDescriptor openHingeLog() {
        stopLogcat();
        ParcelFileDescriptor[] pipe = null;
        try {
            pipe = ParcelFileDescriptor.createPipe();
            Process process = new ProcessBuilder("logcat", "-v", "epoch", "-T", "1",
                "-s", "sensors-hal:I", "*:S")
                .redirectErrorStream(true)
                .start();
            logcat = process;
            ParcelFileDescriptor writeEnd = pipe[1];
            Thread copier = new Thread(() -> copy(process, writeEnd), "alma-hinge-logcat");
            copier.setDaemon(true);
            copier.start();
            return pipe[0];
        } catch (IOException error) {
            if (pipe != null) {
                closeQuietly(pipe[0]);
                closeQuietly(pipe[1]);
            }
            stopLogcat();
            throw new IllegalStateException("Could not start hinge logcat", error);
        }
    }

    @Override
    public synchronized void destroy() {
        stopLogcat();
        // Without this the shell process outlives every unbind and reinstall.
        System.exit(0);
    }

    private static void copy(Process process, ParcelFileDescriptor writeEnd) {
        try (ParcelFileDescriptor.AutoCloseOutputStream output =
                 new ParcelFileDescriptor.AutoCloseOutputStream(writeEnd)) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = process.getInputStream().read(buffer)) >= 0) {
                output.write(buffer, 0, count);
                output.flush();
            }
        } catch (IOException ignored) {
            // Closing the app-side reader or destroying the service ends the pipe.
        } finally {
            process.destroy();
        }
    }

    private synchronized void stopLogcat() {
        if (logcat == null) return;
        logcat.destroy();
        logcat = null;
    }

    private static void closeQuietly(ParcelFileDescriptor descriptor) {
        try {
            descriptor.close();
        } catch (IOException ignored) {}
    }
}
