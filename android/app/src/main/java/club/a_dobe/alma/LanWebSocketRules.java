package club.a_dobe.alma;

import java.net.URI;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class LanWebSocketRules {
    private static final Pattern IPV4 = Pattern.compile("^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$");

    static URI validate(String value) {
        try {
            URI uri = URI.create(value);
            if (!"ws".equals(uri.getScheme()) || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null)
                throw new IllegalArgumentException("Unsupported LAN WebSocket URL");
            if (!"/__alma_e2e__".equals(uri.getPath()) || uri.getPort() < 1024 || uri.getPort() > 65535)
                throw new IllegalArgumentException("Unsupported LAN WebSocket endpoint");
            String host = uri.getHost();
            if (host == null || !(isPrivateIpv4(host) || isLocalName(host)))
                throw new IllegalArgumentException("Host is not a private LAN candidate");
            return uri;
        } catch (RuntimeException error) {
            if (error instanceof IllegalArgumentException) throw error;
            throw new IllegalArgumentException("Invalid LAN WebSocket URL", error);
        }
    }

    private static boolean isLocalName(String host) {
        return host.matches("(?i)^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.local$");
    }

    private static boolean isPrivateIpv4(String host) {
        Matcher match = IPV4.matcher(host);
        if (!match.matches()) return false;
        int[] p = new int[4];
        for (int i = 0; i < 4; i++) {
            p[i] = Integer.parseInt(match.group(i + 1));
            if (p[i] > 255) return false;
        }
        return p[0] == 10 || (p[0] == 172 && p[1] >= 16 && p[1] <= 31) || (p[0] == 192 && p[1] == 168);
    }
}
