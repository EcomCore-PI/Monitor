Chart.defaults.color = '#8f98aa';
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 11;

const COR_AZUL = '#005AFE';
const COR_AMBAR = '#fbbf24';
const COR_VERMELHO = '#ef4444';
const COR_VERDE = '#34d399';
const COR_ROXO = '#a78bfa';

const INTERVALO_MS = 5000;      // o captura.jar grava a cada 5 segundos
const LIMITE_SEM_DADOS_S = 30;  // sem coleta nova por mais que isso = coletor parado
const MAX_ALERTAS = 30;
const LIMITE_REDE_ATENCAO_MBPS = 80;
const LIMITE_REDE_CRITICO_MBPS = 150;

let graficoErros = null;
let graficoDisponibilidade = null;

const alertas = [];
let conectadoAnterior = null;
let nivelDownloadAnterior = 'normal';
let nivelUploadAnterior = 'normal';


function obterQueryServidor() {
  const idServidor = window.CONFIG_SERVIDOR?.id;
  return idServidor ? `?id_servidor=${encodeURIComponent(idServidor)}` : '';
}

function formatar(valor, casas) {
  return Number(valor ?? 0).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  });
}

function inicializarGraficos() {
  const opcoesBase = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#cbd5e1', usePointStyle: true, boxWidth: 7 } }
    }
  };

  const linha = (label, cor) => ({
    label,
    data: [],
    borderColor: cor,
    backgroundColor: cor,
    borderWidth: 2,
    tension: 0.3,
    pointRadius: 2
  });

  // 1. Erros, descartes e colisões (variação por coleta)
  graficoErros = new Chart(document.getElementById('graficoErros').getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        linha('Erros de entrada', COR_VERMELHO),
        linha('Erros de saída', COR_AMBAR),
        linha('Descartes de entrada', COR_AZUL),
        linha('Colisões', COR_ROXO)
      ]
    },
    options: {
      ...opcoesBase,
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
        y: { beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });

  // 2. Disponibilidade da conexão (% de pings com resposta)
  graficoDisponibilidade = new Chart(document.getElementById('graficoDisponibilidade').getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Disponibilidade (%)',
          data: [],
          borderColor: COR_VERDE,
          backgroundColor: COR_VERDE + '33',
          fill: true,
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 2
        }
      ]
    },
    options: {
      ...opcoesBase,
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } },
        y: { min: 0, max: 100, ticks: { callback: valor => `${valor}%` } }
      }
    }
  });
}

function definirEstado(texto, classe) {
  const el = document.getElementById('estadoConexao');
  el.classList.remove('estado--falha', 'estado--aguardando');
  if (classe) el.classList.add(classe);
  document.getElementById('estadoTexto').textContent = texto;
}

function definirStatus(texto, erro) {
  const statusRede = document.getElementById('statusRede');
  if (erro) {
    statusRede.setAttribute('data-error', 'true');
  } else {
    statusRede.removeAttribute('data-error');
  }
  document.getElementById('statusAtualizacao').textContent = texto;
}

function adicionarAlerta(nivel, evento, valor, horario) {
  alertas.unshift({ nivel, descricao: `${evento} · ${valor}`, horario });
  if (alertas.length > MAX_ALERTAS) alertas.pop();
}

function registrarTransicoes(ultimo, conectado) {
  const perda = `${formatar(ultimo.perda_pacotes, 1)}%`;

  if (conectadoAnterior === null && !conectado) {
    adicionarAlerta('ATENCAO', 'Ping sem resposta', perda, ultimo.horario);
  } else if (conectadoAnterior === true && !conectado) {
    adicionarAlerta('CRITICO', 'Conexão sem resposta', perda, ultimo.horario);
  } else if (conectadoAnterior === false && conectado) {
    adicionarAlerta('INFO', 'Conexão restabelecida', `${formatar(ultimo.latencia_ms, 1)} ms`, ultimo.horario);
  }
  conectadoAnterior = conectado;

  nivelDownloadAnterior = registrarLimiteTrafego(
    'Download', ultimo.download_mbps, nivelDownloadAnterior, ultimo.horario
  );
  nivelUploadAnterior = registrarLimiteTrafego(
    'Upload', ultimo.upload_mbps, nivelUploadAnterior, ultimo.horario
  );
}

function registrarLimiteTrafego(nome, valor, nivelAnterior, horario) {
  if (valor == null || !Number.isFinite(Number(valor))) return nivelAnterior;

  const velocidade = Number(valor);
  const nivelAtual = velocidade >= LIMITE_REDE_CRITICO_MBPS
    ? 'CRITICO'
    : velocidade >= LIMITE_REDE_ATENCAO_MBPS
      ? 'ATENCAO'
      : 'NORMAL';

  const prioridade = { NORMAL: 0, ATENCAO: 1, CRITICO: 2 };
  if (prioridade[nivelAtual] > prioridade[nivelAnterior.toUpperCase()]) {
    adicionarAlerta(
      nivelAtual,
      `${nome} acima do limite`,
      `${formatar(velocidade, 1)} Mbps`,
      horario
    );
  }

  return nivelAtual.toLowerCase();
}

function renderizarAlertas() {
  const corpo = document.getElementById('tabelaAlertasRede');
  document.getElementById('contadorAlertas').textContent = alertas.length;
  corpo.replaceChildren();

  if (alertas.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.className = 'alerts-empty';
    td.textContent = 'Nenhum alerta observado.';
    tr.append(td);
    corpo.append(tr);
    return;
  }

  const classes = {
    CRITICO: 'alert-level--critical',
    ATENCAO: 'alert-level--warning',
    INFO: 'alert-level--info'
  };

  for (const alerta of alertas) {
    const tr = document.createElement('tr');

    const tdHorario = document.createElement('td');
    tdHorario.textContent = alerta.horario;

    const tdEvento = document.createElement('td');
    tdEvento.textContent = alerta.descricao;

    const tdNivel = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `alert-level ${classes[alerta.nivel] || 'alert-level--warning'}`;
    badge.textContent = alerta.nivel;
    tdNivel.append(badge);

    tr.append(tdHorario, tdEvento, tdNivel);
    corpo.append(tr);
  }
}

function atualizarInterface(historico) {
  // O servidor consultado vem na própria resposta (a API assume o da instância quando não há ?servidor=)
  if (historico.length > 0 && historico[0].id_servidor != null) {
    document.getElementById('tituloServidorRede').textContent =
      `Monitoramento de Rede · Servidor ${historico[0].id_servidor}`;
  }

  if (historico.length === 0) {
    definirEstado('Aguardando coleta', 'estado--aguardando');
    definirStatus('Nenhuma coleta de rede no banco ainda. Confira se o captura.jar está rodando neste servidor.', false);
    return;
  }

  const ultimo = historico[historico.length - 1];
  const semDadosRecentes = ultimo.idade_segundos > LIMITE_SEM_DADOS_S;
  // O coletor não grava latência quando o ping falha, então latência ausente = sem resposta
  const conectado = ultimo.latencia_ms != null;

  // KPIs
  document.getElementById('kpiDownload').textContent =
    ultimo.download_mbps == null ? '--' : formatar(ultimo.download_mbps, 3);
  document.getElementById('kpiUpload').textContent =
    ultimo.upload_mbps == null ? '--' : formatar(ultimo.upload_mbps, 3);
  document.getElementById('kpiLatencia').textContent =
    ultimo.latencia_ms == null ? '--' : formatar(ultimo.latencia_ms, 1);
  document.getElementById('kpiPerda').textContent =
    ultimo.perda_pacotes == null ? '--' : formatar(ultimo.perda_pacotes, 1);

  // Estado da conexão + última atualização
  if (semDadosRecentes) {
    definirEstado('Sem dados recentes', 'estado--falha');
    definirStatus(`Última coleta às ${ultimo.horario} (há ${ultimo.idade_segundos} s). O coletor pode estar parado.`, true);
  } else {
    definirEstado(conectado ? 'Conectado' : 'Sem resposta ao ping', conectado ? null : 'estado--falha');
    definirStatus(`Última atualização: ${ultimo.horario}`, false);
  }

  // Gráficos
  const rotulos = historico.map(item => item.horario);

  graficoErros.data.labels = rotulos;
  ['erros_entrada', 'erros_saida', 'descartes_entrada', 'colisoes'].forEach((chave, i) => {
    graficoErros.data.datasets[i].data = historico.map(item => item[chave]);
  });
  graficoErros.update();

  graficoDisponibilidade.data.labels = rotulos;
  graficoDisponibilidade.data.datasets[0].data = historico.map(item => item.disponibilidade);
  graficoDisponibilidade.update();

  // Alertas (só com coleta recente, para não gerar evento falso com dado antigo)
  if (!semDadosRecentes) {
    registrarTransicoes(ultimo, conectado);
  }
  renderizarAlertas();
}

async function atualizarRede() {
  try {
    const baseUrl = typeof API_URL !== 'undefined' ? API_URL : '';
    const resposta = await fetch(`${baseUrl}/metricas/rede${obterQueryServidor()}`, { cache: 'no-store' });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const historico = await resposta.json();
    atualizarInterface(Array.isArray(historico) ? historico : []);
  } catch (erro) {
    console.error('Erro ao buscar métricas de rede:', erro);
    definirEstado('Sem comunicação com a API', 'estado--falha');
    definirStatus('Aguardando conexão com /metricas/rede…', true);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  inicializarGraficos();
  atualizarRede();
  setInterval(atualizarRede, INTERVALO_MS);
});
