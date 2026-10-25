const parametros = new URLSearchParams(window.location.search);
const idUrl = parseInt(parametros.get('servidor'), 10);
window.CONFIG_SERVIDOR = { id: Number.isInteger(idUrl) && idUrl > 0 ? idUrl : 2 };
