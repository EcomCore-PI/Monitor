
Chart.defaults.color = '#8f98aa';
Chart.defaults.borderColor = 'rgba(255,255,255,.06)';
Chart.defaults.font.family = "'Inter', sans-serif";

// Histórico dos gráficos
const labels = [];
const historicoPercentual = [];
const historicoUsada = [];
const historicoDisponivel = [];

// Primeiro gráfico: percentual de RAM
const graficoPercentual = new Chart(
    document.getElementById('grafico-percentual'),
    {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'RAM utilizada (%)',
                    data: historicoPercentual,
                    borderColor: '#005AFE',
                    backgroundColor: '#005AFE33',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Atenção (80%)',
                    data: [],
                    borderColor: '#fbbf24',
                    borderDash: [6, 4],
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    }
);

// Segundo gráfico: RAM em GB
const graficoMemoria = new Chart(
    document.getElementById('grafico-memoria'),
    {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'RAM utilizada (GB)',
                    data: historicoUsada,
                    borderColor: '#005AFE',
                    tension: 0.3
                },
                {
                    label: 'RAM disponível (GB)',
                    data: historicoDisponivel,
                    borderColor: '#22c55e',
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    }
);


// Atualiza os dados da dashboard
async function atualizar() {

    try {
        const idServidor = window.CONFIG_SERVIDOR?.id || 3;
        const resposta = await fetch(`/metricas/memoria?id_servidor=${idServidor}`);

        if (!resposta.ok) {
            throw new Error('Erro ao buscar memória');
        }

        const retorno = await resposta.json();
        const registros = Array.isArray(retorno) ? retorno.slice(-15) : [retorno];
        const dados = registros[registros.length - 1];
        if (!dados || dados.ram_percentual === undefined) {
            throw new Error('Ainda não há métricas de memória gravadas no banco.');
        }

        const percentual = Number(dados.ram_percentual);
        const usada = Number(dados.ram_usada_gb);
        const disponivel = Number(dados.ram_disponivel_gb);
        const total = Number(dados.ram_total_gb);

        const hora = dados.horario || new Date().toLocaleTimeString('pt-BR');

        // Atualização dos KPIs
        document.getElementById('uso').textContent =
            percentual.toFixed(1) + '%';

        document.getElementById('usada').textContent =
            usada.toFixed(2) + ' GB';

        document.getElementById('disponivel').textContent =
            disponivel.toFixed(2) + ' GB';

        document.getElementById('total').textContent =
            total.toFixed(2) + ' GB';


        // Situação da memória
        let estado = 'Normal';

        if (percentual >= 90) {
            estado = 'Crítico';
        } else if (percentual >= 80) {
            estado = 'Atenção';
        }

        document.getElementById('estado').textContent =
            'Nível: ' + estado;


        // Recarrega os gráficos com o histórico persistido no banco.
        labels.splice(0, labels.length, ...registros.map(item => item.horario || '--:--'));
        historicoPercentual.splice(0, historicoPercentual.length, ...registros.map(item => Number(item.ram_percentual || 0)));
        historicoUsada.splice(0, historicoUsada.length, ...registros.map(item => Number(item.ram_usada_gb || 0)));
        historicoDisponivel.splice(0, historicoDisponivel.length, ...registros.map(item => Number(item.ram_disponivel_gb || 0)));


        // Atualiza os gráficos
        graficoPercentual.data.datasets[1].data =
            labels.map(() => 80);

        graficoPercentual.update();
        graficoMemoria.update();


        document.getElementById('status').textContent =
            'Dados atualizados do banco · Última leitura: ' + hora;

    } catch (erro) {

        document.getElementById('status').textContent =
            'Aguardando conexão com o servidor...';

        console.error(erro);
    }
}


// Primeira leitura e atualização a cada 3 segundos
atualizar();
setInterval(atualizar, 3000);
