// ============================================================
// Datas no fuso horário da fábrica.
// O "dia" de um registro é calculado no fuso local (padrão:
// America/Sao_Paulo), e não em UTC. Sem isso, qualquer registro
// feito depois das 21h (horário de Brasília) cairia no dia seguinte.
// O fuso pode ser alterado pela variável de ambiente FP_TZ.
// ============================================================

const FUSO = process.env.FP_TZ || "America/Sao_Paulo";

const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit",
});

/** Data/hora atual em ISO (UTC) — formato usado para gravar os registros. */
function agoraISO() {
  return new Date().toISOString();
}

/** Converte um instante (ISO ou Date) no dia local "AAAA-MM-DD". */
function diaLocal(instante = new Date()) {
  return fmtDia.format(new Date(instante)); // en-CA já devolve AAAA-MM-DD
}

/** Hora local "HH:MM" de um instante. */
function horaLocal(instante) {
  return new Date(instante).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
}

/** Data e hora local "DD/MM/AAAA HH:MM" de um instante. */
function dataHoraLocal(instante) {
  return new Date(instante).toLocaleString("pt-BR", {
    timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Valida o formato AAAA-MM-DD. */
function diaValido(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T12:00:00Z"));
}

module.exports = { FUSO, agoraISO, diaLocal, horaLocal, dataHoraLocal, diaValido };
