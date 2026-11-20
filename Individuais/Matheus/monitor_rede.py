import mysql.connector

METRICAS_REDE = (
    ("rede_download_mbps", "Rede Download", "Mbps"),
    ("rede_upload_mbps", "Rede Upload", "Mbps"),
    ("rede_latencia_ms", "Rede Latencia", "ms"),
    ("rede_perda_pacotes", "Rede Perda de Pacotes", "%"),
    ("rede_erros_entrada", "Rede Erros de Entrada", "pacotes"),
    ("rede_erros_saida", "Rede Erros de Saida", "pacotes"),
    ("rede_descartes_entrada", "Rede Descartes de Entrada", "pacotes"),
    ("rede_colisoes", "Rede Colisoes", "eventos"),
    ("rede_disponibilidade", "Rede Disponibilidade", "%"),
)

METRICAS_REDE_DESCRICOES = tuple(descricao for descricao, _, _ in METRICAS_REDE)

# descricao no banco -> campo devolvido para a página
CAMPOS_REDE = {
    "rede_download_mbps": "download_mbps",
    "rede_upload_mbps": "upload_mbps",
    "rede_latencia_ms": "latencia_ms",
    "rede_perda_pacotes": "perda_pacotes",
    "rede_erros_entrada": "erros_entrada",
    "rede_erros_saida": "erros_saida",
    "rede_descartes_entrada": "descartes_entrada",
    "rede_colisoes": "colisoes",
    "rede_disponibilidade": "disponibilidade",
}


def preparar_especificacoes_rede(config_banco, id_servidor):
    """Cria (se faltarem) tipo, componente, métrica e especificação das métricas de rede."""
    conexao = mysql.connector.connect(**config_banco)
    cursor = None

    try:
        cursor = conexao.cursor(dictionary=True)

        cursor.execute("SELECT id FROM servidor WHERE id = %s", (id_servidor,))
        if cursor.fetchone() is None:
            raise ValueError(f"ID_SERVIDOR={id_servidor} não existe na tabela servidor.")
        for descricao, tipo, unidade in METRICAS_REDE:
            cursor.execute(
                "SELECT id FROM tipo_componente WHERE nome = %s LIMIT 1",
                (tipo,),
            )
            tipo_linha = cursor.fetchone()
            if tipo_linha is None:
                cursor.execute(
                    "INSERT INTO tipo_componente (nome, unidade_medida) VALUES (%s, %s)",
                    (tipo, unidade),
                )
                tipo_id = cursor.lastrowid
            else:
                tipo_id = tipo_linha["id"]

            cursor.execute(
                "SELECT id FROM componente WHERE fk_tipo_componente = %s AND descricao = %s LIMIT 1",
                (tipo_id, descricao),
            )
            componente_linha = cursor.fetchone()
            if componente_linha is None:
                cursor.execute(
                    "INSERT INTO componente (descricao, fk_tipo_componente) VALUES (%s, %s)",
                    (descricao, tipo_id),
                )
                componente_id = cursor.lastrowid
            else:
                componente_id = componente_linha["id"]

            cursor.execute(
                """
                SELECT id FROM especificacao_tecnica
                WHERE fk_servidor = %s AND fk_componente = %s AND ativo = 1
                LIMIT 1
                """,
                (id_servidor, componente_id),
            )
            if cursor.fetchone() is None:
                cursor.execute(
                    "INSERT INTO metrica (limite_atencao, limite_critico) VALUES (0, 0)"
                )
                metrica_id = cursor.lastrowid
                cursor.execute(
                    """
                    INSERT INTO especificacao_tecnica
                        (fk_servidor, fk_componente, fk_metrica, ativo)
                    VALUES (%s, %s, %s, 1)
                    """,
                    (id_servidor, componente_id, metrica_id),
                )

        conexao.commit()
        print(f"[OK] Especificações de rede prontas para o servidor {id_servidor}.")
    except Exception:
        conexao.rollback()
        raise
    finally:
        if cursor is not None:
            cursor.close()
        conexao.close()


def buscar_metricas_rede(config_banco, id_servidor, limite=60):
    """Histórico das últimas coletas de rede do servidor, no mesmo formato de buscar_metricas_cpu."""
    conexao = mysql.connector.connect(**config_banco)
    cursor = None

    try:
        cursor = conexao.cursor(dictionary=True)

        marcadores = ", ".join(["%s"] * len(METRICAS_REDE_DESCRICOES))
        cursor.execute(
            f"""
            SELECT c.descricao, cap.valor, cap.horario,
                   TIMESTAMPDIFF(SECOND, cap.horario, NOW()) AS idade_segundos
            FROM captura cap
            JOIN especificacao_tecnica et ON et.id = cap.fk_especificacao_tecnica
            JOIN componente c ON c.id = et.fk_componente
            WHERE et.fk_servidor = %s
              AND et.ativo = 1
              AND c.descricao IN ({marcadores})
            ORDER BY cap.horario DESC, cap.id DESC
            LIMIT %s
            """,
            (id_servidor, *METRICAS_REDE_DESCRICOES, limite * len(METRICAS_REDE_DESCRICOES)),
        )

        linhas = cursor.fetchall()
        if not linhas:
            return None

        # Agrupa as leituras por horário (HH:MM:SS): cada coleta grava as métricas no mesmo instante
        por_horario = {}
        for linha in reversed(linhas):
            hora_str = linha["horario"].strftime("%H:%M:%S")
            registro = por_horario.setdefault(
                hora_str,
                {
                    "id_servidor": id_servidor,
                    "horario": hora_str,
                    **{campo: None for campo in CAMPOS_REDE.values()},
                },
            )
            campo = CAMPOS_REDE.get(linha["descricao"])
            if campo is not None:
                registro[campo] = float(linha["valor"])
            registro["idade_segundos"] = int(linha["idade_segundos"])

        return list(por_horario.values())[-limite:]
    finally:
        if cursor is not None:
            cursor.close()
        conexao.close()


def gravar_metricas_rede(config_banco, id_servidor, dados):
    """Grava no banco a coleta de rede produzida pelo NetworkMonitor.java."""
    conexao = mysql.connector.connect(**config_banco)
    cursor = None
    try:
        cursor = conexao.cursor(dictionary=True)
        cursor.execute("SELECT id FROM servidor WHERE id = %s", (id_servidor,))
        if cursor.fetchone() is None:
            raise ValueError(f"ID_SERVIDOR={id_servidor} não existe na tabela servidor.")
        cursor.execute("SET @horario_coleta_rede = NOW()")

        valores = {
            "rede_download_mbps": dados.get("download_mbps"),
            "rede_upload_mbps": dados.get("upload_mbps"),
            "rede_latencia_ms": dados.get("latencia_ms"),
            "rede_perda_pacotes": dados.get("perda_pacotes"),
            "rede_erros_entrada": dados.get("erros_entrada"),
            "rede_erros_saida": dados.get("erros_saida"),
            "rede_descartes_entrada": dados.get("descartes_entrada"),
            "rede_colisoes": dados.get("colisoes"),
            "rede_disponibilidade": dados.get("disponibilidade"),
        }
        for descricao_chave, valor in valores.items():
            if valor is None:
                continue
            cursor.execute(
                """
                SELECT et.id, m.limite_atencao, m.limite_critico
                FROM especificacao_tecnica et
                JOIN componente c ON c.id = et.fk_componente
                JOIN metrica m ON m.id = et.fk_metrica
                WHERE et.fk_servidor = %s AND et.ativo = 1 AND c.descricao = %s
                LIMIT 1
                """,
                (id_servidor, descricao_chave),
            )
            especificacao = cursor.fetchone()
            if especificacao is None:
                continue
            cursor.execute(
                "SELECT valor FROM captura WHERE fk_especificacao_tecnica = %s ORDER BY horario DESC, id DESC LIMIT 1",
                (especificacao["id"],),
            )
            leitura_anterior = cursor.fetchone()
            limite_atencao = float(especificacao["limite_atencao"] or 0)
            limite_critico = float(especificacao["limite_critico"] or 0)

            def nivel(valor_atual):
                if limite_critico > 0 and valor_atual >= limite_critico:
                    return "CRITICO"
                if limite_atencao > 0 and valor_atual >= limite_atencao:
                    return "ATENCAO"
                return None

            nivel_anterior = nivel(float(leitura_anterior["valor"])) if leitura_anterior else None
            cursor.execute(
                "INSERT INTO captura (valor, horario, fk_especificacao_tecnica) VALUES (%s, @horario_coleta_rede, %s)",
                (float(valor), especificacao["id"]),
            )
            nivel_atual = nivel(float(valor))
            if nivel_atual is not None and nivel_atual != nivel_anterior:
                cursor.execute(
                    "INSERT INTO alerta (fk_captura, nivel, data) VALUES (%s, %s, @horario_coleta_rede)",
                    (cursor.lastrowid, nivel_atual),
                )
        conexao.commit()
    except Exception:
        conexao.rollback()
        raise
    finally:
        if cursor is not None:
            cursor.close()
        conexao.close()
