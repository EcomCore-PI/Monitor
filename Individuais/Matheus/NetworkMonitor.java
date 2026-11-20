import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.NetworkInterface;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Enumeration;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/** Coleta métricas da rede da instância e imprime uma linha JSON. */
public class NetworkMonitor {
    private static final class Totals {
        long received, sent, receiveErrors, sendErrors, receiveDrops, collisions;
    }

    private static Totals totals() throws Exception {
        Totals totals = new Totals();
        Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
        while (interfaces.hasMoreElements()) {
            NetworkInterface nic = interfaces.nextElement();
            if (nic.isLoopback() || !nic.isUp()) continue;
            Path stats = Path.of("/sys/class/net", nic.getName(), "statistics");
            totals.received += read(stats.resolve("rx_bytes"));
            totals.sent += read(stats.resolve("tx_bytes"));
            totals.receiveErrors += read(stats.resolve("rx_errors"));
            totals.sendErrors += read(stats.resolve("tx_errors"));
            totals.receiveDrops += read(stats.resolve("rx_dropped"));
            totals.collisions += read(stats.resolve("collisions"));
        }
        return totals;
    }

    private static long read(Path path) {
        try { return Long.parseLong(Files.readString(path).trim()); }
        catch (Exception ignored) { return 0; }
    }

    private static String ping(String target) {
        boolean windows = System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win");
        try {
            Process process = new ProcessBuilder(windows
                ? new String[]{"ping", "-n", "1", "-w", "1000", target}
                : new String[]{"ping", "-c", "1", "-W", "1", target})
                .redirectErrorStream(true).start();
            String output;
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                StringBuilder text = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) text.append(line).append('\n');
                output = text.toString();
            }
            if (!process.waitFor(3, TimeUnit.SECONDS)) { process.destroyForcibly(); return "null,100"; }
            java.util.regex.Matcher loss = java.util.regex.Pattern.compile("(?i)(\\d+(?:\\.\\d+)?)%\\s*(?:packet )?loss").matcher(output);
            double packetLoss = loss.find() ? Double.parseDouble(loss.group(1)) : (process.exitValue() == 0 ? 0 : 100);
            java.util.regex.Matcher latency = java.util.regex.Pattern.compile(
                "(?i)min/avg/max(?:/mdev)?\\s*=\\s*[\\d.]+/([\\d.]+)|Average\\s*=\\s*([\\d.]+)"
            ).matcher(output);
            String latencyValue = "null";
            if (latency.find() && packetLoss < 100) {
                latencyValue = latency.group(1) != null ? latency.group(1) : latency.group(2);
            }
            return latencyValue + "," + packetLoss;
        } catch (Exception ignored) { return "null,100"; }
    }

    public static void main(String[] args) throws Exception {
        Totals previous = totals();
        Thread.sleep(1000);
        Totals current = totals();
        double download = Math.max(0, current.received - previous.received) * 8.0 / 1_000_000;
        double upload = Math.max(0, current.sent - previous.sent) * 8.0 / 1_000_000;
        String[] ping = ping(System.getenv().getOrDefault("NETWORK_PING_TARGET", "8.8.8.8")).split(",");
        System.out.printf(Locale.US,
            "{\"download_mbps\":%.3f,\"upload_mbps\":%.3f,\"bytes_recebidos\":%d,\"bytes_enviados\":%d,\"latencia_ms\":%s,\"perda_pacotes\":%s,\"erros_entrada\":%d,\"erros_saida\":%d,\"descartes_entrada\":%d,\"colisoes\":%d,\"disponibilidade\":%.1f}%n",
            download, upload, current.received, current.sent, ping[0], ping[1],
            current.receiveErrors, current.sendErrors, current.receiveDrops, current.collisions,
            100.0 - Double.parseDouble(ping[1]));

    }
}
