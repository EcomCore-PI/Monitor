Chart.defaults.color = '#8f98aa';
Chart.defaults.borderColor = 'rgba(255,255,255,.06)';
Chart.defaults.font.family = "'Inter', sans-serif";

const labelsDisco = [];
const historicoDisco = [];
const chart = new Chart(document.getElementById('grafico'), {
  type: 'line',
  data: { labels: labelsDisco, datasets: [
    { label: 'Uso (%)', data: historicoDisco, borderColor: '#005AFE', backgroundColor: '#005AFE33', fill: true, tension: .3, pointRadius: 2 },
    { label: 'Atenção (80%)', data: [], borderColor: '#fbbf24', borderDash: [6, 4], pointRadius: 0 }
  ] },
  options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { y: { beginAtZero: true, max: 100 } } }
});

async function atualizar() {
  try {
    const idServidor = window.CONFIG_SERVIDOR?.id || 2;
    const resposta = await fetch(`/metricas/disco?id_servidor=${idServidor}`);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const retorno = await resposta.json();
    const registros = Array.isArray(retorno) ? retorno.slice(-15) : [retorno];
    const dados = registros[registros.length - 1];
    if (!dados || dados.disco_percentual === undefined) throw new Error('Sem métricas de disco no banco.');

    const percentual = Number(dados.disco_percentual);
    const formatarGb = valor => `${Number(valor || 0).toFixed(2)} GB`;
    const hora = dados.horario || new Date().toLocaleTimeString('pt-BR');
    document.getElementById('usado').textContent = formatarGb(dados.disco_usado_gb);
    document.getElementById('livre').textContent = formatarGb(dados.disco_livre_gb);
    document.getElementById('total').textContent = formatarGb(dados.disco_total_gb);
    document.getElementById('percentual').textContent = `${percentual.toFixed(1)}%`;
    document.getElementById('estado').textContent = `Nível: ${percentual >= 90 ? 'Crítico' : percentual >= 80 ? 'Atenção' : 'Normal'}`;

    labelsDisco.splice(0, labelsDisco.length, ...registros.map(item => item.horario || '--:--'));
    historicoDisco.splice(0, historicoDisco.length, ...registros.map(item => Number(item.disco_percentual || 0)));
    chart.data.datasets[1].data = labelsDisco.map(() => 80);
    chart.update();
    document.getElementById('status').textContent = `Dados atualizados do banco · Última leitura: ${hora}`;
  } catch (erro) {
    document.getElementById('status').textContent = 'Aguardando conexão com /metricas/disco...';
    console.error('Erro ao buscar métricas de disco:', erro);
  }
}

atualizar();
setInterval(atualizar, 5000);
