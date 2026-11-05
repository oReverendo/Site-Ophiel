import { createHmac, timingSafeEqual } from "node:crypto";

// Funções puras da cobrança (Stripe). Sem rede e sem segredos: os endpoints em api/ injetam o resto.

const TOLERANCE_S = 300;

/** Confere o cabeçalho Stripe-Signature (t=...,v1=...) contra o corpo CRU. Aceita várias v1 (rotação de segredo). */
export function verifyStripeSignature(rawBody, header, secret, now = Date.now()) {
  if (!secret || typeof header !== "string") return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number((parts.find(([k]) => k === "t") || [])[1]);
  const sigs = parts.filter(([k, v]) => k === "v1" && /^[0-9a-f]{64}$/i.test(v || "")).map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length) return false;
  if (Math.abs(now / 1000 - t) > TOLERANCE_S) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ""), "utf8");
  const expected = createHmac("sha256", secret).update(Buffer.concat([Buffer.from(`${t}.`), body])).digest();
  return sigs.some((s) => timingSafeEqual(expected, Buffer.from(s, "hex")));
}

/** Objeto → application/x-www-form-urlencoded com a notação de colchetes da API do Stripe. */
export function formEncode(obj) {
  const out = new URLSearchParams();
  const walk = (prefix, v) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(`${prefix}[${i}]`, x));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(prefix ? `${prefix}[${k}]` : k, x);
    else out.append(prefix, String(v));
  };
  walk("", obj);
  return out.toString();
}

/** Parâmetros da Checkout Session. As URLs de volta são SEMPRE as do site (nunca vêm do pedido). */
export function checkoutParams({ priceId, profileId, email, customerId, siteUrl, automaticTax = false }) {
  return {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: profileId,
    subscription_data: { metadata: { profile_id: profileId } },
    metadata: { profile_id: profileId },
    success_url: `${siteUrl}/painel?pago=1`,
    cancel_url: `${siteUrl}/painel?pago=0`,
    allow_promotion_codes: true,
    locale: "auto",
    ...(customerId ? { customer: customerId } : email ? { customer_email: email } : {}),
    ...(automaticTax ? { automatic_tax: { enabled: true } } : {}),
  };
}

export function portalParams({ customerId, siteUrl }) {
  return { customer: customerId, return_url: `${siteUrl}/painel` };
}

/** Subscription do Stripe → linha de public.subscriptions. null se não dá para gravar com segurança. */
export function subscriptionRow(sub, profileId, now = Date.now()) {
  if (!sub || !profileId) return null;
  const end = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end; // API nova: o período fica no item
  if (!Number.isFinite(end)) return null;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  return {
    profile_id: profileId,
    status: String(sub.status),
    current_period_end: new Date(end * 1000).toISOString(),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    stripe_customer_id: customer,
    stripe_subscription_id: sub.id ?? null,
    updated_at: new Date(now).toISOString(),
  };
}

/** "Bearer <token>" → token (ou null). */
export function bearerToken(headers) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(headers?.authorization ?? ""));
  return m ? m[1] : null;
}
