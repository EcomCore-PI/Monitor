import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.NetworkInterface;
import java.util.Enumeration;
import java.util.Locale;

/** Coleta contadores de rede e publica JSON em stdout a cada segundo. */
public class NetworkMonitor {
    private static long[] totals() throws Exception {
        long received = 0, sent = 0;
        Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
        while (interfaces.hasMoreElements()) {
            NetworkInterface nic = interfaces.nextElement();
            if (nic.isLoopback() || !nic.isUp()) continue;
            // Java não expõe contadores de bytes em NetworkInterface: no Windows consultamos
            // os contadores nativos via PowerShell; no Linux lemos /proc/net/dev.
            if (System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win")) {
                Process p = new ProcessBuilder("powershell", "-NoProfile", "-Command",
                    "(Get-NetAdapterStatistics -Name '" + nic.getName().replace("'", "''") + "' -ErrorAction SilentlyContinue | ForEach-Object { \"$($_.ReceivedBytes),$($_.SentBytes)\" })")
                    .redirectErrorStream(true).start();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        String[] values = line.trim().split(",");
                        if (values.length == 2) try { received += Long.parseLong(values[0]); sent += Long.parseLong(values[1]); } catch (NumberFormatException ignored) { }
                    }
                }
                p.waitFor();
            } else {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(new ProcessBuilder("cat", "/proc/net/dev").start().getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        String[] parts = line.trim().split("\\s*:\\s*");
                        if (parts.length != 2 || !parts[0].equals(nic.getName())) continue;
                        String[] values = parts[1].trim().split("\\s+");
                        if (values.length >= 9) { received += Long.parseLong(values[0]); sent += Long.parseLong(values[8]); }
                    }
                }
            }
        }
        return new long[]{received, sent};
    }

    public static void main(String[] args) throws Exception {
        long[] previous = totals();
        while (true) {
            Thread.sleep(1000);
            long[] current = totals();
            double download = Math.max(0, current[0] - previous[0]) * 8.0 / 1_000_000;
            double upload = Math.max(0, current[1] - previous[1]) * 8.0 / 1_000_000;
            System.out.printf(Locale.US, "{\"download_mbps\":%.3f,\"upload_mbps\":%.3f,\"bytes_recebidos\":%d,\"bytes_enviados\":%d}%n", download, upload, current[0], current[1]);
            previous = current;
        }
    }
}
