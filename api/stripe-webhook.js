import { webhookDeps } from "../lib/server.js";
import { verifyStripeSignature, subscriptionRow } from "../lib/billing.js";

// O Stripe assina o corpo CRU: não deixar o Vercel interpretar o JSON antes.
export const config = { api: { bodyParser: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RAW = 1024 * 1024;
const SUB_EVENTS = new Set(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]);

function done(res, status, text = "") {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  res.end(text);
}

async function rawBodyOf(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_RAW) throw new Error("corpo grande");
    chunks.push(Buffer.from(c));
  }
  return Buffer.concat(chunks);
}

/**
 * POST /api/stripe-webhook — o Stripe avisa; este endpoint confere a assinatura e grava o estado em public.subscriptions.
 * Para cada evento relê a assinatura no Stripe (estado atual): um aviso atrasado nunca desfaz um mais novo.
 * 2xx = recebido (ou nada a fazer); 5xx = o Stripe tenta de novo.
 */
export function createHandler({ webhookSecret, retrieveSubscription, findProfileByCustomer, upsert, now = Date.now }) {
  return async function handler(req, res) {
    if (req?.method !== "POST") { res.setHeader?.("Allow", "POST"); return done(res, 405); }
    if (!webhookSecret) { console.error("stripe-webhook: falta STRIPE_WEBHOOK_SECRET"); return done(res, 500); }

    let raw;
    try { raw = await rawBodyOf(req); } catch { return done(res, 400); }
    if (!verifyStripeSignature(raw, req.headers?.["stripe-signature"], webhookSecret, now())) return done(res, 400, "firma");
    let event;
    try { event = JSON.parse(raw.toString("utf8")); } catch { return done(res, 400); }

    const obj = event?.data?.object;
    let subId = null;
    let hint = null;
    if (event?.type === "checkout.session.completed" && obj?.mode === "subscription" && typeof obj.subscription === "string") {
      subId = obj.subscription; hint = obj.client_reference_id;
    } else if (SUB_EVENTS.has(event?.type) && typeof obj?.id === "string") {
      subId = obj.id;
    }
    if (!subId) return done(res, 200, "ignorado");

    try {
      const sub = await retrieveSubscription(subId);
      const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
      let profileId = [hint, sub.metadata?.profile_id].find((v) => typeof v === "string" && UUID.test(v)) || null;
      if (!profileId && customer) profileId = await findProfileByCustomer(customer);
      const row = profileId && UUID.test(profileId) ? subscriptionRow(sub, profileId, now()) : null;
      if (!row) { console.error("stripe-webhook: sem perfil/periodo para", subId); return done(res, 200, "sin_perfil"); }
      try {
        await upsert(row);
      } catch (err) {
        if (err?.code === "23503") { console.error("stripe-webhook: perfil já não existe", profileId); return done(res, 200, "sin_perfil"); }
        throw err;
      }
      return done(res, 200, "ok");
    } catch (err) {
      console.error("stripe-webhook: falha", event?.type, String(err?.message || err));
      return done(res, 500);
    }
  };
}

export default createHandler(webhookDeps);
