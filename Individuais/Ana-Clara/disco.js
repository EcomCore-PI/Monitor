// Dashboard de disco - inicialização segura e atualização das métricas
(function () {
    const maxPontos = 15;
    const historico = { labels: [], latRead: [], latWrite: [], readMb: [], writeMb: [] };
    const fmt = (n, d = 2) => Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
    function put(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
        else console.warn(`[Disco] Elemento HTML #${id} não encontrado; atualização ignorada.`);
    }
    function valor(d, k) { return Number(d?.[k] ?? 0); }

    function criarGrafico(canvasId, series, label) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error(`[Disco] Canvas #${canvasId} não encontrado. Gráfico não inicializado.`);
            return null;
        }
        if (typeof Chart === 'undefined') {
            console.error('[Disco] Chart.js não foi carregado. Verifique a conexão/CDN.');
            return null;
        }
        const ctx = canvas.getContext?.('2d');
        if (!ctx) {
            console.error(`[Disco] Não foi possível obter contexto 2D do canvas #${canvasId}.`);
            return null;
        }
        return new Chart(ctx, {
            type: 'line',
            data: { labels: historico.labels, datasets: series },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { ticks: { maxRotation: 0 } },
                    y: { beginAtZero: true, title: { display: true, text: label } }
                },
                plugins: { legend: { display: true } }
            }
        });
    }

    function inicializar() {
        if (typeof Chart !== 'undefined') {
            Chart.defaults.color = '#8f98aa';
            Chart.defaults.borderColor = 'rgba(255,255,255,.06)';
            Chart.defaults.font.family = "'Inter', sans-serif";
        }
        const chartLatencia = criarGrafico('graficoLatencia', [
            { label: 'Leitura (ms)', data: historico.latRead, borderColor: '#005AFE', backgroundColor: '#005AFE22', tension: .25, pointRadius: 2 },
            { label: 'Escrita (ms)', data: historico.latWrite, borderColor: '#10b981', backgroundColor: '#10b98122', tension: .25, pointRadius: 2 }
        ], 'Milissegundos');
        const chartTransferencia = criarGrafico('graficoTransferencia', [
            { label: 'Leitura (MB/s)', data: historico.readMb, borderColor: '#005AFE', backgroundColor: '#005AFE22', fill: true, tension: .25, pointRadius: 2 },
            { label: 'Escrita (MB/s)', data: historico.writeMb, borderColor: '#f59e0b', backgroundColor: '#f59e0b22', fill: true, tension: .25, pointRadius: 2 }
        ], 'MB/s');

        async function atualizar() {
            try {
                const idServidor = window.CONFIG_SERVIDOR?.id;
                const response = await fetch(`/metricas/disco?id_servidor=${idServidor}`);
                if (!response.ok) throw new Error(`HTTP ${response.status} ao consultar /metricas/disco`);
                const retorno = await response.json();
                const registros = (Array.isArray(retorno) ? retorno : retorno ? [retorno] : []).slice(-maxPontos);
                const d = registros.at(-1);
                if (!d || d.disco_percentual === undefined) throw new Error('A API não retornou registros com disco_percentual. Confira a coleta e o banco.');

                const percent = valor(d, 'disco_percentual'), used = valor(d, 'disco_usado_gb'), free = valor(d, 'disco_livre_gb'), total = valor(d, 'disco_total_gb');
                const io = valor(d, 'disco_io_utilizacao_percent'), iops = valor(d, 'disco_iops'), latR = valor(d, 'disco_latencia_leitura_ms'), latW = valor(d, 'disco_latencia_escrita_ms'), read = valor(d, 'disco_leitura_mb_s'), write = valor(d, 'disco_escrita_mb_s');
                put('percentual', `${fmt(percent, 1)}%`); put('livre', `${fmt(free)} GB`); put('ioUtilizacao', `${fmt(io, 1)}%`); put('iops', fmt(iops, 0));
                put('estado', `Nível: ${percent >= 90 ? 'Crítico' : percent >= 80 ? 'Atenção' : 'Normal'}`);
                put('mUsado', `${fmt(used)} GB`); put('mLivre', `${fmt(free)} GB`); put('mTotal', `${fmt(total)} GB`); put('mPercent', `${fmt(percent, 1)}%`); put('mIO', `${fmt(io, 1)}%`); put('mIOPS', fmt(iops, 1)); put('mLatRead', `${fmt(latR, 2)} ms`); put('mLatWrite', `${fmt(latW, 2)} ms`); put('mRead', `${fmt(read, 2)} MB/s`); put('mWrite', `${fmt(write, 2)} MB/s`);
                historico.labels.splice(0, historico.labels.length, ...registros.map(r => r.horario || '--:--'));
                historico.latRead.splice(0, historico.latRead.length, ...registros.map(r => valor(r, 'disco_latencia_leitura_ms')));
                historico.latWrite.splice(0, historico.latWrite.length, ...registros.map(r => valor(r, 'disco_latencia_escrita_ms')));
                historico.readMb.splice(0, historico.readMb.length, ...registros.map(r => valor(r, 'disco_leitura_mb_s')));
                historico.writeMb.splice(0, historico.writeMb.length, ...registros.map(r => valor(r, 'disco_escrita_mb_s')));
                if (chartLatencia) chartLatencia.update();
                if (chartTransferencia) chartTransferencia.update();
                put('status', `Dados atualizados do banco · Última leitura: ${d.horario || new Date().toLocaleTimeString('pt-BR')}`);
            } catch (err) {
                put('status', 'Não foi possível atualizar as métricas. Verifique API, servidor e banco.');
                console.error('[Disco] Erro ao buscar/atualizar métricas:', err);
            }
        }
        atualizar();
        setInterval(atualizar, 5000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inicializar, { once: true });
    else inicializar();
})();
