Chart.defaults.color = '#8f98aa';
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family = "'Inter', sans-serif";

const fmtMoeda = valor => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor || 0));
const grafico = new Chart(document.getElementById('graficoFinanceiro'), {
  type: 'line',
  data: { labels: [], datasets: [
    { label: 'Receita', data: [], borderColor: '#34d399', backgroundColor: '#34d39922', fill: true, tension: 0.3 },
    { label: 'Despesas', data: [], borderColor: '#f87171', backgroundColor: '#f8717122', fill: true, tension: 0.3 }
  ] },
  options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: true } }, scales: { y: { beginAtZero: true, ticks: { callback: value => fmtMoeda(value) } } } }
});

let ultimoNivel = 'normal';
const alertas = [];
function registrarAlerta(nivel, evento, horario) {
  if (nivel === ultimoNivel || nivel === 'normal') { ultimoNivel = nivel; return; }
  alertas.unshift({ nivel, evento, horario: horario || new Date().toLocaleTimeString('pt-BR') });
  alertas.splice(4);
  ultimoNivel = nivel;
  document.getElementById('alertCount').textContent = alertas.length;
  document.getElementById('recentAlerts').innerHTML = alertas.map(item => `<tr><td>${item.horario}</td><td><span class="alert-level alert-level--${item.nivel}">${item.nivel === 'critical' ? 'CRÍTICO' : 'ATENÇÃO'}</span></td><td>${item.evento}</td></tr>`).join('');
}

async function atualizarFinanceiro() {
  const status = document.getElementById('status');
  try {
    const base = typeof API_URL !== 'undefined' ? API_URL : '';
    const resposta = await fetch(`${base}/metricas/financeiro`);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    let dados = await resposta.json();
    if (Array.isArray(dados)) dados = dados.at(-1);
    if (!dados) throw new Error('Resposta financeira vazia');

    const receita = Number(dados.receita ?? 0);
    const despesas = Number(dados.despesas ?? 0);
    const lucro = Number(dados.lucro_liquido ?? receita - despesas);
    const margem = Number(dados.margem_percentual ?? (receita ? lucro / receita * 100 : 0));
    document.getElementById('receita').textContent = fmtMoeda(receita);
    document.getElementById('despesas').textContent = fmtMoeda(despesas);
    document.getElementById('lucro').textContent = fmtMoeda(lucro);
    document.getElementById('estadoLucro').textContent = lucro < 0 ? 'Resultado negativo' : 'Resultado positivo';
    document.getElementById('margem').textContent = `${margem.toFixed(1)}%`;
    document.getElementById('mReceita').textContent = fmtMoeda(receita);
    document.getElementById('mDespesas').textContent = fmtMoeda(despesas);
    document.getElementById('mLucro').textContent = fmtMoeda(lucro);
    document.getElementById('mMargem').textContent = `${margem.toFixed(1)}%`;

    const serie = Array.isArray(dados.historico_mensal) ? dados.historico_mensal : [];
    grafico.data.labels = serie.map(item => item.mes);
    grafico.data.datasets[0].data = serie.map(item => Number(item.receita || 0));
    grafico.data.datasets[1].data = serie.map(item => Number(item.despesas || 0));
    grafico.update();

    const nivel = lucro < 0 ? 'critical' : margem < 10 ? 'warning' : 'normal';
    registrarAlerta(nivel, lucro < 0 ? `Prejuízo de ${fmtMoeda(Math.abs(lucro))}` : `Margem baixa: ${margem.toFixed(1)}%`, dados.horario);
    status.textContent = `Dados atualizados · Última leitura: ${dados.horario || new Date().toLocaleTimeString('pt-BR')}`;
  } catch (erro) {
    console.error('Erro ao buscar métricas financeiras:', erro);
    status.textContent = 'Aguardando conexão com /metricas/financeiro...';
  }
}

atualizarFinanceiro();
setInterval(atualizarFinanceiro, 3000);
