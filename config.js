const parametros = new URLSearchParams(window.location.search);
const idUrl = parseInt(parametros.get('servidor') || parametros.get('id_servidor'), 10);

// Se veio ?servidor=X na URL, salva na sessão para as outras telas usarem
if (Number.isInteger(idUrl) && idUrl > 0) {
    sessionStorage.setItem('SERVIDOR_LOGIN', idUrl);
}

// Recupera o ID salvo na sessão do navegador
const idSessao = parseInt(sessionStorage.getItem('SERVIDOR_LOGIN'), 10);
const idAtivo = Number.isInteger(idSessao) && idSessao > 0 ? idSessao : null;

window.CONFIG_SERVIDOR = {
    id: idAtivo
};

// Mantém ?servidor=X visível na URL atual e em todos os links internos de navegação
if (idAtivo) {
    if (!parametros.has('servidor')) {
        parametros.set('servidor', idAtivo);
        const novaUrl = `${window.location.pathname}?${parametros.toString()}${window.location.hash}`;
        window.history.replaceState({}, '', novaUrl);
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('a[href]').forEach((link) => {
            const href = link.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('javascript:')) {
                return;
            }

            const url = new URL(href, window.location.href);
            if (!url.searchParams.has('servidor')) {
                url.searchParams.set('servidor', idAtivo);
                link.setAttribute('href', url.pathname + url.search + url.hash);
            }
        });
    });
}