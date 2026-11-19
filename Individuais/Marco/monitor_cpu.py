import os
import psutil
import mysql.connector

METRICAS_CPU_DESCRICOES = (
    "cpu_user",
    "cpu_system",
    "cpu_iowait",
    "cpu_steal",
    "load_1min",
    "cpu_nucleo_0",
    "cpu_nucleo_1",
    "cpu_nucleo_2",
    "cpu_nucleo_3",
)


def coletar_metricas_detalhadas_cpu():
    times = psutil.cpu_times_percent(interval=1)
    nucleos = psutil.cpu_percent(percpu=True)

    dados = {
        "cpu_user": float(times.user),
        "cpu_system": float(times.system),
        "cpu_iowait": float(getattr(times, "iowait", 0.0)),
        "cpu_steal": float(getattr(times, "steal", 0.0)),
        "load_1min": float(os.getloadavg()[0]) if hasattr(os, "getloadavg") else 0.0,
    }

    for idx, valor_nucleo in enumerate(nucleos):
        dados[f"cpu_nucleo_{idx}"] = float(valor_nucleo)

    return dados


def gravar_metricas_cpu(config_banco, id_servidor):
    dados = coletar_metricas_detalhadas_cpu()
    conexao = mysql.connector.connect(**config_banco)
    cursor = None

    try:
        cursor = conexao.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT et.id AS especificacao_id, c.descricao
            FROM especificacao_tecnica et
            JOIN componente c ON c.id = et.fk_componente
            WHERE et.fk_servidor = %s
              AND et.ativo = 1
              AND c.descricao IN (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (id_servidor, *METRICAS_CPU_DESCRICOES),
        )

        mapa_especificacoes = {
            linha["descricao"]: linha["especificacao_id"]
            for linha in cursor.fetchall()
        }

        for descricao, valor in dados.items():
            especificacao_id = mapa_especificacoes.get(descricao)
            if especificacao_id is None:
                continue

            cursor.execute(
                """
                INSERT INTO captura (valor, horario, fk_especificacao_tecnica)
                VALUES (%s, NOW(), %s)
                """,
                (valor, especificacao_id),
            )

        conexao.commit()
        return dados
    except Exception:
        conexao.rollback()
        raise
    finally:
        if cursor is not None:
            cursor.close()
        conexao.close()


def buscar_metricas_cpu(config_banco, id_servidor, limite=15):
    conexao = mysql.connector.connect(**config_banco)
    cursor = None

    try:
        cursor = conexao.cursor(dictionary=True)

        # Busca as últimas leituras de cada métrica detalhada de CPU
        cursor.execute(
            """
            SELECT c.descricao, cap.valor, cap.horario
            FROM captura cap
            JOIN especificacao_tecnica et ON et.id = cap.fk_especificacao_tecnica
            JOIN componente c ON c.id = et.fk_componente
            WHERE et.fk_servidor = %s
              AND et.ativo = 1
              AND c.descricao IN (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ORDER BY cap.horario DESC, cap.id DESC
            LIMIT %s
            """,
            (id_servidor, *METRICAS_CPU_DESCRICOES, limite * len(METRICAS_CPU_DESCRICOES)),
        )

        linhas = cursor.fetchall()
        if not linhas:
            return None

        # Agrupa as leituras por horário (HH:MM:SS) para montar o histórico do gráfico
        por_horario = {}
        for linha in reversed(linhas):
            hora_str = linha["horario"].strftime("%H:%M:%S")
            registro = por_horario.setdefault(
                hora_str,
                {
                    "horario": hora_str,
                    "cpu_user": 0.0,
                    "cpu_system": 0.0,
                    "cpu_iowait": 0.0,
                    "cpu_steal": 0.0,
                    "load_1min": 0.0,
                    "nucleos_map": {},
                },
            )
            desc = linha["descricao"]
            val = float(linha["valor"])

            if desc.startswith("cpu_nucleo_"):
                idx = int(desc.split("_")[-1])
                registro["nucleos_map"][idx] = val
            else:
                registro[desc] = val

        historico = []
        for hora_str, item in por_horario.items():
            nucleos_ordenados = [
                item["nucleos_map"][k] for k in sorted(item["nucleos_map"].keys())
            ]
            historico.append({
                "horario": item["horario"],
                "cpu_user": item["cpu_user"],
                "cpu_system": item["cpu_system"],
                "cpu_iowait": item["cpu_iowait"],
                "cpu_steal": item["cpu_steal"],
                "load_1min": item["load_1min"],
                "cpu_por_nucleo": nucleos_ordenados,
            })

        return historico[-limite:]
    finally:
        if cursor is not None:
            cursor.close()
        conexao.close()