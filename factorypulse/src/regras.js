// ============================================================
// Regras de negócio do FactoryPulse.
// Todas as funções recebem o banco (objeto em memória) e não
// tocam em disco nem em HTTP — por isso podem ser testadas
// isoladamente (ver pasta test/).
// Erros de validação são lançados como ErroNegocio, com o código
// HTTP que a API deve devolver.
// ============================================================

const { agoraISO, diaLocal, horaLocal, dataHoraLocal } = require("./datas");

const STATUS_VALIDOS = ["produzindo", "setup", "parada", "manutencao", "sem_operador"];

class ErroNegocio extends Error {
  constructor(mensagem, status = 400) { super(mensagem); this.status = status; }
}

// ---------- utilitários ----------

/** Limpa textos digitados: remove espaços extras e os caracteres < > (evita injeção de HTML). */
function texto(v, max = 80) {
  if (v === undefined || v === null) return "";
  return String(v).replace(/[<>]/g, "").trim().slice(0, max);
}

/** Converte para inteiro >= 0 ou lança erro. */
function inteiroNaoNegativo(v, campo) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) throw new ErroNegocio(`${campo} deve ser um número inteiro maior ou igual a zero.`);
  return n;
}

/**
 * Atingimento da meta (%) = produzido ÷ meta, limitado a 100%.
 * Observação: NÃO é OEE. OEE exige disponibilidade, performance e
 * qualidade (refugo), dados que esta versão não coleta.
 */
function atingimento(produzido, meta) {
  return meta > 0 ? Math.min(100, Math.round((produzido / meta) * 100)) : 0;
}

function segParaMin(seg) { return Math.round(seg / 60); }

// ---------- consultas auxiliares ----------

function buscarMaquina(db, id) {
  const m = db.maquinas.find((x) => x.id === Number(id) && x.ativa);
  if (!m) throw new ErroNegocio("Máquina não encontrada.", 404);
  return m;
}

function maquinasAtivas(db) { return db.maquinas.filter((m) => m.ativa); }

function paradasFinalizadasNoDia(db, dia, maqId) {
  return db.paradas.filter((p) => p.fim && diaLocal(p.inicio) === dia && (maqId === undefined || p.maquina_id === maqId));
}

function tempoParadoMin(db, maqId, dia) {
  return segParaMin(paradasFinalizadasNoDia(db, dia, maqId).reduce((a, p) => a + (p.duracao_seg || 0), 0));
}

function ultimaParada(db, maqId) {
  const lista = db.paradas.filter((p) => p.maquina_id === maqId);
  return lista.length ? lista[lista.length - 1].motivo : "—";
}

/** Agrupa paradas por motivo e ordena do maior para o menor tempo (Pareto). */
function pareto(paradas) {
  const mapa = {};
  for (const p of paradas) mapa[p.motivo] = (mapa[p.motivo] || 0) + (p.duracao_seg || 0);
  const linhas = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  const soma = linhas.reduce((a, r) => a + r[1], 0) || 1;
  let acumulado = 0;
  return linhas.map(([motivo, total]) => {
    const pct = Math.round((total / soma) * 100);
    acumulado += total;
    return { motivo, pct, pctAcumulado: Math.round((acumulado / soma) * 100), minutos: segParaMin(total) };
  });
}

// ---------- máquinas ----------

function listarMaquinas(db, hoje = diaLocal()) {
  return maquinasAtivas(db).map((m) => ({
    ...m,
    stoppedMin: tempoParadoMin(db, m.id, hoje),
    atingimento: atingimento(m.produzido, m.meta),
    lastStop: ultimaParada(db, m.id),
    paradaAberta: db.paradas.some((p) => p.maquina_id === m.id && !p.fim),
  }));
}

function criarMaquina(db, dados) {
  const nome = texto(dados.nome);
  if (!nome) throw new ErroNegocio("Nome é obrigatório.");
  if (maquinasAtivas(db).some((m) => m.nome.toLowerCase() === nome.toLowerCase())) throw new ErroNegocio("Já existe uma máquina ativa com esse nome.");
  const nova = {
    id: ++db.seq, nome, produto: texto(dados.produto), operador: texto(dados.operador), of: texto(dados.of, 30),
    meta: dados.meta === undefined || dados.meta === "" ? 0 : inteiroNaoNegativo(dados.meta, "Meta"),
    produzido: 0, of_inicio: agoraISO(), status: "sem_operador", ativa: true,
  };
  db.maquinas.push(nova);
  return nova;
}

/** Edita dados cadastrais. O total produzido NÃO pode ser editado aqui: ele só muda por apontamento. */
function editarMaquina(db, id, dados) {
  const m = buscarMaquina(db, id);
  if (dados.produzido !== undefined) throw new ErroNegocio("O total produzido não pode ser editado diretamente. Use o apontamento de produção.");
  if (dados.nome !== undefined) { const n = texto(dados.nome); if (!n) throw new ErroNegocio("Nome é obrigatório."); m.nome = n; }
  if (dados.produto !== undefined) m.produto = texto(dados.produto);
  if (dados.operador !== undefined) m.operador = texto(dados.operador);
  if (dados.of !== undefined) m.of = texto(dados.of, 30);
  if (dados.meta !== undefined) m.meta = inteiroNaoNegativo(dados.meta, "Meta");
  return m;
}

/**
 * Desativa a máquina (exclusão lógica). O histórico — paradas, eventos,
 * apontamentos e OFs encerradas — é preservado para rastreabilidade
 * e continua aparecendo nos relatórios dos dias em que ela operou.
 */
function desativarMaquina(db, id) {
  const m = buscarMaquina(db, id);
  if (db.paradas.some((p) => p.maquina_id === m.id && !p.fim)) throw new ErroNegocio("Finalize a parada em aberto antes de desativar a máquina.");
  m.ativa = false;
  m.desativada_em = agoraISO();
  return m;
}

// ---------- produção ----------

function apontarProducao(db, id, dados) {
  const m = buscarMaquina(db, id);
  const qtd = Number(dados.qtd);
  if (!Number.isInteger(qtd) || qtd <= 0) throw new ErroNegocio("Informe a quantidade produzida no turno (número inteiro maior que zero).");
  m.produzido += qtd;
  db.apontamentos.push({ maquina_id: m.id, of: m.of, produto: m.produto, operador: texto(dados.operador) || m.operador || "", qtd, ts: agoraISO() });
  return m.produzido;
}

function encerrarOF(db, id, dados) {
  const m = buscarMaquina(db, id);
  const novaMeta = dados.novaMeta === undefined || dados.novaMeta === "" ? m.meta : inteiroNaoNegativo(dados.novaMeta, "Nova meta");
  db.historicoOF.push({
    maquina_id: m.id, maquina_nome: m.nome, of: m.of || "(sem OF)", produto: m.produto,
    meta: m.meta, produzido: m.produzido, inicio: m.of_inicio, fim: agoraISO(),
  });
  m.of = texto(dados.novaOf, 30);
  if (dados.novoProduto !== undefined && texto(dados.novoProduto)) m.produto = texto(dados.novoProduto);
  m.meta = novaMeta;
  m.produzido = 0;
  m.of_inicio = agoraISO();
  return m;
}

function historicoOF(db) {
  return [...db.historicoOF].reverse().map((h) => ({ ...h, atingimento: atingimento(h.produzido, h.meta), fimFmt: dataHoraLocal(h.fim) }));
}

// ---------- status e paradas ----------

function mudarStatus(db, id, status) {
  const m = buscarMaquina(db, id);
  if (!STATUS_VALIDOS.includes(status)) throw new ErroNegocio("Status inválido.");
  if (db.paradas.some((p) => p.maquina_id === m.id && !p.fim) && status !== "parada") {
    throw new ErroNegocio("Há uma parada em aberto. Use \"Finalizar parada\" para registrar o fim dela.");
  }
  m.status = status;
  db.eventos.push({ maquina_id: m.id, status, ts: agoraISO() });
  return m;
}

function registrarParada(db, id, dados) {
  const m = buscarMaquina(db, id);
  const motivo = texto(dados.motivo);
  if (!motivo) throw new ErroNegocio("Motivo é obrigatório.");
  if (db.paradas.some((p) => p.maquina_id === m.id && !p.fim)) throw new ErroNegocio("Já existe uma parada em aberto. Finalize-a antes.");
  const inicio = agoraISO();
  const parada = { id: ++db.seqParada, maquina_id: m.id, operador: texto(dados.operador), motivo, inicio, fim: null, duracao_seg: null };
  db.paradas.push(parada);
  m.status = "parada";
  db.eventos.push({ maquina_id: m.id, status: "parada", ts: inicio });
  return parada;
}

function finalizarParada(db, id) {
  const m = buscarMaquina(db, id);
  const aberta = [...db.paradas].reverse().find((p) => p.maquina_id === m.id && !p.fim);
  if (!aberta) throw new ErroNegocio("Nenhuma parada em aberto.");
  const fim = agoraISO();
  aberta.fim = fim;
  aberta.duracao_seg = Math.max(0, Math.round((new Date(fim) - new Date(aberta.inicio)) / 1000));
  m.status = "produzindo";
  db.eventos.push({ maquina_id: m.id, status: "produzindo", ts: fim });
  return aberta;
}

function timeline(db, id, dia = diaLocal()) {
  const m = buscarMaquina(db, id);
  return db.eventos.filter((e) => e.maquina_id === m.id && diaLocal(e.ts) === dia).map((e) => ({ status: e.status, ts: e.ts }));
}

// ---------- indicadores e relatórios ----------

function resumo(db, hoje = diaLocal()) {
  const ativas = maquinasAtivas(db);
  const por = (s) => ativas.filter((m) => m.status === s).length;
  const ids = new Set(ativas.map((m) => m.id));
  const perdidoSeg = paradasFinalizadasNoDia(db, hoje).filter((p) => ids.has(p.maquina_id)).reduce((a, p) => a + (p.duracao_seg || 0), 0);
  return {
    produzindo: por("produzindo"), parada: por("parada"), setup: por("setup"), manutencao: por("manutencao"),
    tempoPerdidoMin: segParaMin(perdidoSeg),
    producao: ativas.reduce((a, m) => a + m.produzido, 0),
    meta: ativas.reduce((a, m) => a + m.meta, 0),
    atingimentoMedio: ativas.length ? Math.round(ativas.reduce((a, m) => a + atingimento(m.produzido, m.meta), 0) / ativas.length) : 0,
    producaoHoje: db.apontamentos.filter((a) => diaLocal(a.ts) === hoje && ids.has(a.maquina_id)).reduce((s, a) => s + a.qtd, 0),
  };
}

/**
 * Relatório de um dia específico, calculado a partir dos REGISTROS DO DIA
 * (apontamentos e paradas com data local igual ao dia pedido).
 * Inclui máquinas desativadas que tiveram movimento naquele dia.
 */
function relatorioDia(db, dia) {
  const apDia = db.apontamentos.filter((a) => diaLocal(a.ts) === dia);
  const parDia = paradasFinalizadasNoDia(db, dia);
  const comMovimento = new Set([...apDia.map((a) => a.maquina_id), ...parDia.map((p) => p.maquina_id)]);
  const maquinas = db.maquinas.filter((m) => m.ativa || comMovimento.has(m.id));

  const producao = maquinas.map((m) => {
    const aps = apDia.filter((a) => a.maquina_id === m.id);
    const ps = parDia.filter((p) => p.maquina_id === m.id);
    const ofs = [...new Set(aps.map((a) => a.of).filter(Boolean))];
    const ops = [...new Set(aps.map((a) => a.operador).filter(Boolean))];
    return {
      maquina: m.nome + (m.ativa ? "" : " (desativada)"),
      ofs: ofs.join(", ") || "—",
      operadores: ops.join(", ") || "—",
      apontamentos: aps.length,
      produzidoDia: aps.reduce((s, a) => s + a.qtd, 0),
      paradas: ps.length,
      tempoParadoMin: segParaMin(ps.reduce((s, p) => s + (p.duracao_seg || 0), 0)),
    };
  });

  const nomeDe = (id) => { const m = db.maquinas.find((x) => x.id === id); return m ? m.nome : "?"; };
  const paradas = parDia.map((p) => ({
    maquina: nomeDe(p.maquina_id), motivo: p.motivo, operador: p.operador || "—",
    inicio: horaLocal(p.inicio), fim: horaLocal(p.fim), duracaoMin: segParaMin(p.duracao_seg || 0),
  }));

  return {
    dia, producao, paradas, pareto: pareto(parDia),
    totais: {
      producao: producao.reduce((s, x) => s + x.produzidoDia, 0),
      apontamentos: apDia.length,
      paradas: parDia.length,
      tempoParadoMin: producao.reduce((s, x) => s + x.tempoParadoMin, 0),
    },
  };
}

module.exports = {
  STATUS_VALIDOS, ErroNegocio, texto, atingimento, pareto,
  listarMaquinas, criarMaquina, editarMaquina, desativarMaquina,
  apontarProducao, encerrarOF, historicoOF,
  mudarStatus, registrarParada, finalizarParada, timeline,
  resumo, relatorioDia,
};
