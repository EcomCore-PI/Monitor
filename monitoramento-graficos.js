function idServidorAtual() { const n = parseInt(new URLSearchParams(window.location.search).get("servidor"), 10); return n > 0 ? n : 2; }
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

    function medidaRede(valor) {
        return typeof valor === 'number' && Number.isFinite(valor)
            ? `${formato.format(valor)} Mbps`
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

    const graficoRede = new Chart(document.getElementById('chartRede'), {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'Velocidade da rede (download)', data: [], borderColor: '#60a5fa', backgroundColor: '#60a5fa18', fill: false, borderWidth: 2, tension: 0.25, pointRadius: 0 },
            { label: 'Velocidade da rede (upload)', data: [], borderColor: '#34d399', backgroundColor: '#34d39918', fill: false, borderWidth: 2, tension: 0.25, pointRadius: 0 },
        ] },
        options: {
            responsive: true, maintainAspectRatio: false,
            animation: reduzMovimento.matches ? false : { duration: 250 },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'bottom' },
                tooltip: { callbacks: { label: item => `${item.dataset.label}: ${medidaRede(item.parsed.y)}` } },
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 5, maxRotation: 0 }, title: { display: true, text: 'Horário' } },
                y: { beginAtZero: true, ticks: { callback: valor => `${valor} Mbps` }, title: { display: true, text: 'Velocidade' } },
            },
        },
    });

    function preencherGrafico(grafico, leituras) {
        const pontos = Array.isArray(leituras) ? leituras.slice(-MAX_PONTOS) : [];
        grafico.data.labels = pontos.map(ponto => ponto.horario);
        grafico.data.datasets[0].data = pontos.map(ponto => ponto.valor);
        grafico.update(reduzMovimento.matches ? 'none' : undefined);
    }

    function renderizarKpis(dados) {
        const recursoAlertas = dados.recurso_mais_alertas;
        texto('kpi-recurso-alertas', recursoAlertas ? recursoAlertas.recurso : '—');

        const pico = dados.pico_utilizacao;
        texto('kpi-pico', pico ? percentual(pico.valor) : '—');
        texto('kpi-pico-info', pico ? `${pico.recurso}` : '');

        const discoLivre = dados.espaco_livre_disco;
        const discoLivrePercent = dados.disco_livre_percent;
        texto('kpi-disco-livre', discoLivre
            ? `${formato.format(discoLivre.livre_gb)} GB`
            : (discoLivrePercent != null ? percentual(discoLivrePercent) : '—'));
        texto('kpi-disco-livre-info', discoLivre
            ? `de ${formato.format(discoLivre.total_gb)} GB no total`
            : (discoLivrePercent != null
                ? 'livre (capacidade em GB indisponível)'
                : 'Capacidade do disco indisponível'));

        texto('kpi-criticos', String(dados.alertas_criticos_24h ?? 0));
        texto('kpi-criticos-info', '');
    }

    async function atualizarMetricas() {
        clearTimeout(timer);
        if (document.hidden || requisicao) return;

        const controller = new AbortController();
        requisicao = controller;
        const limite = setTimeout(() => controller.abort(), 8000);

        try {
            const resposta = await fetch('/dados?id_servidor=' + idServidorAtual(), {
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

            texto('kpi-cpu-info', '');
            texto('kpi-ram-info', '');
            texto('kpi-disco-info', '');

            for (const [tipo, grafico] of Object.entries(graficos)) {
                preencherGrafico(grafico, dados.historico[tipo]);
            }

            const recebidas = dados.historico['Rede Recebida'] || [];
            const enviadas = dados.historico['Rede Enviada'] || [];
            const calcularTaxasMbps = leituras => {
                const ordenadas = [...leituras].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
                return ordenadas.slice(1).map((leitura, indice) => {
                    const anterior = ordenadas[indice];
                    const segundos = (Date.parse(leitura.timestamp) - Date.parse(anterior.timestamp)) / 1000;
                    const diferencaMiB = leitura.valor - anterior.valor;
                    return Number.isFinite(diferencaMiB) && diferencaMiB >= 0 && segundos > 0
                        ? (diferencaMiB * 8.388608) / segundos
                        : null;
                }).map((taxa, indice) => ({ timestamp: ordenadas[indice + 1].timestamp, taxa }))
                    .slice(-MAX_PONTOS);
            };
            // Calcula cada direção separadamente; os horários das inserções podem diferir.
            const downloads = calcularTaxasMbps(dados.historico['Rede Recebida'] || []);
            const uploads = calcularTaxasMbps(dados.historico['Rede Enviada'] || []);
            const horariosRede = [...new Set([
                ...downloads.map(ponto => ponto.timestamp),
                ...uploads.map(ponto => ponto.timestamp),
            ])].sort();
            const alinharTaxas = pontos => new Map(pontos.map(ponto => [ponto.timestamp, ponto.taxa]));
            const mapaDownload = alinharTaxas(downloads);
            const mapaUpload = alinharTaxas(uploads);
            graficoRede.data.labels = horariosRede.map(horario => new Date(horario).toLocaleTimeString('pt-BR'));
            graficoRede.data.datasets[0].data = horariosRede.map(horario => mapaDownload.get(horario) ?? null);
            graficoRede.data.datasets[1].data = horariosRede.map(horario => mapaUpload.get(horario) ?? null);            graficoRede.update(reduzMovimento.matches ? 'none' : undefined);
            texto('network-status', !recebidas.length || !enviadas.length
                ? 'Sem capturas de rede para este servidor.'
                : !downloads.length || !uploads.length
                    ? 'Aguardando a segunda captura para calcular a velocidade.'
                    : 'Velocidade em Mbps de recebimento e envio');

            renderizarKpis(dados.kpis || {});

            texto(
                'metrics-status',
                dados.atual.horario_formatado
                    ? ``
                    : ''
            );
            status.dataset.error = 'false';
        } catch (erro) {
            if (!document.hidden) {
                texto('metrics-status', '');
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
            [...Object.values(graficos), graficoRede].forEach(grafico => grafico.stop());
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
            mostrarVazio('');
        }

        contador.textContent = String(dados.total ?? dados.alertas.length);
        status.textContent = 'Exibindo alertas';
        recebeuDados = true;
    }

    async function atualizarAlertas() {
        clearTimeout(timer);
        if (document.hidden || requisicao) return;

        const controller = new AbortController();
        requisicao = controller;
        const limite = setTimeout(() => controller.abort(), 8000);

        try {
            const resposta = await fetch('/alertas?id_servidor=' + idServidorAtual(), {
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
                    ? ''
                    : '';
                if (!recebeuDados) {
                    contador.textContent = '—';
                    mostrarVazio('');
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
