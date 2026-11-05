import { validateUsername } from "../lib/username.js";
import { buildVcard } from "../lib/vcard.js";
import { supabaseDeps } from "../lib/server.js";

function end(res, status, body, headers) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}
const NOT_FOUND = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=10", "X-Robots-Tag": "noindex" };

/** /all2/<usuario>/contacto.vcf — só para quem tem o plano pago e ligou "Guardar contacto". */
export function createHandler({ getProfile }) {
  return async function handler(req, res) {
    const raw = req?.query?.u;
    const parsed = typeof raw === "string" ? validateUsername(raw) : { ok: false };
    if (!parsed.ok || parsed.value !== raw) return end(res, 404, "No encontrado", NOT_FOUND);
    try {
      const found = await getProfile(parsed.value);
      if (!found || found.plan !== "personalizado" || !found.profile?.show_vcard) return end(res, 404, "No encontrado", NOT_FOUND);
      return end(res, 200, buildVcard(found), {
        "Content-Type": "text/vcard; charset=utf-8",
        "Content-Disposition": `attachment; filename="${parsed.value}.vcf"`,
        "Cache-Control": "s-maxage=60",
        "X-Robots-Tag": "noindex",
      });
    } catch (err) {
      console.error("vcard: falha ao ler perfil", err?.message);
      return end(res, 500, "Error", { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    }
  };
}

export default createHandler(supabaseDeps);
