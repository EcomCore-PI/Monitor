from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime
from urllib.parse import urlparse, parse_qs
import json
import os
import threading
import time

import mysql.connector
import psutil


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
INTERVALO_GRAVACAO = 5
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
}


# ---------------------------------------------------------------------------
# Coleta na máquina onde este programa está rodando
# ---------------------------------------------------------------------------
def coletar_dados():
    cpu_percent = psutil.cpu_percent(interval=1)
    memoria = psutil.virtual_memory()
    caminho_disco = os.path.abspath(os.sep)
    disco = psutil.disk_usage(caminho_disco)

    return {
        "cpu_percent": float(cpu_percent),
        "memoria_percent": float(memoria.percent),
        "disco_percent": float(disco.percent),
    }


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

        for tipo in RECURSOS:
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
          AND tc.nome IN ('CPU', 'RAM', 'Disco')
        ORDER BY et.id
        """,
        (ID_SERVIDOR,),
    )

    especificacoes = {}
    for linha in cursor.fetchall():
        tipo = linha["tipo"]
        especificacoes[tipo] = {
            "id": linha["especificacao_id"],
            "metrica_id": linha["metrica_id"],
            "unidade": linha["unidade_medida"] or "%",
            "limite_atencao": float(linha["limite_atencao"]),
            "limite_critico": float(linha["limite_critico"]),
        }

    faltando = set(RECURSOS) - set(especificacoes)
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


# ---------------------------------------------------------------------------
# Grava capturas e eventos de alerta conforme o modelo existente no SQL:
# alerta(fk_captura, nivel, data), com nivel ATENCAO ou CRITICO.
# Um evento é gravado ao entrar em alerta ou mudar de nível, não a cada coleta.
# ---------------------------------------------------------------------------
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

        for tipo, campo in RECURSOS.items():
            valor = dados.get(campo)
            if not isinstance(valor, (int, float)) or not 0 <= valor <= 100:
                continue

            especificacao = especificacoes[tipo]
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

            nivel_atual = calcular_nivel(float(valor), especificacao)
            if nivel_atual is not None and nivel_atual != nivel_anterior:
                cursor.execute(
                    """
                    INSERT INTO alerta (fk_captura, nivel, data)
                    VALUES (%s, %s, NOW())
                    """,
                    (id_captura, nivel_atual),
                )

        conexao.commit()

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
            gravar_capturas(dados)
            print(
                f"[OK] CPU {dados['cpu_percent']:.1f}% | "
                f"RAM {dados['memoria_percent']:.1f}% | "
                f"Disco {dados['disco_percent']:.1f}% gravados no banco."
            )
        except Exception as erro:
            print(f"[ERRO] Não foi possível gravar a coleta: {erro}")
        time.sleep(INTERVALO_GRAVACAO)


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


def buscar_alertas(id_servidor=ID_SERVIDOR):
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
            ORDER BY a.data DESC, a.id DESC
            LIMIT %s
            """,
            (id_servidor, LIMITE_ALERTAS),
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
        if id_servidor == ID_SERVIDOR:
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
                self.responder_json(buscar_alertas(id_servidor))
            except Exception as erro:
                print(f"[ERRO] Consulta de alertas falhou: {erro}")
                self.responder_json(
                    {"erro": "Não foi possível consultar alertas no banco."},
                    503,
                )
            return

        super().do_GET()


if __name__ == "__main__":
    print(
        f"Banco: {CONFIG_BANCO['host']}:{CONFIG_BANCO['port']} / "
        f"{CONFIG_BANCO['database']}"
    )
    preparar_especificacoes()
    threading.Thread(target=loop_gravacao, daemon=True).start()
    servidor = ThreadingHTTPServer(("0.0.0.0", 8000), Servidor)
    print("Dashboard e API disponíveis na porta 8000.")
    servidor.serve_forever()
