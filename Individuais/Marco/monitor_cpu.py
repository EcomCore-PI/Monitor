import os
import psutil

def coletar_dados_cpu():
    times = psutil.cpu_times_percent(interval=1)
    return {
        "cpu_user": times.user,
        "cpu_system": times.system,
        "cpu_iowait": getattr(times, "iowait", 0.0),
        "cpu_steal": getattr(times, "steal", 0.0),
        "load_1min": os.getloadavg()[0] if hasattr(os, "getloadavg") else 0.0,
        "cpu_por_nucleo": psutil.cpu_percent(percpu=True)
    }