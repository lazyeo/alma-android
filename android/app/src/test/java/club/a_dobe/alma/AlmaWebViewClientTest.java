package club.a_dobe.alma;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public class AlmaWebViewClientTest {
    @Test
    public void recognizesDesktopFileNavigationPaths() {
        assertTrue(AlmaWebViewClient.isDesktopFilePath("/home/example/a.txt"));
        assertTrue(AlmaWebViewClient.isDesktopFilePath("/tmp/a.txt"));
        assertTrue(AlmaWebViewClient.isDesktopFilePath("/private/tmp/a.txt"));
        assertTrue(AlmaWebViewClient.isDesktopFilePath("/home/example/a.txt"));
        assertTrue(AlmaWebViewClient.isDesktopFilePath("/Volumes/Data/a.txt"));
        assertTrue(AlmaWebViewClient.isDesktopFilePath("/opt/alma/readme.txt"));
        assertTrue(AlmaWebViewClient.isDesktopFilePath("/etc/hosts"));
        assertTrue(AlmaWebViewClient.isDesktopFilePath("/C:/home/example/a.txt"));
        assertFalse(AlmaWebViewClient.isDesktopFilePath("/d/desktop/threads"));
        assertFalse(AlmaWebViewClient.isDesktopFilePath("/assets/index.js"));
    }
}
