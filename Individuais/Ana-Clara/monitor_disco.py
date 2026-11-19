"""Coleta, grava e consulta o histórico detalhado de armazenamento."""

import os
import psutil
import mysql.connector


METRICAS_DISCO = {
    "disco_percentual": ("Uso de disco (%)", 80, 90),
    "disco_usado_gb": ("Disco usado (GB)", 0, 0),
    "disco_livre_gb": ("Disco livre (GB)", 0, 0),
    "disco_total_gb": ("Disco total (GB)", 0, 0),
}


def coletar_dados_disco(caminho=None):
    if caminho is None:
        caminho = os.path.abspath(os.sep)
    uso = psutil.disk_usage(caminho)
    gb = 1024 ** 3
    return {
        "disco_percentual": float(uso.percent),
        "disco_usado_gb": round(uso.used / gb, 2),
        "disco_livre_gb": round(uso.free / gb, 2),
        "disco_total_gb": round(uso.total / gb, 2),
    }


def preparar_especificacoes_disco(config_banco, id_servidor):
    """Cria componentes/especificações detalhadas se ainda não existirem."""
    conexao = mysql.connector.connect(**config_banco)
    cursor = None
    try:
        cursor = conexao.cursor(dictionary=True)
        cursor.execute(
            "SELECT id FROM tipo_componente WHERE nome = %s LIMIT 1", ("Disco",)
        )
        tipo = cursor.fetchone()
        if tipo is None:
            raise ValueError("O tipo de componente 'Disco' não está cadastrado.")

        for descricao, limite_atencao, limite_critico in METRICAS_DISCO.values():
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


def gravar_metricas_disco(config_banco, id_servidor):
    dados = coletar_dados_disco()
    descricoes = tuple(item[0] for item in METRICAS_DISCO.values())
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
        for chave, (descricao, _, _) in METRICAS_DISCO.items():
            especificacao_id = especificacoes.get(descricao)
            if especificacao_id is not None:
                cursor.execute(
                    "INSERT INTO captura (valor, horario, fk_especificacao_tecnica) VALUES (%s, NOW(), %s)",
                    (dados[chave], especificacao_id),
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


def buscar_metricas_disco(config_banco, id_servidor, limite=30):
    descricoes = tuple(item[0] for item in METRICAS_DISCO.values())
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
            chave = next((key for key, item in METRICAS_DISCO.items() if item[0] == row["descricao"]), None)
            if chave:
                registro[chave] = float(row["valor"])
        return list(por_horario.values())[-limite:]
    finally:
        if cursor is not None:
            cursor.close()
        conexao.close()
