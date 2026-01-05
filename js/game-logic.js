import { db, ref, set, push, onValue, update, get, child } from './firebase-config.js';
import { validarRespostasComGemini } from './ai-judge.js';

let usuarioAtual = "";
let salaId = "";
let isHost = false;
let jogadorId = ""; 
let avatarSeed = "Felix";
let rankingTimeout; 
let evalTimeout;
let isProcessingRound = false; 
const ALFABETO_COMPLETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

let configSala = {
    tempo: 60,
    rodadas: 5, 
    categorias: ["Nome", "Animal", "Cor", "Fruta", "Objeto", "CEP"],
    letras: [...ALFABETO_COMPLETO]
};

// UI ALERTAS
window.mostrarAlerta = function(msg, callback = null) {
    const modal = document.getElementById('custom-modal');
    document.getElementById('modal-message').innerText = msg;
    document.getElementById('modal-title').innerText = "Atenção";
    document.getElementById('modal-icon').innerText = "⚠️";
    document.getElementById('btn-modal-cancel').classList.add('hidden');
    const btnOk = document.getElementById('btn-modal-ok');
    btnOk.innerText = "ENTENDI";
    btnOk.onclick = function() { window.fecharModal(); if(callback) callback(); };
    modal.classList.remove('hidden');
}
window.mostrarConfirmacao = function(msg, callbackSim) {
    const modal = document.getElementById('custom-modal');
    document.getElementById('modal-message').innerText = msg;
    document.getElementById('modal-title').innerText = "Confirmação";
    document.getElementById('modal-icon').innerText = "🤔";
    document.getElementById('btn-modal-cancel').classList.remove('hidden');
    document.getElementById('btn-modal-cancel').onclick = window.fecharModal;
    const btnOk = document.getElementById('btn-modal-ok');
    btnOk.innerText = "SIM";
    btnOk.onclick = function() { window.fecharModal(); callbackSim(); };
    modal.classList.remove('hidden');
}
window.fecharModal = function() { document.getElementById('custom-modal').classList.add('hidden'); }

// TELAS
function gerenciarTelas(telaParaMostrar) {
    const telas = ['login-screen', 'lobby-screen', 'game-screen', 'evaluation-screen', 'round-ranking-screen', 'roulette-overlay', 'podium-screen'];
    telas.forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });
    const telaAlvo = document.getElementById(telaParaMostrar);
    if (telaAlvo) telaAlvo.classList.remove('hidden');
}

// LOGIN & FAXINA
window.trocarAvatar = function() {
    avatarSeed = Math.random().toString(36).substring(7);
    const img = document.getElementById('my-avatar');
    if(img) img.src = `https://api.dicebear.com/9.x/adventurer/svg?seed=${avatarSeed}`;
}

async function faxinaNoBanco() {
    const TEMPO_LIMITE = 24 * 60 * 60 * 1000; 
    const agora = Date.now();
    try {
        const snapshot = await get(ref(db, 'salas'));
        if (snapshot.exists()) {
            const salas = snapshot.val();
            const updates = {};
            let salasRemovidas = 0;
            Object.keys(salas).forEach(key => {
                const sala = salas[key];
                if (!sala.criadoEm || (agora - sala.criadoEm > TEMPO_LIMITE)) {
                    updates[`salas/${key}`] = null;
                    salasRemovidas++;
                }
            });
            if (salasRemovidas > 0) await update(ref(db), updates);
        }
    } catch (e) { console.error("Erro na faxina:", e); }
}

window.clicarCriar = async function() {
    const nome = document.getElementById('username').value.trim();
    if (!nome) return window.mostrarAlerta("Escolha um apelido!");
    faxinaNoBanco();
    usuarioAtual = nome; isHost = true;
    salaId = Math.floor(Math.random() * 9000 + 1000).toString();
    const novaSalaRef = ref(db, 'salas/' + salaId);
    if ((await get(novaSalaRef)).exists()) return window.clicarCriar();
    
    const novoJogadorRef = push(ref(db, `salas/${salaId}/jogadores`));
    jogadorId = novoJogadorRef.key;

    await set(novaSalaRef, { 
        status: 'AGUARDANDO', rodadaAtual: 1, host: usuarioAtual, config: configSala, 
        votosPular: 0, categoriaAtualIndex: -1, criadoEm: Date.now()
    });
    await set(novoJogadorRef, { nome: usuarioAtual, pontos: 0, isHost: true, avatar: `https://api.dicebear.com/9.x/adventurer/svg?seed=${avatarSeed}`, estouPronto: false });
    entrarNoLobby(salaId);
}

window.mostrarInputCodigo = function() { usuarioAtual = document.getElementById('username').value.trim(); if (!usuarioAtual) return window.mostrarAlerta("Escolha um apelido!"); document.getElementById('main-buttons').classList.add('hidden'); document.getElementById('join-area').classList.remove('hidden'); }
window.voltarParaMenu = function() { document.getElementById('join-area').classList.add('hidden'); document.getElementById('main-buttons').classList.remove('hidden'); }
window.confirmarEntrada = async function() { 
    salaId = document.getElementById('room-code-input').value.trim(); 
    if (!salaId) return window.mostrarAlerta("Digite o código!"); 
    const salaRef = ref(db, 'salas/' + salaId); 
    if (!(await get(salaRef)).exists()) return window.mostrarAlerta("Sala não existe!"); 
    const novoJogadorRef = push(ref(db, `salas/${salaId}/jogadores`)); 
    jogadorId = novoJogadorRef.key; 
    await set(novoJogadorRef, { nome: usuarioAtual, pontos: 0, isHost: false, avatar: `https://api.dicebear.com/9.x/adventurer/svg?seed=${avatarSeed}`, estouPronto: false }); 
    entrarNoLobby(salaId); 
}

// CONFIGS
window.atualizarConfig = function() { if(!isHost) return; update(ref(db, `salas/${salaId}/config`), { tempo: parseInt(document.getElementById('config-time').value), rodadas: parseInt(document.getElementById('config-rounds').value) }); }
window.adicionarCategoria = function() { const cat = document.getElementById('new-cat-input').value.trim(); if(isHost && cat && !configSala.categorias.includes(cat)) update(ref(db, `salas/${salaId}/config`), { categorias: [...configSala.categorias, cat] }); }
window.removerCategoria = function(cat) { if(isHost) update(ref(db, `salas/${salaId}/config`), { categorias: configSala.categorias.filter(c => c !== cat) }); }
window.toggleLetra = function(letra) { if(isHost) update(ref(db, `salas/${salaId}/config`), { letras: configSala.letras.includes(letra) ? configSala.letras.filter(l=>l!==letra) : [...configSala.letras, letra].sort() }); }
window.alternarTodasLetras = function(ativar) { if(isHost) update(ref(db, `salas/${salaId}/config`), { letras: ativar ? [...ALFABETO_COMPLETO] : [] }); }

function renderizarPainelConfig() {
    document.getElementById('categories-tags').innerHTML = configSala.categorias.map(c => `<div class="cat-tag">${c} ${isHost ? `<span onclick="window.removerCategoria('${c}')">×</span>` : ''}</div>`).join('');
    const grid = document.getElementById('alphabet-grid'); grid.innerHTML = '';
    ALFABETO_COMPLETO.forEach(l => {
        const atv = configSala.letras.includes(l);
        const b = document.createElement('div'); b.className = `letter-btn ${atv?'active':''}`; b.innerText = l;
        if(isHost) b.onclick = () => window.toggleLetra(l); else b.style.opacity = atv ? '1' : '0.3';
        grid.appendChild(b);
    });
    document.getElementById('config-time').value = configSala.tempo; document.getElementById('config-rounds').value = configSala.rodadas || 5; 
    if(!isHost) { document.getElementById('config-time').disabled = true; document.getElementById('config-rounds').disabled = true; document.getElementById('new-cat-input').disabled = true; document.querySelector('.add-category-box').style.display='none'; document.querySelector('.alphabet-actions').style.display='none'; }
}

// JOGO
window.iniciarPartidaHost = function() {
    if (!configSala.letras || configSala.letras.length === 0) return window.mostrarAlerta("Escolha letras!");
    const pool = configSala.letras; const letra = pool[Math.floor(Math.random() * pool.length)];
    const updates = {};
    updates[`salas/${salaId}/status`] = 'SORTEANDO'; updates[`salas/${salaId}/letraAtual`] = letra;
    updates[`salas/${salaId}/jogadorQueParou`] = null; updates[`salas/${salaId}/categoriaAtualIndex`] = -1; updates[`salas/${salaId}/votosPular`] = 0;
    
    get(ref(db, `salas/${salaId}/jogadores`)).then(snap => {
        const jogs = snap.val();
        if(jogs) {
            Object.keys(jogs).forEach(pid => { 
                updates[`salas/${salaId}/jogadores/${pid}/estouPronto`] = false; 
                updates[`salas/${salaId}/jogadores/${pid}/contestacoes`] = null; 
            });
            update(ref(db), updates);
            isProcessingRound = false; 
            setTimeout(() => { update(ref(db, `salas/${salaId}`), { status: 'JOGANDO' }); }, 4500); 
        }
    });
}

let roletaInterval;
function iniciarAnimacaoRoleta(letraFinal) {
    gerenciarTelas('roulette-overlay');
    const el = document.getElementById('roulette-letter'); const dia = document.querySelector('.diamond-shape'); dia.classList.remove('locked'); 
    const pool = configSala.letras.length > 0 ? configSala.letras : ALFABETO_COMPLETO;
    clearInterval(roletaInterval);
    roletaInterval = setInterval(() => { el.innerText = pool[Math.floor(Math.random() * pool.length)]; }, 80);
    setTimeout(() => { clearInterval(roletaInterval); el.innerText = letraFinal; dia.classList.add('locked'); }, 3000);
}
function pararAnimacaoRoleta() { clearInterval(roletaInterval); document.getElementById('roulette-overlay').classList.add('hidden'); document.querySelector('.diamond-shape').classList.remove('locked'); }

async function irParaOJogo() {
    const snapLetra = await get(ref(db, `salas/${salaId}/letraAtual`)); const snapRodada = await get(ref(db, `salas/${salaId}/rodadaAtual`)); 
    pararAnimacaoRoleta(); gerenciarTelas('game-screen');
    const letra = snapLetra.val(); const rodada = snapRodada.val() || 1; const total = configSala.rodadas || 5;
    const area = document.getElementById('game-inputs-area'); area.innerHTML = ''; 
    configSala.categorias.forEach((cat) => {
        const uniqueID = `cat-${cat.replace(/\s/g,'')}-r${rodada}`;
        area.innerHTML += `
        <div class="input-card">
            <label>${cat}</label>
            <input type="text" id="${uniqueID}" data-cat="${cat}" autocomplete="off" oninput="this.value = this.value.toUpperCase()">
        </div>`;
    });
    const headerHtml = `<div class="round-indicator">RODADAS: ${rodada}/${total}</div><div class="letter-box-diamond"><span id="current-letter">${letra}</span></div><div class="timer-box" id="timer">00:00</div>`;
    const headerEl = document.querySelector('#game-screen .game-header'); if (headerEl) headerEl.innerHTML = headerHtml;
    document.querySelector('.stop-btn-container').classList.remove('hidden'); 
    iniciarTimer(configSala.tempo || 60); 
}

window.apertarStop = function() { window.mostrarConfirmacao("Pedir STOP?", () => { update(ref(db, `salas/${salaId}`), { status: 'STOP', jogadorQueParou: usuarioAtual }); }); }
async function enviarMinhasRespostas() {
    const inputs = document.querySelectorAll('#game-inputs-area input'); const res = {};
    inputs.forEach(i => res[i.getAttribute('data-cat')] = i.value.trim().toUpperCase());
    return update(ref(db, `salas/${salaId}/jogadores/${jogadorId}`), { respostas: res });
}
function reagirAoStop() {
    pararTimer();
    document.querySelectorAll('#game-screen input').forEach(i => { i.disabled = true; i.style.backgroundColor = "#e0e0e0"; });
    document.querySelector('.stop-btn-container').classList.add('hidden');
    enviarMinhasRespostas().then(() => {
        const header = document.querySelector('#game-screen .game-header'); if(header) header.innerHTML = `<h3 style="color:white; text-align:center">Aguardando IA...</h3>`;
        if (isHost) processarValidacaoIA();
    });
}
async function processarValidacaoIA() {
    setTimeout(async () => {
        const header = document.querySelector('#game-screen .game-header'); if(header) header.innerHTML = `<h3 style="color:white; text-align:center">🤖 IA Corrigindo...</h3>`;
        const snap = await get(ref(db, `salas/${salaId}`)); const dados = snap.val(); if (!dados || !dados.jogadores) return;
        const resps = {}; Object.keys(dados.jogadores).forEach(k => { if(dados.jogadores[k].respostas) resps[k] = dados.jogadores[k].respostas; });
        const resultado = await validarRespostasComGemini(dados.letraAtual, resps);
        if (resultado) {
            const updates = {};
            Object.keys(resultado).forEach(pid => {
                if (dados.jogadores && dados.jogadores[pid]) {
                    updates[`salas/${salaId}/jogadores/${pid}/ultimaValidacao`] = resultado[pid].detalhes;
                    let ptsRodada = 0; Object.values(resultado[pid].detalhes).forEach(v => { if(v) ptsRodada += 10; });
                    const pontosAtuais = dados.jogadores[pid].pontos || 0;
                    updates[`salas/${salaId}/jogadores/${pid}/pontos`] = pontosAtuais + ptsRodada;
                    updates[`salas/${salaId}/jogadores/${pid}/contestacoes`] = null; 
                }
            });
            updates[`salas/${salaId}/votosPular`] = 0; updates[`salas/${salaId}/categoriaAtualIndex`] = 0; updates[`salas/${salaId}/status`] = 'RESULTADO';
            await update(ref(db), updates);
        }
    }, 4000);
}

// --- SISTEMA DE VOTAÇÃO ---
window.toggleValidacao = async function(targetPid, cat) {
    if(targetPid === jogadorId) {
        return window.mostrarAlerta("Você não pode votar na sua própria palavra!");
    }

    const snapSala = await get(ref(db, `salas/${salaId}/jogadores`));
    const jogadores = snapSala.val();
    const totalJogadores = Object.keys(jogadores).length;

    // MODO 2 JOGADORES (1x1): ALTERAÇÃO IMEDIATA
    if (totalJogadores <= 2) {
        const playerAlvo = jogadores[targetPid];
        const statusAtual = playerAlvo.ultimaValidacao ? playerAlvo.ultimaValidacao[cat] : false;
        const novoStatus = !statusAtual; 
        
        let pontos = playerAlvo.pontos || 0;
        if(novoStatus) pontos += 10; else pontos -= 10;
        if(pontos < 0) pontos = 0;

        const updates = {};
        updates[`salas/${salaId}/jogadores/${targetPid}/ultimaValidacao/${cat}`] = novoStatus;
        updates[`salas/${salaId}/jogadores/${targetPid}/pontos`] = pontos;
        await update(ref(db), updates);
        return; 
    }

    // MODO 3+ JOGADORES: VOTAÇÃO
    const votoRef = ref(db, `salas/${salaId}/jogadores/${targetPid}/contestacoes/${cat}/${jogadorId}`);
    const snapVoto = await get(votoRef);
    if (snapVoto.exists()) {
        await set(votoRef, null); 
    } else {
        await set(votoRef, true); 
    }
}

function monitorarConsenso(jogadores) {
    if(!isHost || !jogadores) return;
    const totalJogadores = Object.keys(jogadores).length;
    if (totalJogadores <= 2) return;

    const votosNecessarios = Math.max(1, totalJogadores - 1); 

    Object.keys(jogadores).forEach(pid => {
        const player = jogadores[pid];
        if(!player.contestacoes) return;

        Object.keys(player.contestacoes).forEach(cat => {
            if (!player.contestacoes[cat]) return;
            const votos = Object.keys(player.contestacoes[cat]).length;
            
            if (votos >= votosNecessarios) {
                const statusAtual = player.ultimaValidacao ? player.ultimaValidacao[cat] : false;
                const novoStatus = !statusAtual;
                let pontos = player.pontos || 0;
                if(novoStatus) pontos += 10; else pontos -= 10;
                if(pontos < 0) pontos = 0;

                const updates = {};
                updates[`salas/${salaId}/jogadores/${pid}/ultimaValidacao/${cat}`] = novoStatus;
                updates[`salas/${salaId}/jogadores/${pid}/pontos`] = pontos;
                updates[`salas/${salaId}/jogadores/${pid}/contestacoes/${cat}`] = null; 
                update(ref(db), updates);
            }
        });
    });
}

// --- AVALIAÇÃO OTIMIZADA + BARRA FIXA ---
let listenerAvaliacaoPlayers = null;

// Nova Função para reiniciar a barra APENAS quando mudar a categoria
function iniciarBarraVisual() {
    const barra = document.getElementById('eval-progress-bar');
    if(barra) {
        barra.style.transition = 'none';
        barra.style.width = '100%';
        void barra.offsetWidth; // Força reflow
        barra.style.transition = 'width 15s linear';
        barra.style.width = '0%';
    }
}

async function iniciarFaseAvaliacao() {
    gerenciarTelas('evaluation-screen');
    const snapRodada = await get(ref(db, `salas/${salaId}/rodadaAtual`)); const snapLetra = await get(ref(db, `salas/${salaId}/letraAtual`));
    document.getElementById('eval-round-curr').innerText = snapRodada.val() || 1; document.getElementById('eval-round-total').innerText = configSala.rodadas || 5; document.getElementById('eval-letter').innerText = snapLetra.val();

    onValue(ref(db, `salas/${salaId}/categoriaAtualIndex`), async (snapCat) => {
        const index = snapCat.val();
        if (index === null || index === undefined || index === -1) return;
        const categorias = configSala.categorias;
        if (index >= categorias.length) { 
            if(listenerAvaliacaoPlayers) { listenerAvaliacaoPlayers(); listenerAvaliacaoPlayers = null; }
            mostrarRankingRodada(); return; 
        }

        const categoriaAtual = categorias[index];
        document.getElementById('eval-category-title').innerText = categoriaAtual;
        const grid = document.getElementById('eval-answers-grid'); grid.innerHTML = ''; 
        
        // REINICIA BARRA AQUI (E só aqui)
        iniciarBarraVisual();

        if(listenerAvaliacaoPlayers) listenerAvaliacaoPlayers();
        listenerAvaliacaoPlayers = onValue(ref(db, `salas/${salaId}/jogadores`), (snapJogs) => {
            const jogadores = snapJogs.val();
            if(isHost) monitorarConsenso(jogadores);
            
            const totalJogadores = Object.keys(jogadores).length;
            const votosParaMudar = Math.max(1, totalJogadores - 1);

            Object.keys(jogadores).forEach(pid => {
                const player = jogadores[pid];
                const textoResposta = (player.respostas && player.respostas[categoriaAtual]) ? player.respostas[categoriaAtual] : "-";
                const oficialValido = (player.ultimaValidacao && player.ultimaValidacao[categoriaAtual] === true);
                
                let qtdVotos = 0;
                if(player.contestacoes && player.contestacoes[categoriaAtual]) {
                    qtdVotos = Object.keys(player.contestacoes[categoriaAtual]).length;
                }

                const euVoteiContra = (player.contestacoes && player.contestacoes[categoriaAtual] && player.contestacoes[categoriaAtual][jogadorId]);
                
                let visualmenteValido = oficialValido;
                if (totalJogadores > 2 && pid !== jogadorId && euVoteiContra) { visualmenteValido = !oficialValido; }

                let classe = (!textoResposta || textoResposta==="-") ? "" : (visualmenteValido ? "valid" : "invalid");
                if(euVoteiContra && totalJogadores > 2) classe += " voted-change";

                let statusTxt = (!textoResposta || textoResposta==="-") ? "SEM RESPOSTA" : (visualmenteValido ? "VALIDADO" : "INVÁLIDO");
                const clickAction = (pid !== jogadorId && textoResposta && textoResposta!=="-") ? `window.toggleValidacao('${pid}', '${categoriaAtual}')` : "";

                const elementId = `bubble-${pid}`;
                let bubble = document.getElementById(elementId);
                if (!bubble) {
                    bubble = document.createElement('div');
                    bubble.id = elementId;
                    grid.appendChild(bubble);
                }
                bubble.className = `answer-bubble ${classe}`;
                if(clickAction) bubble.setAttribute('onclick', clickAction); else bubble.removeAttribute('onclick');

                let htmlVotos = "";
                if (totalJogadores > 2 && pid !== jogadorId && qtdVotos > 0) {
                    htmlVotos = `<div style="font-size:0.65rem;color:#333;font-weight:bold;margin-top:3px">⚠️ ${qtdVotos}/${votosParaMudar} Votos para mudar</div>`;
                }

                bubble.innerHTML = `
                    <div class="answer-text">${textoResposta}</div>
                    <div class="answer-status">${statusTxt}</div>
                    <div style="font-size:0.7rem;margin-top:5px;color:#aaa">${player.nome}</div>
                    ${htmlVotos}
                `;
            });
            resetarSkipUI(Object.keys(jogadores).length);
        });
        if(isHost) iniciarTimerAvaliacao(index);
    });
}

function resetarSkipUI(totalJogadores) {
    const btn = document.getElementById('btn-skip-eval'); 
    if(btn) { btn.classList.remove('voted'); btn.disabled = false; }
    // A LÓGICA DA BARRA FOI MOVIDA PARA iniciarBarraVisual()
}

function iniciarTimerAvaliacao(indexAtual) { clearTimeout(evalTimeout); evalTimeout = setTimeout(() => { update(ref(db, `salas/${salaId}`), { categoriaAtualIndex: indexAtual + 1, votosPular: 0 }); }, 15000); }
window.votarPularAvaliacao = async function() {
    const btn = document.getElementById('btn-skip-eval'); if(btn.classList.contains('voted')) return;
    btn.classList.add('voted'); btn.disabled = true;
    const transactionResult = await get(ref(db, `salas/${salaId}`));
    let votos = (transactionResult.val().votosPular || 0) + 1; await update(ref(db, `salas/${salaId}`), { votosPular: votos });
}
function monitorarVotos() {
     onValue(ref(db, `salas/${salaId}/votosPular`), async (snap) => {
         const votos = snap.val() || 0; const snapJogs = await get(ref(db, `salas/${salaId}/jogadores`)); const total = snapJogs.val() ? Object.keys(snapJogs.val()).length : 1;
         document.getElementById('skip-count').innerText = votos; document.getElementById('skip-total').innerText = total;
         if(isHost && votos >= total && votos > 0) { clearTimeout(evalTimeout); const snapCat = await get(ref(db, `salas/${salaId}/categoriaAtualIndex`)); update(ref(db, `salas/${salaId}`), { categoriaAtualIndex: snapCat.val() + 1, votosPular: 0 }); }
     });
}

// RANKING
async function mostrarRankingRodada() {
    gerenciarTelas('round-ranking-screen');
    const btn = document.getElementById('btn-ready'); btn.classList.remove('ready'); btn.innerHTML = `<span class="icon">👍</span> ESTOU PRONTO`; document.getElementById('waiting-others').classList.add('hidden');
    update(ref(db, `salas/${salaId}/jogadores/${jogadorId}`), { estouPronto: false });

    get(ref(db, `salas/${salaId}/rodadaAtual`)).then(snap => {
        document.getElementById('rank-round-curr').innerText = snap.val() || 1;
        document.getElementById('rank-round-total').innerText = configSala.rodadas || 5;
    });

    const snapJ = await get(ref(db, `salas/${salaId}/jogadores`));
    const jogadores = snapJ.val();
    const ul = document.getElementById('round-ranking-list'); ul.innerHTML = ''; 
    const ranking = Object.values(jogadores).sort((a, b) => b.pontos - a.pontos);
    ranking.forEach((jogador, index) => {
        let classePos = index < 3 ? `rank-${index+1}` : `rank-x`;
        ul.innerHTML += `<li class="rank-item ${classePos}"><div class="rank-pos">${index+1}</div><div class="rank-info"><img src="${jogador.avatar}" class="rank-avatar"><span class="rank-name">${jogador.nome}</span></div><div class="rank-score"><span class="star-icon">⭐</span> ${jogador.pontos}</div></li>`;
    });

    const barra = document.getElementById('rank-progress-bar'); barra.style.transition = 'none'; barra.style.width = '100%'; void barra.offsetWidth; barra.style.transition = 'width 15s linear'; barra.style.width = '0%';

    if (isHost) {
        clearTimeout(rankingTimeout); isProcessingRound = false; rankingTimeout = setTimeout(() => { verificarProximaRodada(true); }, 15000);
        setTimeout(() => {
            const prontosRef = ref(db, `salas/${salaId}/jogadores`);
            onValue(prontosRef, (snap) => {
                const el = document.getElementById('round-ranking-screen'); if(el.classList.contains('hidden')) return;
                const jogs = snap.val(); if(!jogs) return;
                const todosProntos = Object.values(jogs).every(j => j.estouPronto === true);
                if (Object.keys(jogs).length > 0 && todosProntos) { clearTimeout(rankingTimeout); verificarProximaRodada(false); }
            });
        }, 3000);
    }
}
window.clicarEstouPronto = function() { update(ref(db, `salas/${salaId}/jogadores/${jogadorId}`), { estouPronto: true }); const btn = document.getElementById('btn-ready'); btn.classList.add('ready'); btn.innerHTML = `AGUARDE...`; document.getElementById('waiting-others').classList.remove('hidden'); }

async function verificarProximaRodada(forcar) {
    if(isProcessingRound) return; isProcessingRound = true;
    const snap = await get(ref(db, `salas/${salaId}`)); const dados = snap.val();
    if (dados.status === 'SORTEANDO' || dados.status === 'FIM_JOGO' || dados.status === 'PODIUM') return;
    
    const rodadaAtual = dados.rodadaAtual || 1; const totalRodadas = dados.config.rodadas || 5;

    if (rodadaAtual < totalRodadas) {
        const updates = {}; const pool = dados.config.letras; const novaLetra = pool[Math.floor(Math.random() * pool.length)];
        updates[`salas/${salaId}/rodadaAtual`] = rodadaAtual + 1; updates[`salas/${salaId}/letraAtual`] = novaLetra;
        updates[`salas/${salaId}/status`] = 'SORTEANDO'; updates[`salas/${salaId}/votosPular`] = 0; updates[`salas/${salaId}/categoriaAtualIndex`] = -1;
        Object.keys(dados.jogadores).forEach(pid => { updates[`salas/${salaId}/jogadores/${pid}/respostas`] = null; updates[`salas/${salaId}/jogadores/${pid}/ultimaValidacao`] = null; updates[`salas/${salaId}/jogadores/${pid}/estouPronto`] = false; updates[`salas/${salaId}/jogadores/${pid}/contestacoes`] = null; });
        await update(ref(db), updates); isProcessingRound = false; setTimeout(() => { update(ref(db, `salas/${salaId}`), { status: 'JOGANDO' }); }, 4500);
    } else {
        update(ref(db, `salas/${salaId}`), { status: 'PODIUM' });
    }
}

// PÓDIO
async function mostrarPodio() {
    gerenciarTelas('podium-screen');
    const snap = await get(ref(db, `salas/${salaId}/jogadores`));
    const jogadores = Object.values(snap.val()).sort((a, b) => b.pontos - a.pontos);
    
    if(jogadores[0]) {
        document.getElementById('name-1').innerText = jogadores[0].nome;
        document.getElementById('score-1').innerText = jogadores[0].pontos;
        document.getElementById('avatar-1').src = jogadores[0].avatar;
    }
    if(jogadores[1]) {
        document.getElementById('name-2').innerText = jogadores[1].nome;
        document.getElementById('score-2').innerText = jogadores[1].pontos;
        document.getElementById('avatar-2').src = jogadores[1].avatar;
    } else { document.querySelector('.step-2').style.visibility = 'hidden'; }
    if(jogadores[2]) {
        document.getElementById('name-3').innerText = jogadores[2].nome;
        document.getElementById('score-3').innerText = jogadores[2].pontos;
        document.getElementById('avatar-3').src = jogadores[2].avatar;
    } else { document.querySelector('.step-3').style.visibility = 'hidden'; }
}

// LISTENER
function entrarNoLobby(codigo) {
    gerenciarTelas('lobby-screen'); document.getElementById('lobby-code-display').innerText = codigo; monitorarVotos();
    onValue(ref(db, `salas/${codigo}/status`), async (snapshot) => {
        const status = snapshot.val();
        if (status === 'SORTEANDO') { const snapLetra = await get(ref(db, `salas/${salaId}/letraAtual`)); iniciarAnimacaoRoleta(snapLetra.val()); } 
        else if (status === 'JOGANDO') { irParaOJogo(); } 
        else if (status === 'STOP') { reagirAoStop(); } 
        else if (status === 'RESULTADO') { iniciarFaseAvaliacao(); }
        else if (status === 'PODIUM') { mostrarPodio(); }
    });
    onValue(ref(db, `salas/${codigo}/jogadores`), (snap) => { if(!document.getElementById('lobby-screen').classList.contains('hidden')) atualizarListaJogadores(snap.val()); });
    onValue(ref(db, `salas/${codigo}/config`), (snap) => { if(snap.exists()) { configSala = snap.val(); if(!configSala.categorias)configSala.categorias=[]; if(!configSala.letras)configSala.letras=[]; renderizarPainelConfig(); } });
    if (isHost) document.getElementById('btn-start-game').classList.remove('hidden');
}

function atualizarListaJogadores(lista){const ul=document.getElementById('players-list');ul.innerHTML='';if(!lista)return;Object.values(lista).sort((a,b)=>b.pontos-a.pontos).forEach(p=>{ul.innerHTML+=`<li style="display:flex;gap:10px;align-items:center;padding:8px 0"><img src="${p.avatar}" style="width:35px;height:35px;border-radius:50%"><div><strong>${p.nome}${p.isHost?' 👑':''}</strong><br><small>${p.pontos} pts</small></div></li>`;});}
let timerInterval;function iniciarTimer(s){let t=s;clearInterval(timerInterval);const el=document.getElementById('timer');if(el)el.innerText=formatarTempo(t);timerInterval=setInterval(()=>{t--;if(el)el.innerText=formatarTempo(t);if(t<=0){clearInterval(timerInterval);if(isHost){update(ref(db, `salas/${salaId}`), { status: 'STOP', jogadorQueParou: 'TEMPO ESGOTADO' });}}},1000);}
function formatarTempo(s){const m=Math.floor(s/60).toString().padStart(2,'0');const seg=(s%60).toString().padStart(2,'0');return `${m}:${seg}`;}
function pararTimer(){clearInterval(timerInterval);}

window.trocarAvatar();