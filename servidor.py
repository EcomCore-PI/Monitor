from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime
from urllib.parse import urlparse, parse_qs
import json
import os
import threading
import time
import subprocess
import urllib.request
from importlib import import_module
import mysql.connector
import psutil
from Individuais.Marco.monitor_cpu import gravar_metricas_cpu, buscar_metricas_cpu

monitor_memoria = import_module("Individuais.João-Miguel.monitor_memoria")
monitor_disco = import_module("Individuais.Ana-Clara.monitor_disco")
monitor_rede = import_module("Individuais.Matheus.monitor_rede")


# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
PASTA_ATUAL = os.path.dirname(os.path.abspath(__file__))
CAMINHO_ENV = os.environ.get("ENV_PATH") or next(
    (
        c for c in (
            os.path.join(PASTA_ATUAL, ".env.dev"),
            os.path.abspath(os.path.join(PASTA_ATUAL, "..", "..", ".env.dev")),
        )
        if os.path.exists(c)
    ),
    os.path.join(PASTA_ATUAL, ".env.dev"),
)
INTERVALO_GRAVACAO = 15
INTERVALO_GRAVACAO_REDE = 3
LIMITE_HISTORICO = 30
LIMITE_ALERTAS = 50


def carregar_env(caminho):
    variaveis = {}
    try:
        with open(caminho, encoding="utf-8") as arquivo:
            for linha in arquivo:
                linha = linha.strip()
                if not linha or linha.startswith("#") or "=" not in linha:
                    continue
                chave, valor = linha.split("=", 1)
                variaveis[chave.strip()] = valor.strip().strip("\"'")
    except FileNotFoundError as erro:
        raise RuntimeError(f"Arquivo .env.dev não encontrado: {caminho}") from erro
    return variaveis


ENV = carregar_env(CAMINHO_ENV)
COLETAR = ENV.get("COLETAR_METRICAS", "true").strip().lower() not in ("0", "false", "nao", "não", "no")
SLACK_WEBHOOK_URL = ENV.get("SLACK_WEBHOOK_URL")
CONFIG_BANCO = {
    "host": ENV.get("DB_HOST"),
    "user": ENV.get("DB_USER"),
    "password": ENV.get("DB_PASSWORD"),
    "database": ENV.get("DB_DATABASE"),
    "port": int(ENV.get("DB_PORT", 3306)),
    "connection_timeout": 10,
}

if not all((CONFIG_BANCO["host"], CONFIG_BANCO["user"], CONFIG_BANCO["database"])):
    raise RuntimeError("Configure DB_HOST, DB_USER e DB_DATABASE no .env.dev.")

try:
    ID_SERVIDOR = int(ENV["ID_SERVIDOR"])
except (KeyError, ValueError) as erro:
    raise RuntimeError("Configure ID_SERVIDOR com o ID cadastrado em servidor.") from erro

# Chaves iguais a tipo_componente.nome; valores iguais aos campos coletados abaixo.
RECURSOS = {
    "CPU": "cpu_percent",
    "RAM": "memoria_percent",
    "Disco": "disco_percent",
    "Rede Recebida": "rede_recebida_mib",
    "Rede Enviada": "rede_enviada_mib",
}
RECURSOS_OBRIGATORIOS = {"CPU", "RAM", "Disco"}

# ---------------------------------------------------------------------------
# Tipo de monitoramento desta instância.
# Cada instância coleta apenas o componente do TIPO_MONITOR:
#   cpu | memoria | disco | rede | geral (todos; padrão se não definido)
# Qualquer outro valor (painel, none, off) = somente painel web, sem coleta.
# O valor pode vir do .env.dev ou das variáveis de ambiente do container (.env).
# ---------------------------------------------------------------------------
TIPO_MONITOR = (
    ENV.get("TIPO_MONITOR") or os.environ.get("TIPO_MONITOR") or "geral"
).strip().lower()
TIPOS_POR_MONITOR = {
    "cpu": {"CPU"},
    "memoria": {"RAM"},
    "ram": {"RAM"},
    "disco": {"Disco"},
    "rede": {"Rede Recebida", "Rede Enviada"},
    "geral": set(RECURSOS),
}
RECURSOS_ATIVOS = TIPOS_POR_MONITOR.get(TIPO_MONITOR, set())
RECURSOS_OBRIGATORIOS_ATIVOS = RECURSOS_OBRIGATORIOS & RECURSOS_ATIVOS
COLETAR = COLETAR and bool(RECURSOS_ATIVOS)


# ---------------------------------------------------------------------------
# Coleta na máquina onde este programa está rodando
# ---------------------------------------------------------------------------
def coletar_metricas_rede_instancia():
    caminho_java = os.environ.get("NETWORK_MONITOR_CLASS_PATH")
    if caminho_java:
        comando_java = ["java", "-cp", caminho_java, "NetworkMonitor"]
    else:
        caminho_fonte = os.path.join(PASTA_ATUAL, "Individuais", "Matheus", "NetworkMonitor.java")
        comando_java = ["java", caminho_fonte]
    processo = subprocess.run(
        comando_java, capture_output=True, text=True, check=True, timeout=20
    )
    return json.loads(processo.stdout.strip().splitlines()[-1])


def coletar_dados():
    """Coleta somente os recursos do TIPO_MONITOR desta instância."""
    dados = {}

    if "CPU" in RECURSOS_ATIVOS:
        dados["cpu_percent"] = float(psutil.cpu_percent(interval=1))

    if "RAM" in RECURSOS_ATIVOS:
        dados["memoria_percent"] = float(psutil.virtual_memory().percent)

    if "Disco" in RECURSOS_ATIVOS:
        caminho_disco = os.path.abspath(os.sep)
        dados["disco_percent"] = float(psutil.disk_usage(caminho_disco).percent)

    if "Rede Recebida" in RECURSOS_ATIVOS or "Rede Enviada" in RECURSOS_ATIVOS:
        # Contadores de rede coletados pelo NetworkMonitor.java nesta instância.
        rede = coletar_metricas_rede_instancia()
        dados["rede_recebida_mib"] = rede["bytes_recebidos"] / (1024 ** 2)
        dados["rede_enviada_mib"] = rede["bytes_enviados"] / (1024 ** 2)

    return dados


# ---------------------------------------------------------------------------
# Provisiona especificações técnicas automaticamente.
# Regra solicitada: fk_metrica recebe o mesmo ID do componente.
# ---------------------------------------------------------------------------
def preparar_especificacoes():
    conexao = mysql.connector.connect(**CONFIG_BANCO)
    cursor = None

    try:
        cursor = conexao.cursor(dictionary=True)
        cursor.execute("SELECT id FROM servidor WHERE id = %s", (ID_SERVIDOR,))
        if cursor.fetchone() is None:
            raise ValueError(
                f"ID_SERVIDOR={ID_SERVIDOR} não existe na tabela servidor. "
                "Cadastre o servidor e confira o .env.dev."
            )

        # CPU, RAM e Disco usam os componentes e métricas já definidos pelo projeto.
        # RAM e Disco recebem especificações próprias dos coletores individuais.
        for tipo in ("CPU",):
            cursor.execute(
                """
                SELECT c.id AS componente_id
                FROM componente c
                JOIN tipo_componente tc ON tc.id = c.fk_tipo_componente
                WHERE tc.nome = %s
                ORDER BY c.id
                LIMIT 1
                """,
                (tipo,),
            )
            componente = cursor.fetchone()
            if componente is None:
                raise ValueError(f"Não há componente cadastrado para o tipo '{tipo}'.")

            componente_id = componente["componente_id"]
            metrica_id = componente_id

            cursor.execute("SELECT id FROM metrica WHERE id = %s", (metrica_id,))
            if cursor.fetchone() is None:
                raise ValueError(
                    f"O componente {componente_id} ({tipo}) precisa da métrica "
                    f"{metrica_id}, mas esse ID não existe em metrica."
                )

            cursor.execute(
                """
                SELECT id, fk_metrica
                FROM especificacao_tecnica
                WHERE fk_servidor = %s
                  AND fk_componente = %s
                  AND ativo = 1
                ORDER BY id
                LIMIT 1
                """,
                (ID_SERVIDOR, componente_id),
            )
            especificacao = cursor.fetchone()

            if especificacao is None:
                cursor.execute(
                    """
                    INSERT INTO especificacao_tecnica
                        (fk_servidor, fk_componente, fk_metrica, ativo)
                    VALUES (%s, %s, %s, 1)
                    """,
                    (ID_SERVIDOR, componente_id, metrica_id),
                )
            elif especificacao["fk_metrica"] != metrica_id:
                cursor.execute(
                    "UPDATE especificacao_tecnica SET fk_metrica = %s WHERE id = %s",
                    (metrica_id, especificacao["id"]),
                )

        # O esquema original tem apenas o tipo genérico "Rede". Criamos tipos
        # separados para manter recebimento e envio identificáveis em captura.
        for tipo, descricao in (
            ("Rede Recebida", "Contador de bytes recebidos"),
            ("Rede Enviada", "Contador de bytes enviados"),
        ):
            cursor.execute("SELECT id FROM tipo_componente WHERE nome = %s LIMIT 1", (tipo,))
            tipo_linha = cursor.fetchone()
            if tipo_linha is None:
                cursor.execute(
                    "INSERT INTO tipo_componente (nome, unidade_medida) VALUES (%s, 'MiB')",
                    (tipo,),
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
                "SELECT id FROM especificacao_tecnica WHERE fk_servidor = %s AND fk_componente = %s AND ativo = 1 LIMIT 1",
                (ID_SERVIDOR, componente_id),
            )
            if cursor.fetchone() is None:
                cursor.execute(
                    "INSERT INTO metrica (limite_atencao, limite_critico) VALUES (0, 0)"
                )
                metrica_id = cursor.lastrowid
                cursor.execute(
                    "INSERT INTO especificacao_tecnica (fk_servidor, fk_componente, fk_metrica, ativo) VALUES (%s, %s, %s, 1)",
                    (ID_SERVIDOR, componente_id, metrica_id),
                )

        conexao.commit()
        print(f"[OK] Especificações técnicas prontas para servidor {ID_SERVIDOR}.")

    except Exception:
        conexao.rollback()
        raise
    finally:
        if cursor is not None:
            cursor.close()
        conexao.close()


def carregar_especificacoes(cursor):
    cursor.execute(
        """
        SELECT
            et.id AS especificacao_id,
            et.fk_metrica AS metrica_id,
            tc.nome AS tipo,
            tc.unidade_medida,
            m.limite_atencao,
            m.limite_critico
        FROM especificacao_tecnica et
        JOIN servidor s ON s.id = et.fk_servidor
        JOIN componente c ON c.id = et.fk_componente
        JOIN tipo_componente tc ON tc.id = c.fk_tipo_componente
        JOIN metrica m ON m.id = et.fk_metrica
        WHERE et.fk_servidor = %s
          AND et.ativo = 1
          AND tc.nome IN ('CPU', 'RAM', 'Disco', 'Rede Recebida', 'Rede Enviada')
        ORDER BY
            CASE
                WHEN tc.nome = 'RAM' AND c.descricao = 'Uso de RAM (%)' THEN 0
                WHEN tc.nome = 'Disco' AND c.descricao = 'Uso de disco (%)' THEN 0
                ELSE 1
            END,
            et.id
        """,
        (ID_SERVIDOR,),
    )

    especificacoes = {}
    for linha in cursor.fetchall():
        tipo = linha["tipo"]
        if tipo in especificacoes:
            continue
        especificacoes[tipo] = {
            "id": linha["especificacao_id"],
            "metrica_id": linha["metrica_id"],
            "unidade": linha["unidade_medida"] or "%",
            "limite_atencao": float(linha["limite_atencao"]),
            "limite_critico": float(linha["limite_critico"]),
        }

    # Só exige as especificações dos recursos que esta instância realmente coleta.
    faltando = RECURSOS_OBRIGATORIOS_ATIVOS - set(especificacoes)
    if faltando:
        raise ValueError(
            "Especificações ausentes para: " + ", ".join(sorted(faltando))
        )
    return especificacoes


def calcular_nivel(valor, especificacao):
    if valor >= especificacao["limite_critico"]:
        return "CRITICO"
    if valor >= especificacao["limite_atencao"]:
        return "ATENCAO"
    return None


def enviar_slack(alerta):
    if not SLACK_WEBHOOK_URL:
        return

    icone = "🔴" if alerta["nivel"] == "CRITICO" else "⚠️"
    texto = (
        f"{icone} *{alerta['nivel']}* no servidor {ID_SERVIDOR}: "
        f"{alerta['tipo']} em {alerta['valor']:.1f}{alerta['unidade']} "
        f"(limite de {alerta['nivel'].lower()}: {alerta['limite']:.1f}{alerta['unidade']})"
    )

    try:
        pedido = urllib.request.Request(
            SLACK_WEBHOOK_URL,
            data=json.dumps({"text": texto}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(pedido, timeout=5).close()
    except Exception as erro:
        print(f"[ERRO] Falha ao enviar alerta ao Slack: {erro}")


def slack_habilitado(cursor):
    """Lê o status da tabela slack; mudar no banco vale sem reiniciar."""
    try:
        cursor.execute(
            "SELECT status FROM slack WHERE fk_servidor = %s LIMIT 1",
            (ID_SERVIDOR,),
        )
        linha = cursor.fetchone()
    except mysql.connector.Error:
        return True  # tabela ausente: mantém o comportamento de enviar
    return True if linha is None else bool(linha["status"])


def gravar_capturas(dados):
    conexao = mysql.connector.connect(**CONFIG_BANCO)
    cursor = None

    try:
        cursor = conexao.cursor(dictionary=True)
        cursor.execute(
            "SELECT id FROM servidor WHERE id = %s FOR UPDATE",
            (ID_SERVIDOR,),
        )
        if cursor.fetchone() is None:
            raise ValueError(f"Servidor {ID_SERVIDOR} não cadastrado.")

        especificacoes = carregar_especificacoes(cursor)
        alertas_novos = []
        slack_ativo = slack_habilitado(cursor)

        for tipo, campo in RECURSOS.items():
            # Esta instância só grava o componente do seu TIPO_MONITOR.
            if tipo not in RECURSOS_ATIVOS:
                continue
            if tipo not in especificacoes:
                continue
            valor = dados.get(campo)
            if not isinstance(valor, (int, float)) or valor < 0:
                continue
            if tipo in RECURSOS_OBRIGATORIOS and valor > 100:
                continue

            especificacao = especificacoes[tipo]
            nivel_anterior = None
            if tipo in RECURSOS_OBRIGATORIOS:
                cursor.execute(
                    """
                    SELECT cap.valor
                    FROM captura cap
                    WHERE cap.fk_especificacao_tecnica = %s
                    ORDER BY cap.horario DESC, cap.id DESC
                    LIMIT 1
                    """,
                    (especificacao["id"],),
                )
                leitura_anterior = cursor.fetchone()
                nivel_anterior = (
                    calcular_nivel(float(leitura_anterior["valor"]), especificacao)
                    if leitura_anterior else None
                )

            cursor.execute(
                """
                INSERT INTO captura (valor, horario, fk_especificacao_tecnica)
                VALUES (%s, NOW(), %s)
                """,
                (valor, especificacao["id"]),
            )
            id_captura = cursor.lastrowid

            nivel_atual = (
                calcular_nivel(float(valor), especificacao)
                if tipo in RECURSOS_OBRIGATORIOS else None
            )
            if nivel_atual is not None and nivel_atual != nivel_anterior:
                cursor.execute(
                    """
                    INSERT INTO alerta (fk_captura, nivel, data)
                    VALUES (%s, %s, NOW())
                    """,
                    (id_captura, nivel_atual),
                )

                alertas_novos.append({
                    "tipo": tipo,
                    "nivel": nivel_atual,
                    "valor": float(valor),
                    "unidade": especificacao["unidade"],
                    "limite": (
                        especificacao["limite_critico"]
                        if nivel_atual == "CRITICO"
                        else especificacao["limite_atencao"]
                    ),
                })

        conexao.commit()
        return alertas_novos if slack_ativo else []

    except Exception:
        conexao.rollback()
        raise
    finally:
        if cursor is not None:
            cursor.close()
        conexao.close()


def loop_gravacao():
    while True:
        try:
            dados = coletar_dados()
            alertas_novos = gravar_capturas(dados)
            for alerta in alertas_novos:
                enviar_slack(alerta)

            # Métricas detalhadas de cada componente (módulos individuais),
            # somente para o componente monitorado por esta instância.
            if "CPU" in RECURSOS_ATIVOS:
                gravar_metricas_cpu(CONFIG_BANCO, ID_SERVIDOR)
            if "RAM" in RECURSOS_ATIVOS:
                monitor_memoria.gravar_metricas_memoria(CONFIG_BANCO, ID_SERVIDOR)
            if "Disco" in RECURSOS_ATIVOS:
                monitor_disco.gravar_metricas_disco(CONFIG_BANCO, ID_SERVIDOR)

            resumo = " | ".join(f"{chave}={valor:.2f}" for chave, valor in dados.items())
            print(f"[OK] {TIPO_MONITOR} | {resumo} gravados no banco.")
        except Exception as erro:
            print(f"[ERRO] Não foi possível gravar a coleta: {erro}")
        time.sleep(INTERVALO_GRAVACAO)


def loop_gravacao_rede():
    while True:
        inicio_ciclo = time.monotonic()
        try:
            metricas = coletar_metricas_rede_instancia()
            monitor_rede.gravar_metricas_rede(CONFIG_BANCO, ID_SERVIDOR, metricas)
        except Exception as erro:
            print(f"[ERRO] Não foi possível gravar métricas de rede: {erro}")
        duracao_ciclo = time.monotonic() - inicio_ciclo
        time.sleep(max(0, INTERVALO_GRAVACAO_REDE - duracao_ciclo))


# ---------------------------------------------------------------------------
# APIs consumidas pela página servida neste mesmo processo Python.
# ---------------------------------------------------------------------------
def buscar_dados_dashboard(id_servidor=ID_SERVIDOR):
    conexao = mysql.connector.connect(**CONFIG_BANCO)
    cursor = None
    try:
        cursor = conexao.cursor(dictionary=True)
        historico = {tipo: [] for tipo in RECURSOS}
        for tipo in RECURSOS:
            cursor.execute(
                """
                SELECT cap.valor, cap.horario
                FROM captura cap
                JOIN especificacao_tecnica et
                    ON et.id = cap.fk_especificacao_tecnica
                JOIN componente c ON c.id = et.fk_componente
                JOIN tipo_componente tc ON tc.id = c.fk_tipo_componente
                WHERE et.fk_servidor = %s
                  AND et.ativo = 1
                  AND tc.nome = %s
                ORDER BY cap.horario DESC, cap.id DESC
                LIMIT %s
                """,
                (id_servidor, tipo, LIMITE_HISTORICO),
            )
            linhas = cursor.fetchall()
            for linha in reversed(linhas):
                horario = linha["horario"]
                historico[tipo].append({
                    "valor": float(linha["valor"]),
                    "horario": horario.strftime("%H:%M:%S"),
                    "timestamp": horario.isoformat(),
                })

        atual = {}
        for tipo, campo in RECURSOS.items():
            leituras = historico[tipo]
            atual[campo] = leituras[-1]["valor"] if leituras else None

        horarios = [
            historico[tipo][-1]["horario"]
            for tipo in RECURSOS
            if historico[tipo]
        ]
        atual["horario_formatado"] = horarios[-1] if horarios else None
        return {"historico": historico, "atual": atual, "kpis": buscar_kpis(id_servidor)}
    finally:
        if cursor is not None:
            cursor.close()
        conexao.close()


def buscar_alertas(id_servidor=ID_SERVIDOR, recurso=None):
    conexao = mysql.connector.connect(**CONFIG_BANCO)
    cursor = None
    try:
        cursor = conexao.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT
                a.id,
                a.nivel,
                a.data,
                cap.valor,
                cap.horario AS horario_captura,
                tc.nome AS recurso,
                tc.unidade_medida,
                m.limite_atencao,
                m.limite_critico
            FROM alerta a
            JOIN captura cap ON cap.id = a.fk_captura
            JOIN especificacao_tecnica et
                ON et.id = cap.fk_especificacao_tecnica
            JOIN servidor s ON s.id = et.fk_servidor
            JOIN componente c ON c.id = et.fk_componente
            JOIN tipo_componente tc ON tc.id = c.fk_tipo_componente
            JOIN metrica m ON m.id = et.fk_metrica
            WHERE s.id = %s
              AND (%s IS NULL OR tc.nome LIKE %s)
            ORDER BY a.data DESC, a.id DESC
            LIMIT %s
            """,
            (id_servidor, recurso, f"{recurso}%" if recurso == "Rede" else recurso, LIMITE_ALERTAS),
        )

        alertas = []
        for linha in cursor.fetchall():
            limite = (
                linha["limite_critico"]
                if linha["nivel"] == "CRITICO"
                else linha["limite_atencao"]
            )
            data_evento = linha["data"]
            horario = linha["horario_captura"]
            alertas.append({
                "id": linha["id"],
                "recurso": linha["recurso"],
                "valor_medido": float(linha["valor"]),
                "unidade": linha["unidade_medida"] or "%",
                "nivel": linha["nivel"],
                "limite": float(limite),
                "data": data_evento.strftime("%d/%m/%Y %H:%M:%S") if data_evento else None,
                "horario_captura": horario.strftime("%H:%M:%S") if horario else None,
            })

        return {"alertas": alertas, "total": len(alertas)}
    finally:
        if cursor is not None:
            cursor.close()
        conexao.close()


def buscar_kpis(id_servidor=ID_SERVIDOR):
    """Calcula os quatro indicadores usando as últimas 24 horas de dados."""
    conexao = mysql.connector.connect(**CONFIG_BANCO)
    cursor = None
    try:
        cursor = conexao.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT tc.nome AS recurso, cap.valor, cap.horario, cap.id,
                   m.limite_atencao
            FROM captura cap
            JOIN especificacao_tecnica et ON et.id = cap.fk_especificacao_tecnica
            JOIN metrica m ON m.id = et.fk_metrica
            JOIN componente c ON c.id = et.fk_componente
            JOIN tipo_componente tc ON tc.id = c.fk_tipo_componente
            WHERE et.fk_servidor = %s
              AND et.ativo = 1
              AND cap.horario >= NOW() - INTERVAL 24 HOUR
              AND tc.nome IN ('CPU', 'RAM', 'Disco')
            ORDER BY tc.nome, cap.horario, cap.id
            """,
            (id_servidor,),
        )
        leituras = {}
        for linha in cursor.fetchall():
            valor = float(linha["valor"])
            leituras.setdefault(linha["recurso"], []).append(valor)

        pico = None
        for recurso, valores in leituras.items():
            valor_pico = max(valores)
            if pico is None or valor_pico > pico["valor"]:
                pico = {"recurso": recurso, "valor": valor_pico}

        espaco_livre_disco = None
        if COLETAR and id_servidor == ID_SERVIDOR:
            uso_disco = psutil.disk_usage(os.path.abspath(os.sep))
            espaco_livre_disco = {
                "livre_gb": uso_disco.free / (1024 ** 3),
                "total_gb": uso_disco.total / (1024 ** 3),
            }

        cursor.execute(
            """
            SELECT tc.nome AS recurso,
                   COUNT(*) AS quantidade,
                   SUM(CASE WHEN a.nivel = 'CRITICO' THEN 1 ELSE 0 END) AS criticos
            FROM alerta a
            JOIN captura cap ON cap.id = a.fk_captura
            JOIN especificacao_tecnica et ON et.id = cap.fk_especificacao_tecnica
            JOIN componente c ON c.id = et.fk_componente
            JOIN tipo_componente tc ON tc.id = c.fk_tipo_componente
            WHERE et.fk_servidor = %s
              AND a.data >= NOW() - INTERVAL 24 HOUR
            GROUP BY tc.nome
            ORDER BY quantidade DESC, tc.nome
            """,
            (id_servidor,),
        )
        alertas_por_recurso = cursor.fetchall()
        recurso_mais_alertas = None
        if alertas_por_recurso:
            primeiro = alertas_por_recurso[0]
            recurso_mais_alertas = {
                "recurso": primeiro["recurso"],
                "quantidade": int(primeiro["quantidade"]),
            }
        total_criticos = sum(int(linha["criticos"] or 0) for linha in alertas_por_recurso)

        disco_uso = leituras.get("Disco")
        disco_livre_percent = (
            round(100 - disco_uso[-1], 1) if disco_uso else None
        )

        return {
            "recurso_mais_alertas": recurso_mais_alertas,
            "pico_utilizacao": pico,
            "espaco_livre_disco": espaco_livre_disco,
            "disco_livre_percent": disco_livre_percent,
            "alertas_criticos_24h": total_criticos,
        }
    finally:
        if cursor is not None:
            cursor.close()
        conexao.close()


class Servidor(SimpleHTTPRequestHandler):
    def responder_json(self, dados, codigo=200):
        resposta = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(resposta)))
        self.end_headers()
        self.wfile.write(resposta)

    def do_GET(self):
        url = urlparse(self.path)
        caminho = url.path
        try:
            id_servidor = int(parse_qs(url.query).get("id_servidor", [ID_SERVIDOR])[0])
        except ValueError:
            id_servidor = ID_SERVIDOR

        if caminho == "/dados":
            try:
                self.responder_json(buscar_dados_dashboard(id_servidor))
            except Exception as erro:
                print(f"[ERRO] Consulta de métricas falhou: {erro}")
                self.responder_json(
                    {"erro": "Não foi possível consultar métricas no banco."},
                    503,
                )
            return

        if caminho == "/alertas":
            try:
                recurso = parse_qs(url.query).get("recurso", [None])[0]
                self.responder_json(buscar_alertas(id_servidor, recurso))
            except Exception as erro:
                print(f"[ERRO] Consulta de alertas falhou: {erro}")
                self.responder_json(
                    {"erro": "Não foi possível consultar alertas no banco."},
                    503,
                )
            return

        if caminho == "/metricas/cpu":
            try:
                dados_cpu = buscar_metricas_cpu(CONFIG_BANCO, id_servidor)
                self.responder_json(dados_cpu or [])
            except Exception as erro:
                print(f"[ERRO] Consulta de métricas de CPU falhou: {erro}")
                self.responder_json(
                    {"erro": "Não foi possível consultar métricas de CPU no banco."},
                    503,
                )
            return

        if caminho == "/metricas/memoria":
            try:
                dados_memoria = monitor_memoria.buscar_metricas_memoria(
                    CONFIG_BANCO, id_servidor
                )
                self.responder_json(dados_memoria or [])
            except Exception as erro:
                print(f"[ERRO] Consulta de métricas de memória falhou: {erro}")
                self.responder_json(
                    {"erro": "Não foi possível consultar métricas de memória no banco."},
                    503,
                )
            return

        if caminho == "/metricas/memoria/por-hora":
            try:
                dados_memoria = monitor_memoria.buscar_comparativo_memoria_por_hora(
                    CONFIG_BANCO, id_servidor
                )
                self.responder_json(dados_memoria or [])
            except Exception as erro:
                print(f"[ERRO] Consulta do comparativo horário de memória falhou: {erro}")
                self.responder_json(
                    {"erro": "Não foi possível consultar o comparativo horário de memória."},
                    503,
                )
            return

        if caminho == "/metricas/disco":
            try:
                dados_disco = monitor_disco.buscar_metricas_disco(
                    CONFIG_BANCO, id_servidor
                )
                self.responder_json(dados_disco or [])
            except Exception as erro:
                print(f"[ERRO] Consulta de métricas de disco falhou: {erro}")
                self.responder_json(
                    {"erro": "Não foi possível consultar métricas de disco no banco."},
                    503,
                )
            return

        if caminho == "/metricas/rede":
            try:
                dados_rede = monitor_rede.buscar_metricas_rede(CONFIG_BANCO, id_servidor)
                self.responder_json(dados_rede or [])
            except Exception as erro:
                print(f"[ERRO] Consulta de métricas de rede falhou: {erro}")
                self.responder_json(
                    {"erro": "Não foi possível consultar métricas de rede no banco."},
                    503,
                )
            return

        super().do_GET()


if __name__ == "__main__":
    print(
        f"Banco: {CONFIG_BANCO['host']}:{CONFIG_BANCO['port']} / "
        f"{CONFIG_BANCO['database']}"
    )
    print(f"[MONITOR] TIPO_MONITOR={TIPO_MONITOR} | recursos coletados: "
          f"{', '.join(sorted(RECURSOS_ATIVOS)) or 'nenhum'}")
    if COLETAR:
        if "RAM" in RECURSOS_ATIVOS:
            monitor_memoria.preparar_especificacoes_memoria(CONFIG_BANCO, ID_SERVIDOR)
        if "Disco" in RECURSOS_ATIVOS:
            monitor_disco.preparar_especificacoes_disco(CONFIG_BANCO, ID_SERVIDOR)
        if "CPU" in RECURSOS_ATIVOS or "Rede Recebida" in RECURSOS_ATIVOS:
            preparar_especificacoes()
        if "Rede Recebida" in RECURSOS_ATIVOS or "Rede Enviada" in RECURSOS_ATIVOS:
            monitor_rede.preparar_especificacoes_rede(CONFIG_BANCO, ID_SERVIDOR)
            threading.Thread(target=loop_gravacao_rede, daemon=True).start()
        threading.Thread(target=loop_gravacao, daemon=True).start()
    else:
        print("Coleta desativada nesta instância (somente painel web).")
    servidor = ThreadingHTTPServer(("0.0.0.0", 8000), Servidor)
    print("Dashboard e API disponíveis na porta 8000.")
    servidor.serve_forever()