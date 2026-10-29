package club.a_dobe.alma;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Pure rules behind AppUpdatePlugin, kept free of Android types for JVM tests. */
final class AppUpdateRules {
    static final String PUBLIC_PACKAGE = "club.a_dobe.alma";
    static final String DOWNLOADS = "https://github.com/lazyeo/alma-android/releases/download/";
    /** How long a not-yet-installed APK is kept for an installer that may still read it. */
    static final long STALE_AFTER_MS = 60L * 60L * 1000L;
    static final String PARTIAL_SUFFIX = ".part";

    private static final Pattern STABLE = Pattern.compile("^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$");
    private static final Pattern APK = Pattern.compile("^alma-android-v(.+)\\.apk$");
    private static final Pattern CHECKSUM = Pattern.compile("^([0-9a-fA-F]{64})(?:\\s+\\*?(.+))?$");

    interface Progress {
        void onBytes(long received);
    }

    static final class CancelledException extends IOException {
        CancelledException() {
            super("Download cancelled");
        }
    }

    private AppUpdateRules() {}

    static boolean isStableVersion(String version) {
        return version != null && STABLE.matcher(version).matches();
    }

    /**
     * Mirrors updateEligibility() in src/updates/updateModel.ts: builds with
     * another application id or a suffixed versionName never self-update.
     */
    static boolean isEligible(String packageName, String versionName) {
        return PUBLIC_PACKAGE.equals(packageName) && isStableVersion(versionName);
    }

    /** Both arguments must be stable versions. */
    static int compareStable(String a, String b) {
        Matcher left = STABLE.matcher(a);
        Matcher right = STABLE.matcher(b);
        if (!left.matches() || !right.matches()) throw new IllegalArgumentException("not a stable version");
        for (int group = 1; group <= 3; group++) {
            int order = Long.compare(Long.parseLong(left.group(group)), Long.parseLong(right.group(group)));
            if (order != 0) return order;
        }
        return 0;
    }

    static String apkName(String version) {
        return "alma-android-v" + version + ".apk";
    }

    static boolean isReleaseAssetUrl(String url, String version, String fileName) {
        return url != null && url.equals(DOWNLOADS + "v" + version + "/" + fileName);
    }

    /** Mirrors parseSha256File() in src/updates/updateModel.ts. */
    static String parseChecksum(String text, String fileName) {
        if (text == null) return null;
        String line = null;
        for (String candidate : text.split("\\r?\\n")) {
            if (candidate.trim().isEmpty()) continue;
            if (line != null) return null;
            line = candidate.trim();
        }
        if (line == null) return null;
        Matcher match = CHECKSUM.matcher(line);
        if (!match.matches()) return null;
        if (match.group(2) != null && !match.group(2).trim().equals(fileName)) return null;
        return match.group(1).toLowerCase(Locale.ROOT);
    }

    static boolean digestMatches(String expected, String actual) {
        if (expected == null || actual == null) return false;
        return MessageDigest.isEqual(
            expected.toLowerCase(Locale.ROOT).getBytes(java.nio.charset.StandardCharsets.US_ASCII),
            actual.toLowerCase(Locale.ROOT).getBytes(java.nio.charset.StandardCharsets.US_ASCII)
        );
    }

    /** Copies at most maxBytes, returning the lowercase SHA-256 of what was written. */
    static String copyHashing(InputStream in, OutputStream out, long maxBytes, Progress progress, AtomicBoolean cancelled)
        throws IOException {
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException error) {
            throw new IOException("SHA-256 unavailable", error);
        }
        byte[] buffer = new byte[64 * 1024];
        long received = 0;
        while (true) {
            if (cancelled.get()) throw new CancelledException();
            int count = in.read(buffer);
            if (count < 0) break;
            received += count;
            if (received > maxBytes) throw new IOException("Download is too large");
            digest.update(buffer, 0, count);
            out.write(buffer, 0, count);
            progress.onBytes(received);
        }
        StringBuilder hex = new StringBuilder();
        for (byte value : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", value));
        return hex.toString();
    }

    /**
     * Whether a file in the update cache can be deleted. Runs at launch and on
     * resume, never right after the installer handoff: partial downloads and
     * versions at or below the installed one are done with; a newer APK is kept
     * for an hour so a pending installer can still read it.
     */
    static boolean isStale(String fileName, long lastModified, long now, String installedVersion) {
        if (fileName.endsWith(PARTIAL_SUFFIX)) return true;
        Matcher match = APK.matcher(fileName);
        if (!match.matches() || !isStableVersion(match.group(1))) return true;
        if (isStableVersion(installedVersion) && compareStable(match.group(1), installedVersion) <= 0) return true;
        return now - lastModified >= STALE_AFTER_MS || lastModified > now;
    }
}
