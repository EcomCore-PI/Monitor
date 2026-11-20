const parametros = new URLSearchParams(window.location.search);
const idUrl = parseInt(parametros.get('servidor') || parametros.get('id_servidor'), 10);

// Sempre que a URL trouxer ?servidor=X (seja do login ou do clique no menu), atualiza o ativo
if (Number.isInteger(idUrl) && idUrl > 0) {
    sessionStorage.setItem('SERVIDOR_LOGIN', idUrl);
}

const idSessao = parseInt(sessionStorage.getItem('SERVIDOR_LOGIN'), 10);
const idAtivo = Number.isInteger(idSessao) && idSessao > 0 ? idSessao : null;

window.CONFIG_SERVIDOR = {
    id: idAtivo
};

// Se abriu uma página sem ?servidor= na URL (ex: Dashboard geral), exibe o ativo na barra
if (idAtivo && !parametros.has('servidor') && !parametros.has('id_servidor')) {
    parametros.set('servidor', idAtivo);
    const novaUrl = `${window.location.pathname}?${parametros.toString()}${window.location.hash}`;
    window.history.replaceState({}, '', novaUrl);
}