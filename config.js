const parametros = new URLSearchParams(window.location.search);
const idUrl = parseInt(parametros.get('servidor'), 10);

// Se veio ?servidor=X na URL, salva na sessão para as outras telas usarem
if (Number.isInteger(idUrl) && idUrl > 0) {
    sessionStorage.setItem('SERVIDOR_LOGIN', idUrl);
}

// Recupera o ID salvo na sessão do navegador
const idSessao = parseInt(sessionStorage.getItem('SERVIDOR_LOGIN'), 10);

window.CONFIG_SERVIDOR = {
    id: Number.isInteger(idSessao) && idSessao > 0 ? idSessao : null
};