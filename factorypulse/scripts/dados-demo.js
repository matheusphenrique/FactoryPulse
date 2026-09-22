// ============================================================
// Gera um dados.json com 7 dias de movimento FICTÍCIO, para
// demonstração e apresentação do projeto (relatórios, Pareto,
// histórico de OFs já preenchidos).
//
// Uso:  npm run demo            (não sobrescreve dados existentes)
//       npm run demo -- --forcar (substitui o dados.json atual)
// ============================================================

const fs = require("fs");
const path = require("path");
const { bancoInicial, salvar } = require("../src/banco");

const arquivo = process.env.FP_DB || path.join(__dirname, "..", "dados.json");
if (fs.existsSync(arquivo) && !process.argv.includes("--forcar")) {
  console.log(`Já existe ${arquivo}. Para substituir pelos dados de demonstração, rode: npm run demo -- --forcar`);
  process.exit(0);
}

// Gerador pseudoaleatório com semente fixa: a demonstração sai sempre igual.
let semente = 42;
const aleatorio = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
const entre = (a, b) => Math.round(a + aleatorio() * (b - a));
const escolher = (lista) => lista[Math.floor(aleatorio() * lista.length)];

const MOTIVOS = [
  ["Setup", 5], ["Troca de ferramenta", 3], ["Falta de matéria-prima", 3], ["Quebra", 2],
  ["Ajuste", 2], ["Esperando inspeção", 1], ["Manutenção corretiva", 1],
];
const motivoPonderado = () => {
  const total = MOTIVOS.reduce((a, [, p]) => a + p, 0);
  let r = aleatorio() * total;
  for (const [m, p] of MOTIVOS) { if ((r -= p) <= 0) return m; }
  return MOTIVOS[0][0];
};

const db = bancoInicial();
const ritmo = { 1: [1500, 2300], 2: [2200, 3200], 3: [2800, 4200], 4: [700, 1200] };
// Horário local de Brasília (UTC-3) convertido para ISO UTC
const iso = (dia, hora, min = 0) => new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), hora + 3, min)).toISOString();

const hoje = new Date();
for (let d = 7; d >= 1; d--) {
  const dia = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - d));
  if (dia.getUTCDay() === 0) continue; // domingo sem produção
  for (const m of db.maquinas) {
    // Paradas do dia
    const horarios = [8, 11, 16, 19].filter(() => aleatorio() < 0.6); // horários distintos: sem paradas sobrepostas
    for (const h of horarios.length ? horarios : [10]) {
      const mi = entre(0, 50), dur = entre(8, 75);
      const inicio = iso(dia, h, mi);
      db.paradas.push({ id: ++db.seqParada, maquina_id: m.id, operador: m.operador, motivo: motivoPonderado(),
        inicio, fim: new Date(new Date(inicio).getTime() + dur * 60000).toISOString(), duracao_seg: dur * 60 });
    }
    // Apontamentos: fim do 1º turno (14h) e do 2º turno (22h)
    for (const hora of [14, 22]) {
      const qtd = entre(...ritmo[m.id]);
      m.produzido += qtd;
      db.apontamentos.push({ maquina_id: m.id, of: m.of, produto: m.produto, operador: m.operador || "Equipe", qtd, ts: iso(dia, hora, entre(0, 20)) });
    }
    // Encerra a OF quando a meta é atingida
    if (m.produzido >= m.meta) {
      db.historicoOF.push({ maquina_id: m.id, maquina_nome: m.nome, of: m.of, produto: m.produto, meta: m.meta,
        produzido: m.produzido, inicio: m.of_inicio, fim: iso(dia, 22, 30) });
      const n = Number(m.of.replace(/\D/g, "")) + 10;
      m.of = "OF-" + n; m.produzido = 0; m.of_inicio = iso(dia, 22, 31);
    }
  }
}
db.paradas.sort((a, b) => a.inicio.localeCompare(b.inicio));
db.paradas.forEach((p, i) => (p.id = i + 1));
db.apontamentos.sort((a, b) => a.ts.localeCompare(b.ts));
db.eventos = db.paradas.flatMap((p) => [
  { maquina_id: p.maquina_id, status: "parada", ts: p.inicio },
  { maquina_id: p.maquina_id, status: "produzindo", ts: p.fim },
]).sort((a, b) => a.ts.localeCompare(b.ts));

salvar(arquivo, db);
console.log(`Dados de demonstração gravados em ${arquivo}`);
console.log(`${db.apontamentos.length} apontamentos, ${db.paradas.length} paradas, ${db.historicoOF.length} OFs encerradas.`);
