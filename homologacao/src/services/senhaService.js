const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);

async function gerarHash(senha) {
    const salt = crypto.randomBytes(16).toString("hex");
    const derivacao = await scrypt(senha, salt, 64);
    return `scrypt$${salt}$${derivacao.toString("hex")}`;
}

async function verificar(senha, hashArmazenado) {
    // Compatibilidade temporária com as contas de demonstração do SQL antigo.
    if (!hashArmazenado || !hashArmazenado.startsWith("scrypt$")) {
        return hashArmazenado === senha;
    }

    const partes = hashArmazenado.split("$");
    if (partes.length !== 3) return false;
    const esperado = Buffer.from(partes[2], "hex");
    const recebido = await scrypt(senha, partes[1], esperado.length);
    return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}

function gerarToken() {
    return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = { gerarHash, verificar, gerarToken, hashToken };
