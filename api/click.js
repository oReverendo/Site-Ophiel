import { supabaseDeps } from "../lib/server.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 512;

function done(res, status, headers = {}) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end();
}

/** Lê `l` do corpo (objeto já interpretado ou texto JSON). Qualquer coisa fora do formato → null. */
function linkIdOf(req) {
  let body = req.body;
  if (typeof body === "string") {
    if (body.length > MAX_BODY) return null;
    try { body = JSON.parse(body); } catch { return null; }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return typeof body.l === "string" && UUID.test(body.l) ? body.l : null;
}

/**
 * POST /api/click {l: <uuid do link>} → soma 1 no contador do dia (só conta para quem tem o plano pago; o banco decide).
 * Sempre 204, mesmo com erro: nunca atrapalha a navegação do visitante e não revela se o link existe.
 */
export function createHandler({ track }) {
  return async function handler(req, res) {
    if (req?.method !== "POST") return done(res, 405, { Allow: "POST" });
    const len = Number(req.headers?.["content-length"]);
    if (Number.isFinite(len) && len > MAX_BODY) return done(res, 204);
    const id = linkIdOf(req);
    if (id) {
      try { await track(id); } catch (err) { console.error("click: falha ao contar", err?.message); }
    }
    return done(res, 204);
  };
}

export default createHandler(supabaseDeps);
