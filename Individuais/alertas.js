(() => {
    const caminho = window.location.pathname.toLowerCase();
    const recursoAlvo = caminho.includes('memoria')
        ? 'ram'
        : caminho.includes('disco')
            ? 'disco'
            : null;
    const corpo = document.getElementById('recentAlerts');
    const contador = document.getElementById('alertCount');
    if (!corpo || !contador) return;

    function idServidorAtual() {
        const params = new URLSearchParams(window.location.search);
        const informado = params.get('id_servidor') || params.get('servidor');
        const id = Number(informado || window.CONFIG_SERVIDOR?.id || 3);
        return Number.isInteger(id) && id > 0 ? id : 3;
    }

    function alertasDoRecurso(alertas) {
        if (!recursoAlvo) return alertas;
        return alertas.filter(alerta =>
            String(alerta.recurso || '').toLowerCase().includes(recursoAlvo)
        );
    }

    function renderizar(alertas) {
        const recentes = alertasDoRecurso(alertas).slice(0, 4);
        contador.textContent = String(recentes.length);
        corpo.replaceChildren();

        if (recentes.length === 0) {
            const linha = document.createElement('tr');
            const celula = document.createElement('td');
            celula.colSpan = 3;
            celula.textContent = 'Nenhum alerta recente';
            linha.append(celula);
            corpo.append(linha);
            return;
        }

        for (const alerta of recentes) {
            const linha = document.createElement('tr');
            const horario = document.createElement('td');
            const nivel = document.createElement('td');
            const valor = document.createElement('td');
            const selo = document.createElement('span');
            const critico = String(alerta.nivel).toUpperCase() === 'CRITICO';

            horario.textContent = alerta.horario_captura || alerta.data || '--:--';
            selo.className = `alert-level alert-level--${critico ? 'critical' : 'warning'}`;
            selo.textContent = critico ? 'CRÍTICO' : 'ATENÇÃO';
            nivel.append(selo);
            valor.textContent = `${Number(alerta.valor_medido).toFixed(1)}${alerta.unidade || ''}`;
            linha.append(horario, nivel, valor);
            corpo.append(linha);
        }
    }

    async function atualizar() {
        try {
            const filtroRecurso = recursoAlvo === 'ram' ? '&recurso=RAM' : recursoAlvo === 'disco' ? '&recurso=Disco' : '';
            const resposta = await fetch(`/alertas?id_servidor=${idServidorAtual()}${filtroRecurso}`, {
                cache: 'no-store'
            });
            if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
            const dados = await resposta.json();
            if (!Array.isArray(dados.alertas)) throw new Error('Resposta /alertas inválida.');
            renderizar(dados.alertas);
        } catch (erro) {
            console.error('Falha ao atualizar alertas recentes:', erro);
        }
    }

    atualizar();
    setInterval(atualizar, 5000);
})();
