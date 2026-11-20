"""Coleta, grava e consulta o histórico detalhado de memória RAM."""

import psutil
import mysql.connector
from datetime import datetime


METRICAS_MEMORIA = {
    "ram_percentual": ("Uso de RAM (%)", 80, 90),
    "ram_usada_gb": ("RAM usada (GB)", 0, 0),
    "ram_disponivel_gb": ("RAM disponível (GB)", 0, 0),
    "ram_total_gb": ("RAM total (GB)", 0, 0),
}


def coletar_dados_memoria():
    memoria = psutil.virtual_memory()
    gb = 1024 ** 3
    return {
        "ram_percentual": float(memoria.percent),
        "ram_usada_gb": round(memoria.used / gb, 2),
        "ram_disponivel_gb": round(memoria.available / gb, 2),
        "ram_total_gb": round(memoria.total / gb, 2),
    }


def preparar_especificacoes_memoria(config_banco, id_servidor):
    """Cria componentes/especificações detalhadas se ainda não existirem."""
    conexao = mysql.connector.connect(**config_banco)
    cursor = None
    try:
        cursor = conexao.cursor(dictionary=True)
        cursor.execute(
            "SELECT id FROM tipo_componente WHERE nome = %s LIMIT 1", ("RAM",)
        )
        tipo = cursor.fetchone()
        if tipo is None:
            raise ValueError("O tipo de componente 'RAM' não está cadastrado.")

        for descricao, limite_atencao, limite_critico in METRICAS_MEMORIA.values():
            cursor.execute(
                "SELECT id FROM componente WHERE fk_tipo_componente = %s AND descricao = %s LIMIT 1",
                (tipo["id"], descricao),
            )
            componente = cursor.fetchone()
            if componente is None:
                cursor.execute(
                    "INSERT INTO componente (descricao, fk_tipo_componente) VALUES (%s, %s)",
                    (descricao, tipo["id"]),
                )
                componente_id = cursor.lastrowid
            else:
                componente_id = componente["id"]

            cursor.execute(
                "SELECT id FROM especificacao_tecnica WHERE fk_servidor = %s AND fk_componente = %s AND ativo = 1 LIMIT 1",
                (id_servidor, componente_id),
            )
            if cursor.fetchone() is not None:
                continue

            cursor.execute(
                "INSERT INTO metrica (limite_atencao, limite_critico) VALUES (%s, %s)",
                (limite_atencao, limite_critico),
            )
            metrica_id = cursor.lastrowid
            cursor.execute(
                "INSERT INTO especificacao_tecnica (fk_servidor, fk_componente, fk_metrica, ativo) VALUES (%s, %s, %s, 1)",
                (id_servidor, componente_id, metrica_id),
            )

        conexao.commit()
    except Exception:
        conexao.rollback()
        raise
    finally:
        if cursor is not None:
            cursor.close()
        conexao.close()


def gravar_metricas_memoria(config_banco, id_servidor):
    dados = coletar_dados_memoria()
    horario_coleta = datetime.now()
    descricoes = tuple(item[0] for item in METRICAS_MEMORIA.values())
    conexao = mysql.connector.connect(**config_banco)
    cursor = None
    try:
        cursor = conexao.cursor(dictionary=True)
        marcadores = ", ".join(["%s"] * len(descricoes))
        cursor.execute(
            f"""
            SELECT et.id AS especificacao_id, c.descricao
            FROM especificacao_tecnica et
            JOIN componente c ON c.id = et.fk_componente
            WHERE et.fk_servidor = %s AND et.ativo = 1
              AND c.descricao IN ({marcadores})
            """,
            (id_servidor, *descricoes),
        )
        especificacoes = {row["descricao"]: row["especificacao_id"] for row in cursor.fetchall()}
        for chave, (descricao, _, _) in METRICAS_MEMORIA.items():
            especificacao_id = especificacoes.get(descricao)
            if especificacao_id is not None:
                cursor.execute(
                    "INSERT INTO captura (valor, horario, fk_especificacao_tecnica) VALUES (%s, %s, %s)",
                    (dados[chave], horario_coleta, especificacao_id),
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


def buscar_metricas_memoria(config_banco, id_servidor, limite=30):
    descricoes = tuple(item[0] for item in METRICAS_MEMORIA.values())
    conexao = mysql.connector.connect(**config_banco)
    cursor = None
    try:
        cursor = conexao.cursor(dictionary=True)
        marcadores = ", ".join(["%s"] * len(descricoes))
        cursor.execute(
            f"""
            SELECT c.descricao, cap.valor, cap.horario
            FROM captura cap
            JOIN especificacao_tecnica et ON et.id = cap.fk_especificacao_tecnica
            JOIN componente c ON c.id = et.fk_componente
            WHERE et.fk_servidor = %s AND et.ativo = 1
              AND c.descricao IN ({marcadores})
            ORDER BY cap.horario DESC, cap.id DESC
            LIMIT %s
            """,
            (id_servidor, *descricoes, limite * len(descricoes)),
        )
        por_horario = {}
        for row in reversed(cursor.fetchall()):
            hora = row["horario"].strftime("%H:%M:%S")
            registro = por_horario.setdefault(hora, {"horario": hora})
            chave = next((key for key, item in METRICAS_MEMORIA.items() if item[0] == row["descricao"]), None)
            if chave:
                registro[chave] = float(row["valor"])
        return list(por_horario.values())[-limite:]
    finally:
        if cursor is not None:
            cursor.close()
        conexao.close()


def buscar_comparativo_memoria_por_hora(config_banco, id_servidor):
    """Retorna médias de RAM usada/disponível agrupadas pela hora do dia."""
    descricoes = tuple(item[0] for item in METRICAS_MEMORIA.values())
    conexao = mysql.connector.connect(**config_banco)
    cursor = None
    try:
        cursor = conexao.cursor(dictionary=True)
        marcadores = ", ".join(["%s"] * len(descricoes))
        cursor.execute(
            f"""
            SELECT
                HOUR(cap.horario) AS hora,
                AVG(CASE WHEN c.descricao = %s THEN cap.valor END) AS ram_usada_gb,
                AVG(CASE WHEN c.descricao = %s THEN cap.valor END) AS ram_disponivel_gb,
                AVG(CASE WHEN c.descricao = %s THEN cap.valor END) AS ram_percentual,
                COUNT(DISTINCT DATE(cap.horario)) AS dias_amostrados
            FROM captura cap
            JOIN especificacao_tecnica et ON et.id = cap.fk_especificacao_tecnica
            JOIN componente c ON c.id = et.fk_componente
            WHERE et.fk_servidor = %s AND et.ativo = 1
              AND c.descricao IN ({marcadores})
            GROUP BY HOUR(cap.horario)
            ORDER BY hora
            """,
            (METRICAS_MEMORIA["ram_usada_gb"][0],
             METRICAS_MEMORIA["ram_disponivel_gb"][0],
             METRICAS_MEMORIA["ram_percentual"][0],
             id_servidor, *descricoes),
        )
        return [
            {
                "hora": int(row["hora"]),
                "ram_usada_gb": round(float(row["ram_usada_gb"] or 0), 2),
                "ram_disponivel_gb": round(float(row["ram_disponivel_gb"] or 0), 2),
                "ram_percentual": round(float(row["ram_percentual"] or 0), 1),
                "dias_amostrados": int(row["dias_amostrados"] or 0),
            }
            for row in cursor.fetchall()
        ]
    finally:
        if cursor is not None:
            cursor.close()
        conexao.close()
