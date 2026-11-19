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

  // Calcula o uso total a partir dos tempos da CPU (ou usa cpu_total se vier direto do banco)
  const usoTotal = dados.cpu_total !== undefined
    ? Number(dados.cpu_total)
    : Number((cpuUser + cpuSystem + cpuIowait + cpuSteal).toFixed(1));

  // Atualiza KPIs
  document.getElementById('kpiCpuTotal').textContent = `${usoTotal}%`;
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

  // Atualiza Tabela de Novas Métricas
  document.getElementById('valCpuUser').textContent = `${cpuUser}%`;
  document.getElementById('valCpuSystem').textContent = `${cpuSystem}%`;
  document.getElementById('valCpuIowait').textContent = `${cpuIowait}%`;
  document.getElementById('valCpuSteal').textContent = `${cpuSteal}%`;
  document.getElementById('valLoad1Min').textContent = load1Min.toFixed(2).replace('.', ',');
  document.getElementById('valCpuNucleos').textContent = nucleos.length > 0
    ? nucleos.map((v, i) => `N${i}: ${v}%`).join(' | ')
    : '--';

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
    const baseUrl = typeof API_URL !== 'undefined' ? API_URL : '';
    const resposta = await fetch(`${baseUrl}/metricas/cpu`);

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    const retorno = await resposta.json();

    // Se o banco devolver uma lista de registros históricos, preenche o histórico e pega o mais recente
    if (Array.isArray(retorno) && retorno.length > 0) {
      horariosHistorico.length = 0;
      historicoCpuTotal.length = 0;

      retorno.slice(-15).forEach(item => {
        const totalItem = item.cpu_total !== undefined
          ? Number(item.cpu_total)
          : Number((Number(item.cpu_user ?? 0) + Number(item.cpu_system ?? 0) + Number(item.cpu_iowait ?? 0) + Number(item.cpu_steal ?? 0)).toFixed(1));

        horariosHistorico.push(item.horario || '--:--');
        historicoCpuTotal.push(totalItem);
      });

      atualizarInterfaceCpu(retorno[retorno.length - 1]);
    } else if (retorno && typeof retorno === 'object') {
      atualizarInterfaceCpu(retorno);
    }
  } catch (erro) {
    console.error('Erro ao buscar métricas de CPU do banco:', erro);
    statusAtualizacao.textContent =
      'Aguardando conexão com o banco de dados (/metricas/cpu)...';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  inicializarGraficos();
  buscarMetricasCpu();
  setInterval(buscarMetricasCpu, 3000);
});