// Testes unitários das regras de negócio (sem servidor, sem disco).
// Rodar: npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/regras");
const { bancoInicial } = require("../src/banco");
const { diaLocal } = require("../src/datas");

const novoBanco = () => bancoInicial();

test("atingimento: produzido ÷ meta, limitado a 100% e 0 sem meta", () => {
  assert.equal(R.atingimento(500, 1000), 50);
  assert.equal(R.atingimento(1500, 1000), 100);
  assert.equal(R.atingimento(10, 0), 0);
});

test("fuso horário: registro às 22h30 de Brasília pertence ao mesmo dia (não ao seguinte)", () => {
  // 01:30 UTC do dia 04 = 22:30 de 03/08 em Brasília (UTC-3)
  assert.equal(diaLocal("2026-08-04T01:30:00.000Z"), "2026-08-03");
  assert.equal(diaLocal("2026-08-04T03:00:00.000Z"), "2026-08-04");
});

test("pareto: ordena do maior tempo para o menor, com percentual acumulado", () => {
  const p = R.pareto([
    { motivo: "Quebra", duracao_seg: 600 },
    { motivo: "Setup", duracao_seg: 1800 },
    { motivo: "Quebra", duracao_seg: 600 },
  ]);
  assert.deepEqual(p.map((x) => x.motivo), ["Setup", "Quebra"]);
  assert.equal(p[0].pct, 60);
  assert.equal(p[1].pctAcumulado, 100);
  assert.equal(p[0].minutos, 30);
});

test("apontamento soma ao total da OF e rejeita quantidade inválida", () => {
  const db = novoBanco();
  assert.equal(R.apontarProducao(db, 1, { qtd: 100 }), 100);
  assert.equal(R.apontarProducao(db, 1, { qtd: 50 }), 150);
  assert.equal(db.apontamentos.length, 2);
  for (const qtd of [0, -5, 2.5, "abc", undefined]) {
    assert.throws(() => R.apontarProducao(db, 1, { qtd }), R.ErroNegocio);
  }
});

test("total produzido não pode ser editado diretamente", () => {
  const db = novoBanco();
  assert.throws(() => R.editarMaquina(db, 1, { produzido: 99999 }), /apontamento/);
});

test("encerrar OF guarda no histórico e zera a produção", () => {
  const db = novoBanco();
  R.apontarProducao(db, 1, { qtd: 6000 });
  R.encerrarOF(db, 1, { novaOf: "OF-2000", novaMeta: 5000 });
  const m = db.maquinas.find((x) => x.id === 1);
  assert.equal(m.produzido, 0);
  assert.equal(m.of, "OF-2000");
  assert.equal(m.meta, 5000);
  assert.equal(db.historicoOF[0].produzido, 6000);
  assert.equal(R.historicoOF(db)[0].atingimento, 50);
});

test("parada: não permite duas abertas, e finalizar calcula a duração", () => {
  const db = novoBanco();
  R.registrarParada(db, 2, { motivo: "Quebra" });
  assert.throws(() => R.registrarParada(db, 2, { motivo: "Setup" }), /aberto/);
  assert.throws(() => R.mudarStatus(db, 2, "produzindo"), /parada em aberto/);
  const p = R.finalizarParada(db, 2);
  assert.ok(p.fim);
  assert.ok(p.duracao_seg >= 0);
  assert.throws(() => R.finalizarParada(db, 2), /Nenhuma parada/);
});

test("status inválido é rejeitado", () => {
  assert.throws(() => R.mudarStatus(novoBanco(), 1, "voando"), /Status inválido/);
});

test("desativar máquina preserva histórico e ela continua no relatório do dia em que operou", () => {
  const db = novoBanco();
  db.apontamentos.push({ maquina_id: 3, of: "OF-1003", operador: "Jonas", qtd: 700, ts: "2026-08-03T15:00:00.000Z" });
  R.desativarMaquina(db, 3);
  assert.equal(R.listarMaquinas(db).some((m) => m.id === 3), false);
  assert.equal(db.apontamentos.length, 1);
  const rel = R.relatorioDia(db, "2026-08-03");
  const linha = rel.producao.find((l) => l.maquina.startsWith("Máquina 03"));
  assert.equal(linha.produzidoDia, 700);
  assert.match(linha.maquina, /desativada/);
});

test("relatório do dia usa apenas os registros daquele dia", () => {
  const db = novoBanco();
  db.apontamentos.push(
    { maquina_id: 1, of: "OF-1001", operador: "Carlos", qtd: 1000, ts: "2026-08-02T14:00:00.000Z" },
    { maquina_id: 1, of: "OF-1001", operador: "Carlos", qtd: 2000, ts: "2026-08-03T14:00:00.000Z" },
    { maquina_id: 1, of: "OF-1001", operador: "Ana", qtd: 300, ts: "2026-08-04T01:00:00.000Z" }, // 22h do dia 03 em Brasília
  );
  db.paradas.push({ id: 1, maquina_id: 1, motivo: "Setup", operador: "", inicio: "2026-08-03T12:00:00.000Z", fim: "2026-08-03T12:30:00.000Z", duracao_seg: 1800 });
  const rel = R.relatorioDia(db, "2026-08-03");
  assert.equal(rel.totais.producao, 2300);
  assert.equal(rel.totais.tempoParadoMin, 30);
  assert.equal(rel.producao.find((l) => l.maquina === "Máquina 01").operadores, "Carlos, Ana");
  assert.equal(R.relatorioDia(db, "2026-08-02").totais.producao, 1000);
});

test("textos digitados são limpos de < e >", () => {
  const db = novoBanco();
  const m = R.criarMaquina(db, { nome: "<script>Prensa</script>" });
  assert.equal(m.nome.includes("<"), false);
});

test("não permite duas máquinas ativas com o mesmo nome", () => {
  const db = novoBanco();
  assert.throws(() => R.criarMaquina(db, { nome: "máquina 01" }), /esse nome/);
});
