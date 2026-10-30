package club.a_dobe.alma;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Downloads a public release APK, verifies it against the release's SHA-256
 * file and hands it to the system installer. Only the public package on a
 * stable versionName may use it (see AppUpdateRules.isEligible).
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private static final long MAX_APK_BYTES = 200L * 1024L * 1024L;
    private static final long MAX_CHECKSUM_BYTES = 4L * 1024L;
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final long PROGRESS_INTERVAL_MS = 200;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    /** Versions whose APK was verified in this process; install accepts only these. */
    private final Set<String> verified = new HashSet<>();
    private volatile boolean downloading;
    private volatile HttpURLConnection active;
    /** Version waiting for the user to allow installs from this app. */
    private String pendingInstall;

    @Override
    public void load() {
        executor.execute(this::sweep);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (pendingInstall != null) {
            String version = pendingInstall;
            pendingInstall = null;
            JSObject event = new JSObject();
            event.put("version", version);
            if (canInstallPackages()) {
                try {
                    launchInstaller(apkFile(version));
                    event.put("status", "started");
                } catch (Exception error) {
                    event.put("status", "failed");
                }
            } else {
                event.put("status", "permissionDenied");
            }
            notifyListeners("installStatus", event);
        }
        if (!downloading) executor.execute(this::sweep);
    }

    @PluginMethod
    public void download(PluginCall call) {
        String version = call.getString("version");
        String apkUrl = call.getString("apkUrl");
        String checksumUrl = call.getString("checksumUrl");
        String installed = installedVersion();
        if (!AppUpdateRules.isEligible(getContext().getPackageName(), installed)) {
            call.reject("Updates are unavailable for this build", "UNAVAILABLE");
            return;
        }
        if (!AppUpdateRules.isStableVersion(version) || AppUpdateRules.compareStable(version, installed) <= 0) {
            call.reject("Not a newer release", "INVALID");
            return;
        }
        String name = AppUpdateRules.apkName(version);
        if (!AppUpdateRules.isReleaseAssetUrl(apkUrl, version, name)
            || !AppUpdateRules.isReleaseAssetUrl(checksumUrl, version, name + ".sha256")) {
            call.reject("Not a release asset", "INVALID");
            return;
        }
        synchronized (this) {
            if (downloading) {
                call.reject("A download is already running", "BUSY");
                return;
            }
            downloading = true;
            cancelled.set(false);
        }
        executor.execute(() -> {
            try {
                File apk = downloadVerified(version, apkUrl, checksumUrl);
                synchronized (verified) {
                    verified.add(version);
                }
                JSObject result = new JSObject();
                result.put("version", version);
                result.put("size", apk.length());
                call.resolve(result);
            } catch (AppUpdateRules.CancelledException error) {
                call.reject("Download cancelled", "CANCELLED");
            } catch (ChecksumException error) {
                call.reject(error.getMessage(), error.code);
            } catch (Exception error) {
                call.reject("Download failed", "DOWNLOAD_FAILED", error);
            } finally {
                downloading = false;
                active = null;
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled.set(true);
        HttpURLConnection connection = active;
        if (connection != null) connection.disconnect();
        call.resolve();
    }

    @PluginMethod
    public void install(PluginCall call) {
        String version = call.getString("version");
        boolean ready;
        synchronized (verified) {
            ready = version != null && verified.contains(version);
        }
        File apk = ready ? apkFile(version) : null;
        if (apk == null || !apk.isFile()) {
            call.reject("Download the update first", "NOT_FOUND");
            return;
        }
        JSObject result = new JSObject();
        if (!canInstallPackages()) {
            // Resumed in handleOnResume once the user returns from Settings.
            pendingInstall = version;
            try {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                getActivity().startActivity(intent);
            } catch (ActivityNotFoundException error) {
                pendingInstall = null;
                call.reject("Install permission screen unavailable", "UNAVAILABLE");
                return;
            }
            result.put("status", "permissionRequired");
            call.resolve(result);
            return;
        }
        try {
            launchInstaller(apk);
            result.put("status", "started");
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not open the installer", "INSTALL_FAILED", error);
        }
    }

    private static final class ChecksumException extends IOException {
        final String code;

        ChecksumException(String message, String code) {
            super(message);
            this.code = code;
        }
    }

    private File downloadVerified(String version, String apkUrl, String checksumUrl) throws IOException {
        String name = AppUpdateRules.apkName(version);
        String expected = AppUpdateRules.parseChecksum(
            new String(fetch(checksumUrl, MAX_CHECKSUM_BYTES), StandardCharsets.UTF_8),
            name
        );
        if (expected == null) throw new ChecksumException("Checksum unavailable", "CHECKSUM_UNAVAILABLE");

        File directory = updateDirectory();
        File partial = new File(directory, name + AppUpdateRules.PARTIAL_SUFFIX);
        File target = new File(directory, name);
        String actual;
        HttpURLConnection connection = open(apkUrl);
        try {
            long total = connection.getContentLengthLong();
            if (total > MAX_APK_BYTES) throw new IOException("Download is too large");
            long[] lastEmit = {0};
            try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(partial, false)) {
                actual = AppUpdateRules.copyHashing(in, out, MAX_APK_BYTES, (received) -> {
                    long now = System.currentTimeMillis();
                    if (now - lastEmit[0] < PROGRESS_INTERVAL_MS && received != total) return;
                    lastEmit[0] = now;
                    JSObject event = new JSObject();
                    event.put("received", received);
                    event.put("total", total);
                    notifyListeners("downloadProgress", event);
                }, cancelled);
            }
        } catch (IOException error) {
            delete(partial);
            throw cancelled.get() ? new AppUpdateRules.CancelledException() : error;
        } finally {
            connection.disconnect();
        }
        // Fail closed: a mismatching APK is deleted and never offered to the installer.
        if (!AppUpdateRules.digestMatches(expected, actual)) {
            delete(partial);
            throw new ChecksumException("Checksum mismatch", "CHECKSUM_MISMATCH");
        }
        delete(target);
        if (!partial.renameTo(target)) {
            delete(partial);
            throw new IOException("Could not store the download");
        }
        return target;
    }

    private byte[] fetch(String url, long maxBytes) throws IOException {
        HttpURLConnection connection = open(url);
        try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            AppUpdateRules.copyHashing(in, out, maxBytes, (received) -> {}, cancelled);
            return out.toByteArray();
        } finally {
            connection.disconnect();
        }
    }

    private HttpURLConnection open(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        // GitHub redirects release assets to its CDN; HttpURLConnection never
        // follows an https -> http downgrade, and the result is checked below.
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("Accept", "application/octet-stream");
        active = connection;
        if (cancelled.get()) throw new AppUpdateRules.CancelledException();
        int status = connection.getResponseCode();
        if (!"https".equals(connection.getURL().getProtocol())) throw new IOException("Insecure redirect");
        if (status < 200 || status >= 300) throw new IOException("HTTP " + status);
        return connection;
    }

    private void launchInstaller(File apk) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(uri, APK_MIME);
        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getActivity().startActivity(view);
        } catch (ActivityNotFoundException missing) {
            @SuppressWarnings("deprecation")
            Intent install = new Intent(Intent.ACTION_INSTALL_PACKAGE);
            install.setData(uri);
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(install);
        }
        // The file stays until sweep(): the installer reads it after this returns.
    }

    private boolean canInstallPackages() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private String installedVersion() {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            return info.versionName;
        } catch (Exception error) {
            return null;
        }
    }

    private File updateDirectory() throws IOException {
        File directory = new File(getContext().getCacheDir(), "updates");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create update cache");
        return directory;
    }

    private File apkFile(String version) {
        return new File(new File(getContext().getCacheDir(), "updates"), AppUpdateRules.apkName(version));
    }

    /** Deletes stale update files; see AppUpdateRules.isStale for the timing rules. */
    private void sweep() {
        if (downloading) return;
        File[] files = new File(getContext().getCacheDir(), "updates").listFiles();
        if (files == null) return;
        String installed = installedVersion();
        long now = System.currentTimeMillis();
        for (File file : files) {
            if (!file.isFile()) continue;
            if (AppUpdateRules.isStale(file.getName(), file.lastModified(), now, installed)) {
                delete(file);
                synchronized (verified) {
                    verified.removeIf((version) -> AppUpdateRules.apkName(version).equals(file.getName()));
                }
            }
        }
    }

    private static void delete(File file) {
        if (file.exists() && !file.delete()) file.deleteOnExit();
    }
}
