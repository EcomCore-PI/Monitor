Chart.defaults.color = '#8f98aa';
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 11;

const COR_AZUL = '#005AFE';
const COR_AMBAR = '#fbbf24';
const COR_VERMELHO = '#ef4444';

let graficoTotal = null;
let graficoNucleos = null;

const horariosHistorico = [];
const historicoCpuTotal = [];

function obterQueryServidor() {
  const idServidor = window.CONFIG_SERVIDOR?.id;
  return idServidor ? `?id_servidor=${encodeURIComponent(idServidor)}` : '';
}

function inicializarGraficos() {
  const opcoesBase = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: { legend: { display: false } }
  };

  // 1. Gráfico de Linha - Uso Total de CPU
  const ctxTotal = document.getElementById('graficoCpuTotal').getContext('2d');
  graficoTotal = new Chart(ctxTotal, {
    type: 'line',
    data: {
      labels: horariosHistorico,
      datasets: [
        {
          label: 'Uso Total (%)',
          data: historicoCpuTotal,
          borderColor: COR_AZUL,
          backgroundColor: COR_AZUL + '33',
          fill: true,
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 2
        },
        {
          label: 'Limite Atenção (70%)',
          data: [],
          borderColor: COR_AMBAR,
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0
        }
      ]
    },
    options: {
      ...opcoesBase,
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 5 } },
        y: { beginAtZero: true, max: 100 }
      }
    }
  });

  // 2. Gráfico de Barras - Uso por Núcleo
  const ctxNucleos = document.getElementById('graficoCpuNucleos').getContext('2d');
  graficoNucleos = new Chart(ctxNucleos, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Uso (%)',
          data: [],
          backgroundColor: [],
          borderRadius: 4,
          maxBarThickness: 34
        }
      ]
    },
    options: {
      ...opcoesBase,
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, max: 100 }
      }
    }
  });
}

function atualizarInterfaceCpu(dados) {
  const cpuUser = Number(dados.cpu_user ?? 0);
  const cpuSystem = Number(dados.cpu_system ?? 0);
  const cpuIowait = Number(dados.cpu_iowait ?? 0);
  const cpuSteal = Number(dados.cpu_steal ?? 0);
  const load1Min = Number(dados.load_1min ?? 0);
  const nucleos = Array.isArray(dados.cpu_por_nucleo) ? dados.cpu_por_nucleo : [];

  const usoTotal = dados.cpu_total !== undefined
    ? Number(dados.cpu_total)
    : Number((cpuUser + cpuSystem + cpuIowait + cpuSteal).toFixed(1));

  // Atualiza KPIs
  document.getElementById('kpiCpuTotal').textContent = `${usoTotal}%`;
  document.getElementById('kpiCpuPico').textContent = `User: ${cpuUser}% · System: ${cpuSystem}%`;
  document.getElementById('kpiLoad1Min').textContent = load1Min.toFixed(2).replace('.', ',');
  document.getElementById('kpiCpuSteal').textContent = `${cpuSteal}%`;
  document.getElementById('kpiCpuIowait').textContent = `${cpuIowait}%`;
  document.getElementById('kpiQtdNucleos').textContent = `${nucleos.length} núcleos disponíveis`;

  const statusEl = document.getElementById('kpiCpuStatus');
  if (usoTotal >= 90) {
    statusEl.textContent = 'Nível: Crítico';
    statusEl.style.color = '#fca5a5';
  } else if (usoTotal >= 70) {
    statusEl.textContent = 'Nível: Atenção';
    statusEl.style.color = '#fcd34d';
  } else {
    statusEl.textContent = 'Nível: Normal';
    statusEl.style.color = '#6ee7b7';
  }

  // Atualiza Gráfico de Linha (Uso Total)
  const horarioLeitura = dados.horario || new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  horariosHistorico.push(horarioLeitura);
  historicoCpuTotal.push(usoTotal);

  if (horariosHistorico.length > 15) {
    horariosHistorico.shift();
    historicoCpuTotal.shift();
  }

  graficoTotal.data.labels = horariosHistorico;
  graficoTotal.data.datasets[0].data = historicoCpuTotal;
  graficoTotal.data.datasets[1].data = historicoCpuTotal.map(() => 70);
  graficoTotal.update();

  // Atualiza Gráfico de Barras (Uso por Núcleo)
  graficoNucleos.data.labels = nucleos.map((_, idx) => `Núcleo ${idx}`);
  graficoNucleos.data.datasets[0].data = nucleos;
  graficoNucleos.data.datasets[0].backgroundColor = nucleos.map(v =>
    v > 90 ? COR_VERMELHO : COR_AZUL
  );
  graficoNucleos.update();

  document.getElementById('statusAtualizacao').textContent =
    `Dados atualizados do banco · Última leitura: ${horarioLeitura}`;
}

async function buscarMetricasCpu() {
  const statusAtualizacao = document.getElementById('statusAtualizacao');

  try {
    const query = obterQueryServidor();
    const baseUrl = typeof API_URL !== 'undefined' ? API_URL : '';
    const resposta = await fetch(`${baseUrl}/metricas/cpu${query}`);

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    const retorno = await resposta.json();

    if (Array.isArray(retorno) && retorno.length > 0) {
      horariosHistorico.length = 0;
      historicoCpuTotal.length = 0;

      retorno.slice(-15, -1).forEach(item => {
        const totalItem = item.cpu_total !== undefined
          ? Number(item.cpu_total)
          : Number((Number(item.cpu_user ?? 0) + Number(item.cpu_system ?? 0) + Number(item.cpu_iowait ?? 0) + Number(item.cpu_steal ?? 0)).toFixed(1));

        horariosHistorico.push(item.horario || '--:--');
        historicoCpuTotal.push(totalItem);
      });

      atualizarInterfaceCpu(retorno[retorno.length - 1]);
    } else if (retorno && typeof retorno === 'object' && !Array.isArray(retorno)) {
      atualizarInterfaceCpu(retorno);
    }
  } catch (erro) {
    console.error('Erro ao buscar métricas de CPU do banco:', erro);
    statusAtualizacao.textContent =
      'Aguardando conexão com o banco de dados (/metricas/cpu)...';
  }
}

async function buscarAlertasCpu() {
  const tbody = document.getElementById('tabelaAlertasCpu');
  const contador = document.getElementById('contadorAlertas');

  try {
    const query = obterQueryServidor();
    const baseUrl = typeof API_URL !== 'undefined' ? API_URL : '';
    const resposta = await fetch(`${baseUrl}/alertas${query}`);

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    const dados = await resposta.json();
    const lista = Array.isArray(dados.alertas) ? dados.alertas : [];
    const alertasCpu = lista.filter(a => String(a.recurso || '').toUpperCase().includes('CPU'));

    contador.textContent = alertasCpu.length;

    if (alertasCpu.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3">Nenhum alerta recente de CPU.</td></tr>';
      return;
    }

    tbody.innerHTML = alertasCpu.slice(0, 15).map(alerta => {
      const nivel = String(alerta.nivel || '').toUpperCase();
      const classeNivel = nivel === 'CRITICO' ? 'alert-level--critical' : 'alert-level--warning';
      const horario = alerta.horario_captura || alerta.data || '--:--';
      const valor = Number(alerta.valor_medido ?? 0).toFixed(1);

      return `
        <tr>
          <td>${horario}</td>
          <td><span class="alert-level ${classeNivel}">${nivel}</span></td>
          <td>${valor}%</td>
        </tr>
      `;
    }).join('');
  } catch (erro) {
    console.error('Erro ao buscar alertas de CPU:', erro);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  inicializarGraficos();
  buscarMetricasCpu();
  buscarAlertasCpu();
  setInterval(() => {
    buscarMetricasCpu();
    buscarAlertasCpu();
  }, 3000);
});