// ===== CONFIG =====
// Troque para 'ERRO' para testar o outro caminho de cada ação
// ===== CONFIG =====
const TZ = 'America/Sao_Paulo';

// Horário de funcionamento: [abre, fecha) em horas. 0 = domingo ... 6 = sábado
const HORARIOS = {
  0: [8, 12],   // domingo
  1: [9, 16],   // segunda
  2: [9, 16],   // terça
  3: [9, 16],   // quarta
  4: [9, 16],   // quinta
  5: [9, 16],   // sexta
  6: [7, 14],   // sábado
};

function dentroDoHorario() {
  // Converte "agora" para o fuso de São Paulo, independente do fuso do servidor/Docker
  const sp = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const faixa = HORARIOS[sp.getDay()];
  if (!faixa) return false;
  const hora = sp.getHours() + sp.getMinutes() / 60;
  return hora >= faixa[0] && hora < faixa[1];
}

// Cada ação devolve 'SUCESSO' ou 'ERRO'
const ACOES = {
  'validar-ad': () => 'SUCESSO',
  'verifica-horario-de-funcionamento-do-sd': () => dentroDoHorario() ? 'SUCESSO' : 'ERRO',
  'desbloqueia-usuario-no-ad': () => 'SUCESSO',
};
const SESSAO_MIN = 1;

// ===== CSV =====
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const steps = {};
parseCSV($input.first().json.data).slice(1).forEach(r => {
  const id = Number(r[0]);
  if (!id || !r[1]) return;
  let opcoes = {};
  try { opcoes = r[3] ? JSON.parse(r[3]) : {}; } catch (e) {}
  steps[id] = { tipo: r[1].trim(), label: r[2] || '', opcoes };
});

// ===== Mensagem recebida =====
const d = $('Filtro Segurança').first().json.body.data;
if (d.key.fromMe) return [];
const number = (d.key.senderPn || d.key.remoteJid).split('@')[0];
// ===== Bloqueados =====
const BLOQUEADOS = ['91654143'];
if (BLOQUEADOS.some(b => number.endsWith(b))) return [];

const input = (d.message?.conversation || d.message?.extendedTextMessage?.text || '').trim();
if (!input) return [];

// ===== Estado =====
const store = $getWorkflowStaticData('global');
store.sessoes = store.sessoes || {};
let s = store.sessoes[number];
const agora = Date.now();
if (s && (agora - s.ts > SESSAO_MIN * 60000 || input.toLowerCase() === 'reiniciar')) s = null;

// ===== Motor =====
const out = [];
let vars = s ? (s.vars || {}) : {};
const fill = t => t.replace(/\[NomeCompletoAD\]/g, vars.nome || vars.login || '');

function avancar(atual) {
  for (let g = 0; g < 50; g++) {
    const row = steps[atual];
    if (!row) { out.push('Erro no fluxo: o passo ' + atual + ' não existe.'); return null; }
    if (row.tipo === 'acao-sistema') {
        const resultado = (ACOES[row.label] || (() => 'SUCESSO'))();
        const prox = row.opcoes[resultado];
      if (!prox) { out.push('Erro no fluxo: ação sem destino.'); return null; }
      atual = prox;
      continue;
    }
    out.push(fill(row.label));
    if (['entrada', 'menu', 'decisao'].includes(row.tipo)) return atual; // aguarda resposta
    const prox = row.opcoes['*'];
    if (!prox) return null; // fim da conversa
    atual = prox;
  }
  return null;
}

let step;
if (!s) {
  const primeiro = steps[1];
  out.push(fill(primeiro.label));
  step = avancar(primeiro.opcoes['*']);
} else {
  const row = steps[s.step];
  let prox;
  if (row.tipo === 'entrada') {
    vars.login = input; vars.nome = input; // simulação do validar-ad
    prox = row.opcoes['*'];
  } else {
    prox = row.opcoes[input];
  }
  if (!prox) { out.push('Opção inválida.'); step = avancar(s.step); }
  else step = avancar(prox);
}

if (step) store.sessoes[number] = { step, vars, ts: agora };
else delete store.sessoes[number];

return out.map(text => ({ json: { number, text } }));