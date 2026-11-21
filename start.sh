#!/bin/bash
set -e

TIPO="${TIPO_MONITOR:-geral}"

case "$TIPO" in
  none|off|painel)
    echo "[MONITOR] Modo somente painel web (coleta desativada nesta instância)."
    ;;
  *)
    echo "[MONITOR] Coleta desta instância: $TIPO"
    ;;
esac

exec python -u servidor.py