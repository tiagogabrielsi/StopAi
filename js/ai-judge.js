// js/ai-judge.js

// 🔴 1. COLE SUA CHAVE DA GROQ AQUI DENTRO DAS ASPAS:
const API_KEY = "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"; 

const delay = ms => new Promise(res => setTimeout(res, ms));

export async function validarRespostasComGemini(letra, listaJogadores) {
    console.log(`🤖 AI Judge (Rigoroso + Cultural): Validando letra '${letra}'...`);

    const systemPrompt = `
        Você é o Juiz Oficial do jogo Stop (Adedonha) no Brasil.
        Sua missão é validar se a palavra faz sentido semanticamente.
        
        REGRAS DE OURO (Siga estritamente):
        
        1. CATEGORIA "COR":
           - Aceite apenas CORES reais (Azul, Ocre, Ciano, Salmão).
           - RECUSE objetos/comidas (Ex: "Espinafre", "Céu", "Fogo" -> FALSE).
           - Aceite nomes comuns de cores (Laranja, Rosa, Violeta -> TRUE).

        2. ORTOGRAFIA E TRAPAÇAS:
           - Aceite erros leves de digitação (Ex: "Abacxi" -> TRUE).
           - RECUSE trocas de letra propositais (Ex: "Ecerola" na letra E -> FALSE).

        3. CATEGORIA GERAL:
           - A palavra deve pertencer inequivocamente à categoria.
           - "Rato" em "Nome" -> FALSE.

        4. CATEGORIAS ESPECÍFICAS (Importante):
           - "Verbo": A palavra DEVE ser um verbo/ação (Ex: Andar, Comer). "Amor" é substantivo -> FALSE.
           - "MSE" ou "Minha Sogra É": Aceite adjetivos ou características (Ex: Amiga, Chata, Bonita).

        Retorne APENAS o JSON booleano.
    `;

    const userPrompt = `
        Letra da rodada: ${letra}
        Respostas dos Jogadores: ${JSON.stringify(listaJogadores)}
        
        Formato de Saída OBRIGATÓRIO (JSON puro):
        { "id_jogador": { "detalhes": { "Categoria": true, "Outra": false } } }
    `;

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile", 
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.1 
                })
            });

            if (response.status === 401) throw new Error("401 - Chave API Inválida!");
            if (response.status === 429) { console.warn("⚠️ Rate Limit."); throw new Error("429"); }
            if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);

            const data = await response.json();
            let content = data.choices[0].message.content;
            
            const firstBrace = content.indexOf('{');
            const lastBrace = content.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                content = content.substring(firstBrace, lastBrace + 1);
            }

            const jsonFinal = JSON.parse(content);
            
            // --- TRAVA DE SEGURANÇA (JavaScript) ---
            Object.keys(jsonFinal).forEach(id => {
                const respostasOriginais = listaJogadores[id];
                const validacoesIA = jsonFinal[id].detalhes;

                if (respostasOriginais && validacoesIA) {
                    Object.keys(respostasOriginais).forEach(cat => {
                        let palavra = respostasOriginais[cat] ? respostasOriginais[cat].trim().toUpperCase() : "";
                        const palavraLimpa = palavra.replace(/^(O |A |UM |UMA )/, ""); 

                        // Validação JS: Garante a letra inicial
                        const começaComLetraCerta = palavraLimpa.startsWith(letra.toUpperCase());
                        
                        if (!começaComLetraCerta || palavraLimpa.length < 2) {
                            validacoesIA[cat] = false; 
                        }
                    });
                }
            });

            // Recalcula pontos
            Object.keys(jsonFinal).forEach(id => {
                let pts = 0;
                if(jsonFinal[id].detalhes) {
                    Object.values(jsonFinal[id].detalhes).forEach(v => { if(v) pts += 10; });
                }
                jsonFinal[id].pontos = pts;
            });

            console.log("✅ Validação Inteligente Sucesso:", jsonFinal);
            return jsonFinal;

        } catch (erro) {
            console.error(`❌ Erro Validação:`, erro);
            if (tentativa < 3) await delay(2000);
        }
    }

    console.warn("🚨 Modo Offline.");
    return gerarValidacaoDeEmergencia(letra, listaJogadores);
}

function gerarValidacaoDeEmergencia(letra, listaJogadores) {
    const resultado = {};
    const letraUpper = letra.toUpperCase();

    Object.keys(listaJogadores).forEach(id => {
        const respostas = listaJogadores[id];
        const detalhes = {};
        let pontos = 0;
        if (respostas) {
            Object.keys(respostas).forEach(cat => {
                let resp = respostas[cat] ? respostas[cat].trim().toUpperCase() : "";
                resp = resp.replace(/^(O |A |UM |UMA )/, "");
                if (resp.length > 1 && resp.startsWith(letraUpper)) {
                    detalhes[cat] = true; pontos += 10;
                } else { detalhes[cat] = false; }
            });
        }
        resultado[id] = { pontos: pontos, detalhes: detalhes };
    });
    return resultado;
}