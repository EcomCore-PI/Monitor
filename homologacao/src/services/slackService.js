async function enviarAlerta(texto) {
    const resposta = await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({text: texto})
    });

    if(!resposta.ok){
        throw new Error("Slack respondeu com status " + resposta.status)
    }
    
}

module.exports = {enviarAlerta};