import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { createHandler as createBilling } from "../api/billing.js";
import { createHandler as createWebhook } from "../api/stripe-webhook.js";

const PID = "11111111-1111-1111-1111-111111111111";
const NOW = 1_800_000_000_000;
const END = Math.floor(NOW / 1000) + 86400 * 20;

function res() {
  const r = { statusCode: 0, headers: {}, body: "" };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.end = (b = "") => { r.body = b; };
  r.json = () => JSON.parse(r.body);
  return r;
}

/* ---------------- /api/billing ---------------- */
function billingDeps(over = {}) {
  return {
    getUser: vi.fn(async (t) => (t === "tok" ? { id: PID, email: "v@ophiel.es" } : null)),
    getSubscription: vi.fn(async () => null),
    stripe: vi.fn(async (path) => ({ url: path.includes("portal") ? "https://billing.stripe.com/p/x" : "https://checkout.stripe.com/c/y" })),
    config: { priceId: "price_1", siteUrl: "https://www.ophiel.es", automaticTax: false },
    now: () => NOW,
    ...over,
  };
}
const post = (body, token = "tok") => ({ method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body });

describe("api/billing", () => {
  it("só aceita POST", async () => {
    const r = res(); await createBilling(billingDeps())({ method: "GET", headers: {} }, r);
    expect(r.statusCode).toBe(405); expect(r.headers.allow).toBe("POST");
  });
  it("401 sem token ou com token inválido", async () => {
    for (const t of [null, "ruim"]) { const r = res(); await createBilling(billingDeps())(post({ action: "checkout" }, t), r); expect(r.statusCode).toBe(401); }
  });
  it("400 com ação desconhecida ou corpo ruim", async () => {
    for (const b of [{ action: "x" }, {}, "{", null, []]) { const r = res(); await createBilling(billingDeps())(post(b), r); expect(r.statusCode).toBe(400); }
  });
  it("aceita corpo em texto JSON", async () => {
    const r = res(); await createBilling(billingDeps())(post('{"action":"checkout"}'), r); expect(r.statusCode).toBe(200);
  });
  it("checkout: cria a sessão com o perfil do TOKEN (não do corpo) e devolve a url", async () => {
    const d = billingDeps(); const r = res();
    await createBilling(d)(post({ action: "checkout", profileId: "outro", priceId: "price_hack", successUrl: "https://evil.example" }), r);
    expect(r.statusCode).toBe(200); expect(r.json().url).toBe("https://checkout.stripe.com/c/y");
    const [path, params] = d.stripe.mock.calls[0];
    expect(path).toBe("/v1/checkout/sessions");
    expect(params.client_reference_id).toBe(PID);
    expect(params.line_items[0].price).toBe("price_1");
    expect(params.success_url).toBe("https://www.ophiel.es/painel?pago=1");
    expect(params.customer_email).toBe("v@ophiel.es");
    expect(r.headers["cache-control"]).toBe("no-store");
  });
  it("checkout reaproveita o customer da assinatura antiga (já cancelada)", async () => {
    const d = billingDeps({ getSubscription: async () => ({ status: "canceled", current_period_end: new Date(NOW - 1000).toISOString(), stripe_customer_id: "cus_7" }) });
    await createBilling(d)(post({ action: "checkout" }), res());
    expect(d.stripe.mock.calls[0][1].customer).toBe("cus_7");
  });
  it("checkout: 409 se já tem plano ativo (evita cobrar duas vezes)", async () => {
    const d = billingDeps({ getSubscription: async () => ({ status: "active", current_period_end: new Date(NOW + 1e9).toISOString(), stripe_customer_id: "cus_7" }) });
    const r = res(); await createBilling(d)(post({ action: "checkout" }), r);
    expect(r.statusCode).toBe(409); expect(d.stripe).not.toHaveBeenCalled();
  });
  it("checkout: 500 se falta o price no ambiente", async () => {
    const d = billingDeps({ config: { priceId: "", siteUrl: "https://www.ophiel.es" } });
    const r = res(); await createBilling(d)(post({ action: "checkout" }), r);
    expect(r.statusCode).toBe(500); expect(r.json().error).toBe("config");
  });
  it("portal: usa o customer gravado e volta para o painel", async () => {
    const d = billingDeps({ getSubscription: async () => ({ status: "active", current_period_end: new Date(NOW + 1e9).toISOString(), stripe_customer_id: "cus_7" }) });
    const r = res(); await createBilling(d)(post({ action: "portal" }), r);
    expect(r.json().url).toBe("https://billing.stripe.com/p/x");
    expect(d.stripe.mock.calls[0]).toEqual(["/v1/billing_portal/sessions", { customer: "cus_7", return_url: "https://www.ophiel.es/painel" }]);
  });
  it("portal: 404 se nunca assinou", async () => {
    const r = res(); await createBilling(billingDeps())(post({ action: "portal" }), r);
    expect(r.statusCode).toBe(404);
  });
  it("falha do Stripe → 502 sem vazar detalhes", async () => {
    const d = billingDeps({ stripe: async () => { throw new Error("sk_live_SEGREDO boom"); } });
    const r = res(); await createBilling(d)(post({ action: "checkout" }), r);
    expect(r.statusCode).toBe(502); expect(r.body).not.toContain("SEGREDO");
  });
});

/* ---------------- /api/stripe-webhook ---------------- */
const SECRET = "whsec_t";
const t = Math.floor(NOW / 1000);
function signed(evt, secret = SECRET) {
  const raw = JSON.stringify(evt);
  const sig = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return { method: "POST", headers: { "stripe-signature": `t=${t},v1=${sig}` }, body: raw };
}
const stripeSub = (over = {}) => ({ id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false, current_period_end: END, metadata: { profile_id: PID }, ...over });
function hookDeps(over = {}) {
  return {
    webhookSecret: SECRET,
    retrieveSubscription: vi.fn(async () => stripeSub()),
    findProfileByCustomer: vi.fn(async () => null),
    upsert: vi.fn(async () => {}),
    now: () => NOW,
    ...over,
  };
}
const evt = (type, object) => ({ id: "evt_1", type, data: { object } });

describe("api/stripe-webhook", () => {
  it("só POST", async () => {
    const r = res(); await createWebhook(hookDeps())({ method: "GET", headers: {} }, r); expect(r.statusCode).toBe(405);
  });
  it("assinatura inválida/ausente → 400 e nada gravado", async () => {
    const d = hookDeps();
    for (const req of [signed(evt("customer.subscription.updated", stripeSub()), "errado"), { method: "POST", headers: {}, body: "{}" }]) {
      const r = res(); await createWebhook(d)(req, r); expect(r.statusCode).toBe(400);
    }
    expect(d.upsert).not.toHaveBeenCalled(); expect(d.retrieveSubscription).not.toHaveBeenCalled();
  });
  it("sem segredo configurado → 500 (nunca aceita sem verificar)", async () => {
    const d = hookDeps({ webhookSecret: "" }); const r = res();
    await createWebhook(d)(signed(evt("customer.subscription.updated", stripeSub()), ""), r);
    expect(r.statusCode).toBe(500); expect(d.upsert).not.toHaveBeenCalled();
  });
  it("corpo que não é JSON (mesmo assinado) → 400", async () => {
    const raw = "{"; const sig = createHmac("sha256", SECRET).update(`${t}.${raw}`).digest("hex");
    const r = res(); await createWebhook(hookDeps())({ method: "POST", headers: { "stripe-signature": `t=${t},v1=${sig}` }, body: raw }, r);
    expect(r.statusCode).toBe(400);
  });
  it("checkout.session.completed: busca a assinatura e grava para o client_reference_id", async () => {
    const d = hookDeps(); const r = res();
    await createWebhook(d)(signed(evt("checkout.session.completed", { mode: "subscription", subscription: "sub_1", client_reference_id: PID })), r);
    expect(r.statusCode).toBe(200);
    expect(d.retrieveSubscription).toHaveBeenCalledWith("sub_1");
    expect(d.upsert).toHaveBeenCalledTimes(1);
    expect(d.upsert.mock.calls[0][0]).toMatchObject({ profile_id: PID, status: "active", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", cancel_at_period_end: false });
  });
  it("checkout de pagamento único (não assinatura) é ignorado", async () => {
    const d = hookDeps(); const r = res();
    await createWebhook(d)(signed(evt("checkout.session.completed", { mode: "payment", client_reference_id: PID })), r);
    expect(r.statusCode).toBe(200); expect(d.upsert).not.toHaveBeenCalled();
  });
  it.each(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"])("%s: relê o estado atual no Stripe (evento atrasado não sobrescreve)", async (type) => {
    const d = hookDeps({ retrieveSubscription: vi.fn(async () => stripeSub({ status: "canceled" })) }); const r = res();
    await createWebhook(d)(signed(evt(type, stripeSub({ status: "active" }))), r);
    expect(r.statusCode).toBe(200);
    expect(d.upsert.mock.calls[0][0].status).toBe("canceled");
  });
  it("cancelar no fim do período: grava cancel_at_period_end", async () => {
    const d = hookDeps({ retrieveSubscription: async () => stripeSub({ cancel_at_period_end: true }) });
    await createWebhook(d)(signed(evt("customer.subscription.updated", stripeSub())), res());
    expect(d.upsert.mock.calls[0][0].cancel_at_period_end).toBe(true);
  });
  it("sem metadata: acha o perfil pelo customer", async () => {
    const d = hookDeps({ retrieveSubscription: async () => stripeSub({ metadata: {} }), findProfileByCustomer: vi.fn(async () => PID) });
    await createWebhook(d)(signed(evt("customer.subscription.updated", stripeSub({ metadata: {} }))), res());
    expect(d.findProfileByCustomer).toHaveBeenCalledWith("cus_1");
    expect(d.upsert.mock.calls[0][0].profile_id).toBe(PID);
  });
  it("sem perfil identificável → 200 (não fica em loop de reenvio) e nada gravado", async () => {
    const d = hookDeps({ retrieveSubscription: async () => stripeSub({ metadata: {} }) }); const r = res();
    await createWebhook(d)(signed(evt("customer.subscription.updated", stripeSub({ metadata: {} }))), r);
    expect(r.statusCode).toBe(200); expect(d.upsert).not.toHaveBeenCalled();
  });
  it("profile_id que não é uuid é ignorado", async () => {
    const d = hookDeps({ retrieveSubscription: async () => stripeSub({ metadata: { profile_id: "x'; drop" } }) });
    const r = res(); await createWebhook(d)(signed(evt("customer.subscription.updated", stripeSub())), r);
    expect(r.statusCode).toBe(200); expect(d.upsert).not.toHaveBeenCalled();
  });
  it("falha ao gravar → 500 (o Stripe reenvia); perfil apagado (23503) → 200", async () => {
    let r = res();
    await createWebhook(hookDeps({ upsert: async () => { throw new Error("db"); } }))(signed(evt("customer.subscription.updated", stripeSub())), r);
    expect(r.statusCode).toBe(500);
    r = res();
    await createWebhook(hookDeps({ upsert: async () => { throw Object.assign(new Error("fk"), { code: "23503" }); } }))(signed(evt("customer.subscription.updated", stripeSub())), r);
    expect(r.statusCode).toBe(200);
  });
  it("falha ao reler no Stripe → 500", async () => {
    const r = res();
    await createWebhook(hookDeps({ retrieveSubscription: async () => { throw new Error("net"); } }))(signed(evt("customer.subscription.updated", stripeSub())), r);
    expect(r.statusCode).toBe(500);
  });
  it("outros eventos → 200 sem fazer nada", async () => {
    const d = hookDeps(); const r = res();
    await createWebhook(d)(signed(evt("charge.succeeded", {})), r);
    expect(r.statusCode).toBe(200); expect(d.upsert).not.toHaveBeenCalled();
  });
  it("lê o corpo cru de um stream quando o runtime não entrega req.body", async () => {
    const { body, headers, method } = signed(evt("charge.succeeded", {}));
    const req = { method, headers, async *[Symbol.asyncIterator]() { yield Buffer.from(body); } };
    const r = res(); await createWebhook(hookDeps())(req, r); expect(r.statusCode).toBe(200);
  });
});
