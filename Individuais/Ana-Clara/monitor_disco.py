"""Coleta métricas do volume principal usando psutil."""
import psutil

def coletar_dados_disco(caminho="/"):
    # No Windows, usa o volume do sistema quando o caminho padrão não existir.
    try:
        uso = psutil.disk_usage(caminho)
    except (FileNotFoundError, OSError):
        uso = psutil.disk_usage("C:\\")
    gb = 1024 ** 3
    return {
        "disco_total_gb": round(uso.total / gb, 2),
        "disco_usado_gb": round(uso.used / gb, 2),
        "disco_livre_gb": round(uso.free / gb, 2),
        "disco_percentual": uso.percent,
    }
