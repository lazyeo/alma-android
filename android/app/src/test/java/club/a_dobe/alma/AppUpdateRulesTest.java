package club.a_dobe.alma;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Test;

public class AppUpdateRulesTest {
    private static final String DOWNLOADS = "https://github.com/lazyeo/alma-android/releases/download/";
    private static final String SAMPLE_DIGEST = "b5b4dbd96a1a1b4e0e2a06bdc0d0a4b7a4aed2b8a2c0e1d7b5f2b6c1b1d1e9f0";

    @Test
    public void onlyThePublicPackageOnAStableVersionIsEligible() {
        assertTrue(AppUpdateRules.isEligible("club.a_dobe.alma", "0.1.2"));
        assertFalse(AppUpdateRules.isEligible("club.a_dobe.alma.dev", "0.1.2"));
        assertFalse(AppUpdateRules.isEligible("club.a_dobe.alma", "0.1.2-private"));
        assertFalse(AppUpdateRules.isEligible("club.a_dobe.alma", "0.1.2.local"));
        assertFalse(AppUpdateRules.isEligible("club.a_dobe.alma", null));
        assertFalse(AppUpdateRules.isEligible(null, "0.1.2"));
    }

    @Test
    public void comparesStableVersionsNumerically() {
        assertTrue(AppUpdateRules.compareStable("0.1.10", "0.1.9") > 0);
        assertTrue(AppUpdateRules.compareStable("1.0.0", "0.99.99") > 0);
        assertEquals(0, AppUpdateRules.compareStable("0.1.2", "0.1.2"));
        assertTrue(AppUpdateRules.compareStable("0.1.2", "0.1.3") < 0);
    }

    @Test
    public void acceptsOnlyThisReleaseAssetUrl() {
        String name = AppUpdateRules.apkName("0.1.3");
        assertEquals("alma-android-v0.1.3.apk", name);
        assertTrue(AppUpdateRules.isReleaseAssetUrl(DOWNLOADS + "v0.1.3/" + name, "0.1.3", name));
        assertTrue(AppUpdateRules.isReleaseAssetUrl(DOWNLOADS + "v0.1.3/" + name + ".sha256", "0.1.3", name + ".sha256"));
        assertFalse(AppUpdateRules.isReleaseAssetUrl(DOWNLOADS + "v0.1.2/" + name, "0.1.3", name));
        assertFalse(AppUpdateRules.isReleaseAssetUrl("http://github.com/lazyeo/alma-android/releases/download/v0.1.3/" + name, "0.1.3", name));
        assertFalse(AppUpdateRules.isReleaseAssetUrl("https://example.com/v0.1.3/" + name, "0.1.3", name));
        assertFalse(AppUpdateRules.isReleaseAssetUrl(null, "0.1.3", name));
    }

    @Test
    public void parsesTheReleaseChecksumLine() {
        String name = "alma-android-v0.1.3.apk";
        String digest = repeat('a', 64);
        assertEquals(digest, AppUpdateRules.parseChecksum(digest + "  " + name + "\n", name));
        assertEquals(digest, AppUpdateRules.parseChecksum(repeat('A', 64) + " *" + name, name));
        assertEquals(digest, AppUpdateRules.parseChecksum(digest + "\r\n", name));
        assertNull(AppUpdateRules.parseChecksum(digest + "  alma-android-v0.1.2.apk", name));
        assertNull(AppUpdateRules.parseChecksum(repeat('a', 63) + "  " + name, name));
        assertNull(AppUpdateRules.parseChecksum(digest + "  " + name + "\n" + digest + "  x.apk", name));
        assertNull(AppUpdateRules.parseChecksum("", name));
        assertNull(AppUpdateRules.parseChecksum(null, name));
    }

    @Test
    public void copiesWhileHashingAndReportsProgress() throws Exception {
        byte[] body = "alma".getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        List<Long> progress = new ArrayList<>();
        String digest = AppUpdateRules.copyHashing(
            new ByteArrayInputStream(body), out, 100, progress::add, new AtomicBoolean(false));
        assertEquals(sha256Hex(body), digest);
        assertArrayEquals(body, out.toByteArray());
        assertEquals(Long.valueOf(4), progress.get(progress.size() - 1));
    }

    @Test
    public void stopsWhenCancelledOrTooLarge() {
        byte[] body = new byte[1024];
        try {
            AppUpdateRules.copyHashing(new ByteArrayInputStream(body), new ByteArrayOutputStream(), 100, (n) -> {}, new AtomicBoolean(false));
            fail("expected size limit");
        } catch (IOException expected) {
            assertTrue(expected.getMessage().contains("large"));
        }
        try {
            AppUpdateRules.copyHashing(new ByteArrayInputStream(body), new ByteArrayOutputStream(), 4096, (n) -> {}, new AtomicBoolean(true));
            fail("expected cancellation");
        } catch (AppUpdateRules.CancelledException expected) {
            // cancelled before the first chunk
        } catch (IOException other) {
            fail("expected CancelledException, got " + other);
        }
    }

    @Test
    public void digestComparisonIsCaseInsensitiveAndFailsClosed() {
        assertTrue(AppUpdateRules.digestMatches(SAMPLE_DIGEST, SAMPLE_DIGEST.toUpperCase()));
        assertFalse(AppUpdateRules.digestMatches(SAMPLE_DIGEST, repeat('0', 64)));
        assertFalse(AppUpdateRules.digestMatches(null, SAMPLE_DIGEST));
        assertFalse(AppUpdateRules.digestMatches(SAMPLE_DIGEST, null));
    }

    @Test
    public void sweepsPartialsInstalledVersionsAndOldDownloads() {
        long now = 10L * 60 * 60 * 1000;
        long fresh = now - 60_000;
        long old = now - AppUpdateRules.STALE_AFTER_MS;
        // A download that never finished is always partial garbage at sweep time.
        assertTrue(AppUpdateRules.isStale("alma-android-v0.1.3.apk.part", fresh, now, "0.1.2"));
        // Already installed (or older) version: the installer has finished with it.
        assertTrue(AppUpdateRules.isStale("alma-android-v0.1.2.apk", fresh, now, "0.1.2"));
        assertTrue(AppUpdateRules.isStale("alma-android-v0.1.1.apk", fresh, now, "0.1.2"));
        // A newer APK may still be read by the installer: keep it for an hour.
        assertFalse(AppUpdateRules.isStale("alma-android-v0.1.3.apk", fresh, now, "0.1.2"));
        assertTrue(AppUpdateRules.isStale("alma-android-v0.1.3.apk", old, now, "0.1.2"));
        assertTrue(AppUpdateRules.isStale("unexpected.bin", fresh, now, "0.1.2"));
    }

    private static String repeat(char value, int count) {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < count; i++) builder.append(value);
        return builder.toString();
    }

    private static String sha256Hex(byte[] bytes) throws Exception {
        byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder builder = new StringBuilder();
        for (byte value : digest) builder.append(String.format("%02x", value));
        return builder.toString();
    }
}
