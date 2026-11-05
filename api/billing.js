import { billingDeps } from "../lib/server.js";
import { bearerToken, checkoutParams, portalParams } from "../lib/billing.js";
import { planFromSubscription } from "../lib/plan.js";

const MAX_BODY = 1024;

function send(res, status, payload, headers = {}) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (payload === undefined) return res.end();
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(payload));
}

function actionOf(req) {
  let body = req.body;
  if (typeof body === "string") {
    if (body.length > MAX_BODY) return null;
    try { body = JSON.parse(body); } catch { return null; }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body.action === "checkout" || body.action === "portal" ? body.action : null;
}

/**
 * POST /api/billing  {action: "checkout" | "portal"}  + Authorization: Bearer <token de sessão do Supabase>
 * → {url} para onde mandar o navegador (Stripe Checkout ou portal do cliente).
 * Quem paga é SEMPRE o dono do token; preço e URLs de volta vêm do servidor, nunca do pedido.
 */
export function createHandler({ getUser, getSubscription, stripe, config, now = Date.now }) {
  return async function handler(req, res) {
    if (req?.method !== "POST") return send(res, 405, undefined, { Allow: "POST" });
    const token = bearerToken(req.headers);
    const user = token ? await getUser(token).catch(() => null) : null;
    if (!user?.id) return send(res, 401, { error: "auth" });
    const action = actionOf(req);
    if (!action) return send(res, 400, { error: "accion" });

    try {
      const sub = await getSubscription(user.id);
      if (action === "checkout") {
        if (!config.priceId || !config.siteUrl) return send(res, 500, { error: "config" });
        if (planFromSubscription(sub, new Date(now())) === "personalizado") return send(res, 409, { error: "ya_activo" });
        const s = await stripe("/v1/checkout/sessions", checkoutParams({
          priceId: config.priceId, siteUrl: config.siteUrl, automaticTax: config.automaticTax,
          profileId: user.id, email: user.email, customerId: sub?.stripe_customer_id || undefined,
        }));
        return send(res, 200, { url: s.url });
      }
      if (!sub?.stripe_customer_id) return send(res, 404, { error: "sin_cliente" });
      const s = await stripe("/v1/billing_portal/sessions", portalParams({ customerId: sub.stripe_customer_id, siteUrl: config.siteUrl }));
      return send(res, 200, { url: s.url });
    } catch (err) {
      console.error("billing: falha", action, String(err?.message || err).replace(/sk_(live|test)_\w+/g, "sk_***"));
      return send(res, 502, { error: "stripe" });
    }
  };
}

export default createHandler(billingDeps);
