"""Coleta métricas de memória RAM usando psutil."""
import psutil

def coletar_dados_memoria():
    memoria = psutil.virtual_memory()
    gb = 1024 ** 3
    return {
        "ram_total_gb": round(memoria.total / gb, 2),
        "ram_usada_gb": round(memoria.used / gb, 2),
        "ram_disponivel_gb": round(memoria.available / gb, 2),
        "ram_percentual": memoria.percent,
    }
