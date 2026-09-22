// Testes de integração: sobe o servidor de verdade numa porta livre,
// com um arquivo de dados temporário, e exercita o fluxo completo pela API.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { criarServidor } = require("../server");

let server, base, arquivo;

before(async () => {
  arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fp-")), "dados-teste.json");
  server = criarServidor({ arquivoDados: arquivo });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const chamar = async (metodo, rota, corpo) => {
  const r = await fetch(base + rota, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo) });
  return { status: r.status, dados: await r.json() };
};

test("fluxo completo: cadastro → apontamento → parada → relatório → desativação", async () => {
  const { dados: { id } } = await chamar("POST", "/api/maquinas", { nome: "Prensa Teste", of: "OF-9", meta: 1000 });
  assert.ok(id);

  assert.equal((await chamar("POST", `/api/maquinas/${id}/apontar`, { qtd: 400, operador: "Bia" })).dados.produzido, 400);
  assert.equal((await chamar("POST", `/api/maquinas/${id}/parar`, { motivo: "Quebra" })).status, 200);
  assert.equal((await chamar("POST", `/api/maquinas/${id}/retomar`)).status, 200);

  const maq = (await chamar("GET", "/api/maquinas")).dados.find((m) => m.id === id);
  assert.equal(maq.atingimento, 40);
  assert.equal(maq.status, "produzindo");

  const rel = (await chamar("GET", "/api/relatorio")).dados;
  assert.equal(rel.producao.find((l) => l.maquina === "Prensa Teste").produzidoDia, 400);
  assert.equal(rel.paradas.length, 1);

  assert.equal((await chamar("DELETE", `/api/maquinas/${id}`)).status, 200);
  assert.equal((await chamar("GET", "/api/maquinas")).dados.some((m) => m.id === id), false);
  assert.match((await chamar("GET", "/api/relatorio")).dados.producao.map((l) => l.maquina).join(), /Prensa Teste \(desativada\)/);
});

test("dados persistem no arquivo", async () => {
  await chamar("POST", "/api/maquinas", { nome: "Persistente" });
  const salvo = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  assert.ok(salvo.maquinas.some((m) => m.nome === "Persistente"));
});

test("erros de validação retornam 400/404 com mensagem", async () => {
  assert.equal((await chamar("POST", "/api/maquinas", {})).status, 400);
  assert.equal((await chamar("POST", "/api/maquinas/1/apontar", { qtd: -3 })).status, 400);
  assert.equal((await chamar("POST", "/api/maquinas/1/status", { status: "x" })).status, 400);
  assert.equal((await chamar("PUT", "/api/maquinas/1", { produzido: 5 })).status, 400);
  assert.equal((await chamar("POST", "/api/maquinas/999/apontar", { qtd: 1 })).status, 404);
  assert.equal((await chamar("GET", "/api/relatorio?dia=ontem")).status, 400);
  assert.equal((await chamar("POST", "/api/maquinas", "{json quebrado")).status, 400);
  assert.equal((await chamar("GET", "/api/nao-existe")).status, 404);
});

test("front-end é servido e caminhos fora da pasta pública são bloqueados", async () => {
  const r = await fetch(base + "/");
  assert.equal(r.status, 200);
  assert.match(await r.text(), /FactoryPulse/);
  const r2 = await fetch(base + "/..%2Fserver.js");
  assert.notEqual(r2.status, 200);
});
