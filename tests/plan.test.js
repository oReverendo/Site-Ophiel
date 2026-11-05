import { describe, it, expect } from "vitest";
import { FREE_LINK_LIMIT, visibleLinks, canAddLink } from "../lib/plan.js";

describe("plano grátis", () => {
  it("limite é 5", () => expect(FREE_LINK_LIMIT).toBe(5));
  it("devolve 5 links ordenados por position", () => {
    const links = [6, 2, 0, 5, 1, 4, 3].map((p) => ({ type: "website", url: "https://x.es/" + p, position: p }));
    const out = visibleLinks(links, "free");
    expect(out.map((l) => l.position)).toEqual([0, 1, 2, 3, 4]);
  });
  it("não muta a lista original", () => {
    const links = [{ position: 2 }, { position: 1 }];
    visibleLinks(links, "free");
    expect(links[0].position).toBe(2);
  });
  it("canAddLink", () => {
    expect(canAddLink(4, "free")).toBe(true);
    expect(canAddLink(5, "free")).toBe(false);
  });
  it("lista vazia", () => expect(visibleLinks([], "free")).toEqual([]));
});

import { PAID_FEATURES, isLocked, planFromSubscription } from "../lib/plan.js";

describe("plano personalizado", () => {
  it("canAddLink: pago ilimitado; plano desconhecido conta como grátis", () => {
    expect(canAddLink(500, "personalizado")).toBe(true);
    expect(canAddLink(5, "qualquer-coisa")).toBe(false);
    expect(canAddLink(4, undefined)).toBe(true);
    expect(canAddLink(5, undefined)).toBe(false);
  });
  it("visibleLinks do pago devolve todos, em ordem", () => {
    const links = [3, 1, 0, 2, 5, 4, 6].map((p) => ({ position: p }));
    expect(visibleLinks(links, "personalizado").map((l) => l.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it("isLocked: tudo que é pago fica travado no grátis e livre no pago", () => {
    expect(PAID_FEATURES).toEqual(["bgImage", "linkStyle", "hours", "address", "vcard", "stats", "moreLinks", "btnStyle", "logo", "ring", "map"]);
    for (const f of PAID_FEATURES) {
      expect(isLocked(f, "free")).toBe(true);
      expect(isLocked(f, undefined)).toBe(true);
      expect(isLocked(f, "personalizado")).toBe(false);
    }
    expect(isLocked("tema", "free")).toBe(false);
  });
});

describe("planFromSubscription (espelha is_paid do banco)", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  const sub = (status, end) => ({ status, current_period_end: end });
  it.each([["active"], ["trialing"], ["past_due"]])("%s dentro do período → personalizado", (st) => {
    expect(planFromSubscription(sub(st, "2026-11-20T00:00:00Z"), now)).toBe("personalizado");
  });
  it("período vencido → grátis", () => {
    expect(planFromSubscription(sub("active", "2026-11-05T11:59:59Z"), now)).toBe("free");
    expect(planFromSubscription(sub("active", "2026-11-05T12:00:00Z"), now)).toBe("free");
  });
  it.each([["canceled"], ["unpaid"], ["incomplete"], [undefined]])("status %s → grátis", (st) => {
    expect(planFromSubscription(sub(st, "2026-11-20T00:00:00Z"), now)).toBe("free");
  });
  it.each([[null], [undefined], [{}], [sub("active", "lixo")], [sub("active", null)]])("sem dados confiáveis %j → grátis", (s) => {
    expect(planFromSubscription(s, now)).toBe("free");
  });
});
