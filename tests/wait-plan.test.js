import { describe, it, expect, vi } from "vitest";
import { waitForPlan, billingErrorText } from "../lib/wait-plan.js";

describe("waitForPlan", () => {
  it("devolve os dados assim que o plano vira personalizado", async () => {
    const seq = [{ plan: "free" }, { plan: "free" }, { plan: "personalizado", n: 3 }];
    const load = vi.fn(async () => seq.shift());
    const sleep = vi.fn(async () => {});
    expect(await waitForPlan(load, { tries: 8, sleep })).toEqual({ plan: "personalizado", n: 3 });
    expect(load).toHaveBeenCalledTimes(3); expect(sleep).toHaveBeenCalledTimes(2);
  });
  it("desiste depois de N tentativas e devolve null", async () => {
    const load = vi.fn(async () => ({ plan: "free" }));
    expect(await waitForPlan(load, { tries: 4, sleep: async () => {} })).toBeNull();
    expect(load).toHaveBeenCalledTimes(4);
  });
  it("erro de leitura não derruba: tenta de novo", async () => {
    let n = 0;
    const load = async () => { if (n++ === 0) throw new Error("rede"); return { plan: "personalizado" }; };
    expect(await waitForPlan(load, { tries: 3, sleep: async () => {} })).toEqual({ plan: "personalizado" });
  });
});

describe("billingErrorText", () => {
  it("mensagens em español por código", () => {
    expect(billingErrorText("ya_activo")).toMatch(/ya tienes/i);
    expect(billingErrorText("sin_cliente")).toMatch(/suscripci/i);
    expect(billingErrorText("auth")).toMatch(/sesión/i);
    expect(billingErrorText("stripe")).toMatch(/inténtalo/i);
    expect(billingErrorText(undefined)).toMatch(/inténtalo/i);
  });
});
