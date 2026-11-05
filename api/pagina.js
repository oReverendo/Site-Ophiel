import { validateUsername } from "../lib/username.js";
import { renderPage, renderNotFound } from "../lib/render-page.js";
import { supabaseDeps } from "../lib/server.js";
import { makeGetProfile } from "../lib/get-page.js";

function send(res, status, html, cache) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.setHeader("X-Robots-Tag", "noindex");
  res.end(html);
}

/** Cria o handler de /all2/<usuario>. `getProfile` é injetado para poder testar sem banco. */
export function createHandler({ getProfile }) {
  return async function handler(req, res) {
    const raw = req?.query?.u;
    const parsed = typeof raw === "string" ? validateUsername(raw) : { ok: false };
    // Só consulta o banco com um usuário bem formado. Reservados também caem aqui: nunca são perfis.
    if (!parsed.ok || parsed.value !== raw) return send(res, 404, renderNotFound(), "public, s-maxage=10");
    try {
      const found = await getProfile(parsed.value);
      if (!found) return send(res, 404, renderNotFound(), "public, s-maxage=10");
      return send(res, 200, renderPage(found.profile, found.links, found.plan), "s-maxage=60, stale-while-revalidate=300");
    } catch (err) {
      console.error("pagina: falha ao ler perfil", err?.message);
      return send(res, 500, "<!DOCTYPE html><meta charset=utf-8><title>Error</title><p>Algo salió mal. Inténtalo de nuevo en un momento.</p>", "no-store");
    }
  };
}

export { makeGetProfile };

export default createHandler(supabaseDeps);
