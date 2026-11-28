// IDs dos servidores correspondentes a cada módulo individual (mesmos do config.js)
const SERVIDORES_INDIVIDUAIS = {
    cpu: 6,
    memoria: 3,
    disco: 4,
    rede: 1
};

function idServidorAtual() {
    const n = parseInt(new URLSearchParams(window.location.search).get("servidor"), 10);
    if (n > 0) {
        sessionStorage.setItem("SERVIDOR_LOGIN", n);
        return n;
    }
    return parseInt(sessionStorage.getItem("SERVIDOR_LOGIN"), 10) || 6;
}

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
        data: {
            labels: [],
            datasets: [
                { label: 'Velocidade da rede (download)', data: [], borderColor: '#60a5fa', backgroundColor: '#60a5fa18', fill: false, borderWidth: 2, tension: 0.25, pointRadius: 0 },
                { label: 'Velocidade da rede (upload)', data: [], borderColor: '#34d399', backgroundColor: '#34d39918', fill: false, borderWidth: 2, tension: 0.25, pointRadius: 0 },
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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

    async function buscarRotaIndividual(url, signal) {
        try {
            const resp = await fetch(url, { cache: 'no-store', signal });
            if (!resp.ok) return [];
            const json = await resp.json();
            return Array.isArray(json) ? json : (json ? [json] : []);
        } catch (_) {
            return [];
        }
    }

    async function atualizarMetricas() {
        clearTimeout(timer);
        if (document.hidden || requisicao) return;

        const controller = new AbortController();
        requisicao = controller;
        const limite = setTimeout(() => controller.abort(), 8000);

        try {
            // Busca em paralelo os dados gravados por cada módulo individual
            const [histCpu, histRam, histDisco, histRede] = await Promise.all([
                buscarRotaIndividual(`/metricas/cpu?id_servidor=${SERVIDORES_INDIVIDUAIS.cpu}`, controller.signal),
                buscarRotaIndividual(`/metricas/memoria?id_servidor=${SERVIDORES_INDIVIDUAIS.memoria}`, controller.signal),
                buscarRotaIndividual(`/metricas/disco?id_servidor=${SERVIDORES_INDIVIDUAIS.disco}`, controller.signal),
                buscarRotaIndividual(`/metricas/rede?id_servidor=${SERVIDORES_INDIVIDUAIS.rede}`, controller.signal),
            ]);

            // 1. Normaliza CPU (mesmo cálculo do cpu.js)
            const leiturasCpu = histCpu.map(item => {
                const total = item.cpu_total !== undefined
                    ? Number(item.cpu_total)
                    : Number((Number(item.cpu_user ?? 0) + Number(item.cpu_system ?? 0) + Number(item.cpu_iowait ?? 0) + Number(item.cpu_steal ?? 0)).toFixed(1));
                return { horario: item.horario || '--:--', valor: Math.min(100, Math.max(0, total)) };
            });

            // 2. Normaliza RAM (memoria.js)
            const leiturasRam = histRam
                .filter(item => item.ram_percentual !== undefined)
                .map(item => ({ horario: item.horario || '--:--', valor: Number(item.ram_percentual) }));

            // 3. Normaliza Disco (disco.js)
            const leiturasDisco = histDisco
                .filter(item => item.disco_percentual !== undefined)
                .map(item => ({ horario: item.horario || '--:--', valor: Number(item.disco_percentual) }));

            // Atualiza gráficos de CPU, RAM e Disco
            preencherGrafico(graficos.CPU, leiturasCpu);
            preencherGrafico(graficos.RAM, leiturasRam);
            preencherGrafico(graficos.Disco, leiturasDisco);

            // 4. Atualiza Gráfico de Rede (rede.js já retorna download_mbps e upload_mbps)
            const pontosRede = histRede.slice(-MAX_PONTOS);
            graficoRede.data.labels = pontosRede.map(item => item.horario || '--:--');
            graficoRede.data.datasets[0].data = pontosRede.map(item => item.download_mbps != null ? Number(item.download_mbps) : null);
            graficoRede.data.datasets[1].data = pontosRede.map(item => item.upload_mbps != null ? Number(item.upload_mbps) : null);
            graficoRede.update(reduzMovimento.matches ? 'none' : undefined);

            texto('network-status', pontosRede.length === 0
                ? 'Sem capturas de rede registradas.'
                : 'Velocidade em Mbps de recebimento e envio');

            // 5. Calcula os 4 KPIs consolidados da Dashboard Geral
            const ultimaCpu = leiturasCpu.at(-1)?.valor ?? null;
            const ultimaRam = leiturasRam.at(-1)?.valor ?? null;
            const ultimoDiscoObj = histDisco.at(-1) || null;
            const ultimoDiscoPct = ultimoDiscoObj?.disco_percentual != null ? Number(ultimoDiscoObj.disco_percentual) : null;

            // KPI: Pico de utilização atual entre CPU, RAM e Disco
            const candidatosPico = [
                { recurso: 'CPU', valor: ultimaCpu },
                { recurso: 'Memória RAM', valor: ultimaRam },
                { recurso: 'Disco', valor: ultimoDiscoPct },
            ].filter(c => c.valor !== null && Number.isFinite(c.valor));

            if (candidatosPico.length > 0) {
                const maior = candidatosPico.reduce((max, atual) => atual.valor > max.valor ? atual : max);
                texto('kpi-pico', percentual(maior.valor));
                texto('kpi-pico-info', `Componente: ${maior.recurso}`);
            } else {
                texto('kpi-pico', '—');
                texto('kpi-pico-info', '');
            }

            // KPI: Espaço livre em disco (do módulo da Ana-Clara)
            if (ultimoDiscoObj && ultimoDiscoObj.disco_livre_gb != null) {
                texto('kpi-disco-livre', `${formato.format(Number(ultimoDiscoObj.disco_livre_gb))} GB`);
                texto('kpi-disco-livre-info', ultimoDiscoObj.disco_total_gb != null
                    ? `de ${formato.format(Number(ultimoDiscoObj.disco_total_gb))} GB no total`
                    : '');
            } else if (ultimoDiscoPct !== null) {
                texto('kpi-disco-livre', percentual(100 - ultimoDiscoPct));
                texto('kpi-disco-livre-info', 'livre no volume');
            } else {
                texto('kpi-disco-livre', '—');
                texto('kpi-disco-livre-info', 'Aguardando leitura de disco');
            }

            const ultimaHora = leiturasCpu.at(-1)?.horario || leiturasRam.at(-1)?.horario || ultimoDiscoObj?.horario || '';
            texto('metrics-status', ultimaHora ? `Consolidado dos módulos · Última leitura: ${ultimaHora}` : 'Aguardando dados dos módulos...');
            status.dataset.error = 'false';
        } catch (erro) {
            if (!document.hidden) {
                texto('metrics-status', 'Falha ao consolidar métricas individuais.');
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

    function renderizar(alertas) {
        corpo.replaceChildren();

        for (const alerta of alertas) {
            const linha = document.createElement('tr');
            const recurso = document.createElement('td');
            const valor = document.createElement('td');
            const limite = document.createElement('td');
            const nivel = document.createElement('td');
            const data = document.createElement('td');
            const selo = document.createElement('span');

            recurso.textContent = alerta.recurso || '—';
            valor.textContent = `${formato.format(Number(alerta.valor_medido ?? 0))} ${alerta.unidade || ''}`.trim();
            limite.textContent = alerta.limite != null ? `${formato.format(Number(alerta.limite))} ${alerta.unidade || ''}`.trim() : '—';
            data.textContent = alerta.horario_captura || alerta.data || '—';

            const critico = String(alerta.nivel).toUpperCase() === 'CRITICO';
            selo.className = `alert-level alert-level--${critico ? 'critical' : 'warning'}`;
            selo.textContent = critico ? 'Crítico' : 'Atenção';
            nivel.append(selo);
            linha.append(recurso, valor, limite, nivel, data);
            corpo.append(linha);
        }

        if (!alertas.length) {
            mostrarVazio('Nenhum alerta registrado nos servidores monitorados.');
        }

        // Atualiza os 2 KPIs baseados em alertas na Dashboard Geral
        const criticos = alertas.filter(a => String(a.nivel).toUpperCase() === 'CRITICO').length;
        const elCriticos = document.getElementById('kpi-criticos');
        if (elCriticos) elCriticos.textContent = String(criticos);

        const contagemPorRecurso = {};
        for (const a of alertas) {
            const nomeRec = a.recurso || 'Outro';
            contagemPorRecurso[nomeRec] = (contagemPorRecurso[nomeRec] || 0) + 1;
        }
        const maisAlertas = Object.entries(contagemPorRecurso).sort((a, b) => b[1] - a[1])[0];
        const elMaisAlertas = document.getElementById('kpi-recurso-alertas');
        const elMaisAlertasInfo = document.getElementById('kpi-recurso-alertas-info');
        if (elMaisAlertas) elMaisAlertas.textContent = maisAlertas ? maisAlertas[0] : '—';
        if (elMaisAlertasInfo) elMaisAlertasInfo.textContent = maisAlertas ? `${maisAlertas[1]} alerta(s) registrado(s)` : '';

        contador.textContent = String(alertas.length);
        status.textContent = 'Alertas consolidados dos servidores';
        recebeuDados = true;
    }

    async function atualizarAlertas() {
        clearTimeout(timer);
        if (document.hidden || requisicao) return;

        const controller = new AbortController();
        requisicao = controller;
        const limite = setTimeout(() => controller.abort(), 8000);

        try {
            // Busca os alertas de todos os servidores individuais em paralelo
            const idsUnicos = [...new Set(Object.values(SERVIDORES_INDIVIDUAIS))];
            const respostas = await Promise.all(
                idsUnicos.map(id =>
                    fetch(`/alertas?id_servidor=${id}`, { cache: 'no-store', signal: controller.signal })
                        .then(r => (r.ok ? r.json() : { alertas: [] }))
                        .catch(() => ({ alertas: [] }))
                )
            );

            const todosAlertas = respostas.flatMap(d => (Array.isArray(d.alertas) ? d.alertas : []));
            // Ordena pelos mais recentes
            todosAlertas.sort((a, b) => String(b.data || b.horario_captura || '').localeCompare(String(a.data || a.horario_captura || '')));

            if (!document.hidden) renderizar(todosAlertas);
        } catch (erro) {
            if (!document.hidden) {
                if (!recebeuDados) {
                    contador.textContent = '—';
                    mostrarVazio('Erro ao carregar alertas consolidados.');
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