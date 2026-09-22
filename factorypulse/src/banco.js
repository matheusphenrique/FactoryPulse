// ============================================================
// Persistência em arquivo JSON.
// - O caminho do arquivo pode ser trocado pela variável FP_DB
//   (usado pelos testes para não mexer nos dados reais).
// - A gravação é atômica: grava num arquivo temporário e depois
//   renomeia, para não corromper o banco se o PC desligar no meio.
// - Bancos gerados por versões anteriores são normalizados na carga.
// ============================================================

const fs = require("fs");

function bancoInicial() {
  const inicio = new Date().toISOString();
  const maq = (id, nome, produto, operador, of, meta, produzido, status) =>
    ({ id, nome, produto, operador, of, meta, produzido, of_inicio: inicio, status, ativa: true });
  return {
    versao: 3,
    seq: 4,
    seqParada: 0,
    maquinas: [
      maq(1, "Máquina 01", "Parafuso M8 x 40", "Carlos", "OF-1001", 12000, 0, "produzindo"),
      maq(2, "Máquina 02", "Porca M10", "Rafaela", "OF-1002", 20000, 0, "setup"),
      maq(3, "Máquina 03", "Arruela 3/8", "Jonas", "OF-1003", 30000, 0, "produzindo"),
      maq(4, "Máquina 04", "Pino guia", "", "OF-1004", 8000, 0, "manutencao"),
    ],
    historicoOF: [],  // OFs encerradas
    apontamentos: [], // lançamentos de produção por turno
    paradas: [],      // paradas de máquina (início/fim/motivo)
    eventos: [],      // mudanças de status (timeline)
  };
}

/** Garante que um banco de versão antiga tenha todos os campos atuais. */
function normalizar(db) {
  db.seq = db.seq || 0;
  db.seqParada = db.seqParada || 0;
  for (const k of ["maquinas", "historicoOF", "apontamentos", "paradas", "eventos"]) {
    if (!Array.isArray(db[k])) db[k] = [];
  }
  for (const m of db.maquinas) {
    if (m.ativa === undefined) m.ativa = true;
    m.meta = Number(m.meta) || 0;
    m.produzido = Number(m.produzido) || 0;
  }
  db.versao = 3;
  return db;
}

function carregar(arquivo) {
  try {
    return normalizar(JSON.parse(fs.readFileSync(arquivo, "utf8")));
  } catch (e) {
    if (e.code !== "ENOENT") {
      // Arquivo existe mas está corrompido: guarda uma cópia antes de recomeçar.
      const copia = arquivo + ".corrompido-" + Date.now();
      try { fs.copyFileSync(arquivo, copia); } catch {}
      console.error(`Aviso: ${arquivo} ilegível. Cópia salva em ${copia}. Recomeçando com dados de exemplo.`);
    }
    const db = bancoInicial();
    salvar(arquivo, db);
    return db;
  }
}

function salvar(arquivo, db) {
  const tmp = arquivo + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, arquivo);
}

module.exports = { carregar, salvar, normalizar, bancoInicial };
