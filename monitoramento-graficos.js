(() => {
    const status = document.getElementById('metrics-status');
    if (typeof Chart === 'undefined') {
        status.textContent = 'Não foi possível carregar os gráficos. Recarregue a página.';
        status.dataset.error = 'true';
        return;
    }

    const MAX_PONTOS = 30;
    const INTERVALO = 3000;
    let timer = null;
    let requisicao = null;
    const formato = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
    const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');

    function texto(id, valor) {
        const elemento = document.getElementById(id);
        if (elemento) elemento.textContent = valor;
    }

    function percentual(valor) {
        return typeof valor === 'number' && Number.isFinite(valor)
            ? `${formato.format(valor)}%`
            : '—';
    }

    function criarGrafico(id, rotulo, cor) {
        return new Chart(document.getElementById(id), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: rotulo,
                    data: [],
                    borderColor: cor,
                    backgroundColor: `${cor}18`,
                    fill: true,
                    borderWidth: 2,
                    tension: 0.25,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: reduzMovimento.matches ? false : { duration: 250 },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: item => `${rotulo}: ${percentual(item.parsed.y)}`,
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { maxTicksLimit: 5, maxRotation: 0 },
                        title: { display: true, text: 'Horário' },
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { callback: valor => `${valor}%` },
                    },
                },
            },
        });
    }

    const graficos = {
        CPU: criarGrafico('chartCpu', 'CPU', '#60a5fa'),
        RAM: criarGrafico('chartRam', 'RAM', '#34d399'),
        Disco: criarGrafico('chartDisco', 'Disco', '#c084fc'),
    };

    function preencherGrafico(grafico, leituras) {
        const pontos = Array.isArray(leituras) ? leituras.slice(-MAX_PONTOS) : [];
        grafico.data.labels = pontos.map(ponto => ponto.horario);
        grafico.data.datasets[0].data = pontos.map(ponto => ponto.valor);
        grafico.update(reduzMovimento.matches ? 'none' : undefined);
    }

    async function atualizarMetricas() {
        clearTimeout(timer);
        if (document.hidden || requisicao) return;

        const controller = new AbortController();
        requisicao = controller;
        const limite = setTimeout(() => controller.abort(), 8000);

        try {
            const resposta = await fetch('/dados', {
                cache: 'no-store',
                signal: controller.signal,
            });
            if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

            const dados = await resposta.json();
            if (!dados.atual || !dados.historico) {
                throw new Error('Resposta /dados não contém atual e historico.');
            }

            texto('kpi-cpu', percentual(dados.atual.cpu_percent));
            texto('kpi-ram', percentual(dados.atual.memoria_percent));
            texto('kpi-disco', percentual(dados.atual.disco_percent));

            texto('kpi-cpu-info', 'Última captura armazenada no banco');
            texto('kpi-ram-info', 'Última captura armazenada no banco');
            texto('kpi-disco-info', 'Última captura armazenada no banco');

            for (const [tipo, grafico] of Object.entries(graficos)) {
                preencherGrafico(grafico, dados.historico[tipo]);
            }

            texto(
                'metrics-status',
                dados.atual.horario_formatado
                    ? `Última leitura no banco: ${dados.atual.horario_formatado}`
                    : 'Aguardando a primeira captura no banco.'
            );
            status.dataset.error = 'false';
        } catch (erro) {
            if (!document.hidden) {
                texto('metrics-status', 'Não foi possível consultar as métricas no banco.');
                status.dataset.error = 'true';
                console.error('Falha ao atualizar métricas:', erro);
            }
        } finally {
            clearTimeout(limite);
            requisicao = null;
            if (!document.hidden) timer = setTimeout(atualizarMetricas, INTERVALO);
        }
    }

    document.addEventListener('visibilitychange', () => {
        clearTimeout(timer);
        if (document.hidden) {
            requisicao?.abort();
            Object.values(graficos).forEach(grafico => grafico.stop());
        } else {
            atualizarMetricas();
        }
    });
    atualizarMetricas();
})();

(() => {
    const corpo = document.getElementById('alerts-body');
    const status = document.getElementById('alerts-status');
    const contador = document.getElementById('alerts-count');
    const formato = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
    let timer = null;
    let requisicao = null;
    let recebeuDados = false;

    function mostrarVazio(mensagem) {
        const linha = document.createElement('tr');
        const celula = document.createElement('td');
        celula.colSpan = 5;
        celula.className = 'alerts-empty';
        celula.textContent = mensagem;
        linha.append(celula);
        corpo.replaceChildren(linha);
    }

    function renderizar(dados) {
        corpo.replaceChildren();

        for (const alerta of dados.alertas) {
            const linha = document.createElement('tr');
            const recurso = document.createElement('td');
            const valor = document.createElement('td');
            const limite = document.createElement('td');
            const nivel = document.createElement('td');
            const data = document.createElement('td');
            const selo = document.createElement('span');

            recurso.textContent = alerta.recurso;
            valor.textContent = `${formato.format(alerta.valor_medido)} ${alerta.unidade}`;
            limite.textContent = `${formato.format(alerta.limite)} ${alerta.unidade}`;
            data.textContent = alerta.data || '—';

            const critico = alerta.nivel === 'CRITICO';
            selo.className = `alert-level alert-level--${critico ? 'critical' : 'warning'}`;
            selo.textContent = critico ? 'Crítico' : 'Atenção';
            nivel.append(selo);
            linha.append(recurso, valor, limite, nivel, data);
            corpo.append(linha);
        }

        if (!dados.alertas.length) {
            mostrarVazio('Nenhuma ocorrência de alerta foi registrada no banco.');
        }

        contador.textContent = String(dados.total ?? dados.alertas.length);
        status.textContent = 'Exibindo eventos registrados na tabela alerta.';
        recebeuDados = true;
    }

    async function atualizarAlertas() {
        clearTimeout(timer);
        if (document.hidden || requisicao) return;

        const controller = new AbortController();
        requisicao = controller;
        const limite = setTimeout(() => controller.abort(), 8000);

        try {
            const resposta = await fetch('/alertas', {
                cache: 'no-store',
                signal: controller.signal,
            });
            if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

            const dados = await resposta.json();
            if (!Array.isArray(dados.alertas)) {
                throw new Error('Resposta /alertas inválida.');
            }
            if (!document.hidden) renderizar(dados);
        } catch (erro) {
            if (!document.hidden) {
                status.textContent = recebeuDados
                    ? 'Não foi possível atualizar os eventos de alerta.'
                    : 'Não foi possível consultar a tabela de alertas.';
                if (!recebeuDados) {
                    contador.textContent = '—';
                    mostrarVazio('Alertas indisponíveis. Verifique a conexão com o banco.');
                }
                console.error('Falha ao atualizar alertas:', erro);
            }
        } finally {
            clearTimeout(limite);
            requisicao = null;
            if (!document.hidden) timer = setTimeout(atualizarAlertas, 5000);
        }
    }

    document.addEventListener('visibilitychange', () => {
        clearTimeout(timer);
        if (document.hidden) requisicao?.abort();
        else atualizarAlertas();
    });
    atualizarAlertas();
})();
