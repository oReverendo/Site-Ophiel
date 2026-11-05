import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyStripeSignature, formEncode, checkoutParams, portalParams, subscriptionRow, bearerToken } from "../lib/billing.js";

const SECRET = "whsec_test";
const sign = (body, t, secret = SECRET) => createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
const NOW = 1_800_000_000_000;
const t = Math.floor(NOW / 1000);

describe("verifyStripeSignature", () => {
  const body = '{"id":"evt_1"}';
  it("aceita assinatura válida", () => {
    expect(verifyStripeSignature(body, `t=${t},v1=${sign(body, t)}`, SECRET, NOW)).toBe(true);
  });
  it("aceita Buffer no corpo", () => {
    expect(verifyStripeSignature(Buffer.from(body), `t=${t},v1=${sign(body, t)}`, SECRET, NOW)).toBe(true);
  });
  it("aceita várias v1 (rotação de segredo) se alguma bate", () => {
    expect(verifyStripeSignature(body, `t=${t},v1=${"0".repeat(64)},v1=${sign(body, t)}`, SECRET, NOW)).toBe(true);
  });
  it("recusa corpo alterado", () => {
    expect(verifyStripeSignature(body + " ", `t=${t},v1=${sign(body, t)}`, SECRET, NOW)).toBe(false);
  });
  it("recusa segredo errado", () => {
    expect(verifyStripeSignature(body, `t=${t},v1=${sign(body, t, "outro")}`, SECRET, NOW)).toBe(false);
  });
  it("recusa timestamp velho (>5 min) e futuro", () => {
    expect(verifyStripeSignature(body, `t=${t - 301},v1=${sign(body, t - 301)}`, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t + 301},v1=${sign(body, t + 301)}`, SECRET, NOW)).toBe(false);
  });
  it("recusa cabeçalho ausente/mal formado/segredo vazio/hex curto", () => {
    expect(verifyStripeSignature(body, undefined, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(body, "lixo", SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=abc`, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=${sign(body, t)}`, "", NOW)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},v1=${sign(body, t)}`, undefined, NOW)).toBe(false);
  });
});

describe("formEncode", () => {
  it("usa colchetes para objetos e arrays", () => {
    const s = formEncode({ mode: "subscription", line_items: [{ price: "price_1", quantity: 1 }], subscription_data: { metadata: { profile_id: "u" } } });
    const p = new URLSearchParams(s);
    expect(p.get("mode")).toBe("subscription");
    expect(p.get("line_items[0][price]")).toBe("price_1");
    expect(p.get("line_items[0][quantity]")).toBe("1");
    expect(p.get("subscription_data[metadata][profile_id]")).toBe("u");
  });
  it("ignora undefined/null e escapa valores", () => {
    const p = new URLSearchParams(formEncode({ a: undefined, b: null, c: "x y&z=1" }));
    expect([...p.keys()]).toEqual(["c"]);
    expect(p.get("c")).toBe("x y&z=1");
  });
});

describe("checkoutParams", () => {
  const base = { priceId: "price_1", profileId: "11111111-1111-1111-1111-111111111111", siteUrl: "https://www.ophiel.es" };
  it("monta assinatura mensal com metadata e URLs fixas do site", () => {
    const o = checkoutParams({ ...base, email: "a@b.es" });
    expect(o.mode).toBe("subscription");
    expect(o.line_items).toEqual([{ price: "price_1", quantity: 1 }]);
    expect(o.client_reference_id).toBe(base.profileId);
    expect(o.subscription_data.metadata.profile_id).toBe(base.profileId);
    expect(o.success_url).toBe("https://www.ophiel.es/painel?pago=1");
    expect(o.cancel_url).toBe("https://www.ophiel.es/painel?pago=0");
    expect(o.customer_email).toBe("a@b.es");
    expect(o.customer).toBeUndefined();
  });
  it("reutiliza o customer (sem customer_email) quando já existe", () => {
    const o = checkoutParams({ ...base, email: "a@b.es", customerId: "cus_1" });
    expect(o.customer).toBe("cus_1");
    expect(o.customer_email).toBeUndefined();
  });
  it("automatic_tax só quando pedido", () => {
    expect(checkoutParams(base).automatic_tax).toBeUndefined();
    expect(checkoutParams({ ...base, automaticTax: true }).automatic_tax).toEqual({ enabled: true });
  });
});

describe("portalParams", () => {
  it("customer + return_url no painel", () => {
    expect(portalParams({ customerId: "cus_1", siteUrl: "https://www.ophiel.es" })).toEqual({ customer: "cus_1", return_url: "https://www.ophiel.es/painel" });
  });
});

describe("subscriptionRow", () => {
  const end = 1_900_000_000;
  const sub = { id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false, current_period_end: end, metadata: { profile_id: "p1" } };
  it("converte para a linha da tabela", () => {
    expect(subscriptionRow(sub, "p1", NOW)).toEqual({
      profile_id: "p1", status: "active", current_period_end: new Date(end * 1000).toISOString(),
      cancel_at_period_end: false, stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1", updated_at: new Date(NOW).toISOString(),
    });
  });
  it("lê current_period_end do item (API nova) e customer como objeto", () => {
    const s = { ...sub, current_period_end: undefined, customer: { id: "cus_9" }, items: { data: [{ current_period_end: end }] } };
    const r = subscriptionRow(s, "p1", NOW);
    expect(r.current_period_end).toBe(new Date(end * 1000).toISOString());
    expect(r.stripe_customer_id).toBe("cus_9");
  });
  it("sem data de fim ou sem profile → null", () => {
    expect(subscriptionRow({ ...sub, current_period_end: undefined }, "p1", NOW)).toBeNull();
    expect(subscriptionRow(sub, "", NOW)).toBeNull();
    expect(subscriptionRow(null, "p1", NOW)).toBeNull();
  });
  it("cancelamento no fim do período é preservado", () => {
    expect(subscriptionRow({ ...sub, cancel_at_period_end: true }, "p1", NOW).cancel_at_period_end).toBe(true);
  });
});

describe("bearerToken", () => {
  it("extrai o token", () => {
    expect(bearerToken({ authorization: "Bearer abc.def.ghi" })).toBe("abc.def.ghi");
    expect(bearerToken({ authorization: "bearer abc" })).toBe("abc");
  });
  it("recusa ausente/mal formado", () => {
    expect(bearerToken({})).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken({ authorization: "Basic xx" })).toBeNull();
    expect(bearerToken({ authorization: "Bearer " })).toBeNull();
  });
});
