// ============================================================
// FactoryPulse — Servidor interno (rede local da fábrica)
// Usa só o Node.js puro (sem dependências externas).
//
// Camadas:
//   server.js      -> HTTP: rotas, leitura do corpo, respostas JSON
//   src/regras.js  -> regras de negócio (testáveis isoladamente)
//   src/banco.js   -> persistência no arquivo dados.json
//   src/datas.js   -> datas no fuso horário da fábrica
//
// Rodar: npm start      Testar: npm test
// Variáveis opcionais: PORT (padrão 3000), FP_DB (arquivo de dados),
//                      FP_TZ (fuso, padrão America/Sao_Paulo)
// ============================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const banco = require("./src/banco");
const R = require("./src/regras");
const { diaLocal, diaValido } = require("./src/datas");

const PUBLIC = path.join(__dirname, "public");
const LIMITE_CORPO = 100 * 1024; // 100 KB

function json(res, obj, code = 200) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => {
      d += c;
      if (d.length > LIMITE_CORPO) { reject(new R.ErroNegocio("Requisição muito grande.", 413)); req.destroy(); }
    });
    req.on("end", () => {
      if (!d) return resolve({});
      try { resolve(JSON.parse(d)); } catch { reject(new R.ErroNegocio("JSON inválido.")); }
    });
    req.on("error", reject);
  });
}

function criarServidor({ arquivoDados = process.env.FP_DB || path.join(__dirname, "dados.json") } = {}) {
  const db = banco.carregar(arquivoDados);
  const salvar = () => banco.salvar(arquivoDados, db);

  // Tabela de rotas: [método, padrão, precisaSalvar, handler(params, corpo, query)]
  const rotas = [
    ["GET", /^\/api\/maquinas$/, false, () => R.listarMaquinas(db)],
    ["POST", /^\/api\/maquinas$/, true, (p, b) => ({ id: R.criarMaquina(db, b).id })],
    ["PUT", /^\/api\/maquinas\/(\d+)$/, true, (p, b) => (R.editarMaquina(db, p[0], b), { ok: true })],
    ["DELETE", /^\/api\/maquinas\/(\d+)$/, true, (p) => (R.desativarMaquina(db, p[0]), { ok: true })],
    ["POST", /^\/api\/maquinas\/(\d+)\/apontar$/, true, (p, b) => ({ ok: true, produzido: R.apontarProducao(db, p[0], b) })],
    ["POST", /^\/api\/maquinas\/(\d+)\/encerrar-of$/, true, (p, b) => (R.encerrarOF(db, p[0], b), { ok: true })],
    ["POST", /^\/api\/maquinas\/(\d+)\/status$/, true, (p, b) => (R.mudarStatus(db, p[0], b.status), { ok: true })],
    ["POST", /^\/api\/maquinas\/(\d+)\/parar$/, true, (p, b) => (R.registrarParada(db, p[0], b), { ok: true })],
    ["POST", /^\/api\/maquinas\/(\d+)\/retomar$/, true, (p) => ({ ok: true, duracao_seg: R.finalizarParada(db, p[0]).duracao_seg })],
    ["GET", /^\/api\/maquinas\/(\d+)\/timeline$/, false, (p) => R.timeline(db, p[0])],
    ["GET", /^\/api\/historico-of$/, false, () => R.historicoOF(db)],
    ["GET", /^\/api\/pareto$/, false, () => R.pareto(db.paradas.filter((x) => x.fim))],
    ["GET", /^\/api\/resumo$/, false, () => R.resumo(db)],
    ["GET", /^\/api\/relatorio$/, false, (p, b, q) => {
      const dia = q.get("dia") || diaLocal();
      if (!diaValido(dia)) throw new R.ErroNegocio("Data inválida. Use o formato AAAA-MM-DD.");
      return R.relatorioDia(db, dia);
    }],
  ];

  async function api(req, res) {
    const [caminho, qs] = req.url.split("?");
    for (const [metodo, padrao, grava, handler] of rotas) {
      if (req.method !== metodo) continue;
      const m = caminho.match(padrao);
      if (!m) continue;
      const corpo = ["POST", "PUT"].includes(metodo) ? await lerCorpo(req) : {};
      const resultado = handler(m.slice(1), corpo, new URLSearchParams(qs || ""));
      if (grava) salvar();
      return json(res, resultado);
    }
    return json(res, { erro: "Rota não encontrada." }, 404);
  }

  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".ico": "image/x-icon" };
  function servirEstatico(req, res) {
    const rel = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
    let arquivo;
    try { arquivo = path.join(PUBLIC, path.normalize(decodeURIComponent(rel))); }
    catch { res.writeHead(400); return res.end("Endereço inválido"); }
    if (!arquivo.startsWith(PUBLIC)) { res.writeHead(403); return res.end("Proibido"); }
    fs.readFile(arquivo, (err, data) => {
      if (err) { res.writeHead(404); return res.end("Não encontrado"); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(arquivo)] || "application/octet-stream" });
      res.end(data);
    });
  }

  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/api/")) {
      return api(req, res).catch((e) => {
        if (e instanceof R.ErroNegocio) return json(res, { erro: e.message }, e.status);
        console.error(e);
        json(res, { erro: "Erro interno do servidor." }, 500);
      });
    }
    servirEstatico(req, res);
  });
  server.db = db; // exposto para os testes
  return server;
}

// Só liga o servidor quando executado diretamente (npm start).
// Quando importado pelos testes, apenas exporta a função.
if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;
  criarServidor().listen(PORT, "0.0.0.0", () => {
    const nets = os.networkInterfaces();
    let ip = "localhost";
    for (const nome of Object.keys(nets)) for (const net of nets[nome] || []) if (net.family === "IPv4" && !net.internal) { ip = net.address; break; }
    console.log("\n========================================");
    console.log("  FactoryPulse está no ar!");
    console.log("========================================");
    console.log(`  Neste computador:  http://localhost:${PORT}`);
    console.log(`  Nos tablets/PCs:   http://${ip}:${PORT}`);
    console.log("========================================");
    console.log("  Para desligar: feche esta janela ou aperte Ctrl+C");
    console.log("========================================\n");
  });
}

module.exports = { criarServidor };
