#!/bin/bash
set -e

TIPO="${TIPO_MONITOR:-geral}"

# Sobe sempre o servidor HTTP/API das dashboards
python -u servidor.py &

# Escolhe qual coletor vai rodar nesta instância
case "$TIPO" in
  cpu)
    echo "[MONITOR] Iniciando coleta individual de CPU..."
    python -u Individuais/Marco/monitor_cpu.py &
    ;;
  memoria)
    echo "[MONITOR] Iniciando coleta individual de MEMÓRIA..."
    python -u Individuais/João-Miguel/monitor_memoria.py &
    ;;
  disco)
    echo "[MONITOR] Iniciando coleta individual de DISCO..."
    python -u Individuais/Ana-Clara/monitor_disco.py &
    ;;
  rede)
    echo "[MONITOR] Iniciando coleta individual de REDE..."
    python -u Individuais/Matheus/monitor_rede.py &
    ;;
  none|off|painel)
    echo "[MONITOR] Modo somente painel web (coleta desativada nesta instância)."
    ;;
  *)
    echo "[MONITOR] Iniciando coleta GERAL (captura.jar)..."
    java -jar /app/captura.jar &
    ;;
esac

# Se qualquer processo em segundo plano encerrar, reinicia o container
wait -n
exit 1