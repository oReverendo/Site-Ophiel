import { describe, it, expect } from "vitest";
import { fromServer, setProfileField, setLinkStyle, addLink, updateLink, moveLink, removeLink, toSavePayload, isDirty, displayValue } from "../lib/panel-state.js";

const U = (n) => `123e4567-e89b-42d3-a456-42661417400${n}`;
const profile = { username: "pepe", name: "Pepe", bio: "hola", avatar_url: null, bg_color: "#112233", btn_color: "#d9bd8a",
  bg_image_url: null, bg_blur: 0, address: null, hours: null, timezone: "Europe/Madrid", show_vcard: false };
const mkLinks = (n) => Array.from({ length: n }, (_, i) => ({ id: U(i), type: "website", url: `https://ex${i}.es/`, label: null, position: i, style: {} }));
const free = (n = 2) => fromServer({ profile, links: mkLinks(n), plan: "free" });
const paid = (n = 2) => fromServer({ profile, links: mkLinks(n), plan: "personalizado" });

describe("fromServer", () => {
  it("ordena por position, não marca nada como alterado e conta escondidos no grátis", () => {
    const s = fromServer({ profile, links: mkLinks(7).reverse(), plan: "free" });
    expect(s.links.map((l) => l.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(s.hiddenCount).toBe(2);
    expect(isDirty(s)).toBe(false);
    expect(paid(7).hiddenCount).toBe(0);
  });
  it("plano desconhecido vira grátis", () => {
    expect(fromServer({ profile, links: [], plan: "gold" }).plan).toBe("free");
  });
});

describe("setProfileField", () => {
  it("grátis edita campos livres", () => {
    const s = setProfileField(free(), "name", "Bar Pepe");
    expect(s.profile.name).toBe("Bar Pepe");
    expect(s.notice).toBeNull();
    expect(isDirty(s)).toBe(true);
  });
  it.each([["bg_blur", 50], ["address", "Calle 1"], ["hours", { mon: [["09:00", "14:00"]] }], ["show_vcard", true], ["timezone", "Europe/Madrid"],
    ["bg_image_url", "https://abc.supabase.co/storage/v1/object/public/backgrounds/u/bg.jpg"]])("grátis NÃO edita %s (notice plan)", (k, v) => {
    const before = free();
    const s = setProfileField(before, k, v);
    expect(s.profile[k]).toEqual(before.profile[k]);
    expect(s.notice).toBe("plan");
    expect(isDirty(s)).toBe(false);
  });
  it("pago clampa o desfoque em 0..100 e recusa não numérico", () => {
    expect(setProfileField(paid(), "bg_blur", 120).profile.bg_blur).toBe(100);
    expect(setProfileField(paid(), "bg_blur", -4).profile.bg_blur).toBe(0);
    expect(setProfileField(paid(), "bg_blur", "37").profile.bg_blur).toBe(37);
    const bad = setProfileField(paid(), "bg_blur", "muito");
    expect(bad.profile.bg_blur).toBe(0);
    expect(bad.notice).toBe("valor");
  });
  it("pago valida o horário", () => {
    const ok = setProfileField(paid(), "hours", { mon: [["09:00", "14:00"]], foo: 1 });
    expect(ok.profile.hours).toEqual({ mon: [["09:00", "14:00"]] });
    const bad = setProfileField(paid(), "hours", { mon: [["25:00", "14:00"]] });
    expect(bad.profile.hours).toBeNull();
    expect(bad.notice).toBe("horario");
    expect(setProfileField(paid(), "hours", {}).profile.hours).toBeNull();
  });
  it("limites do banco: nome 80, bio 160, endereço 200", () => {
    expect(setProfileField(free(), "name", "x".repeat(81)).notice).toBe("largo");
    expect(setProfileField(free(), "bio", "x".repeat(161)).notice).toBe("largo");
    expect(setProfileField(paid(), "address", "x".repeat(201)).notice).toBe("largo");
    expect(setProfileField(free(), "name", "x".repeat(80)).profile.name).toHaveLength(80);
  });
  it("endereço vazio vira null", () => {
    expect(setProfileField(paid(), "address", "   ").profile.address).toBeNull();
  });
  it("cores só em #rgb/#rrggbb", () => {
    expect(setProfileField(free(), "bg_color", "#abc").profile.bg_color).toBe("#abc");
    const bad = setProfileField(free(), "btn_color", "red");
    expect(bad.profile.btn_color).toBe("#d9bd8a");
    expect(bad.notice).toBe("valor");
  });
  it("campos que não existem ou não podem mudar (username) são ignorados", () => {
    const s = setProfileField(paid(), "username", "outro");
    expect(s.profile.username).toBe("pepe");
    expect(s.notice).toBe("campo");
    expect(setProfileField(paid(), "id", "x").notice).toBe("campo");
  });
  it("é imutável", () => {
    const a = free();
    setProfileField(a, "name", "Novo");
    expect(a.profile.name).toBe("Pepe");
  });
});

describe("cor única dos botões e logo sem recorte", () => {
  it.each([["btn_style", "color"], ["avatar_shape", "logo"], ["avatar_shape", "logo_only"]])("grátis NÃO muda %s (notice plan)", (k, v) => {
    const s = setProfileField(free(), k, v);
    expect(s.notice).toBe("plan");
    expect(isDirty(s)).toBe(false);
  });
  it("pago muda e envia só o que mudou", () => {
    const s = setProfileField(setProfileField(paid(), "btn_style", "color"), "avatar_shape", "logo");
    expect(s.profile.btn_style).toBe("color");
    expect(toSavePayload(s).profile).toEqual({ btn_style: "color", avatar_shape: "logo" });
  });
  it("valores desconhecidos são recusados", () => {
    expect(setProfileField(paid(), "btn_style", "neon").notice).toBe("valor");
    expect(setProfileField(paid(), "avatar_shape", "quadrado").notice).toBe("valor");
  });
  it("grátis forjado não vaza btn_style/avatar_shape no payload", () => {
    const forjado = { ...paid(), plan: "free", profile: { ...paid().profile, btn_style: "color", avatar_shape: "logo" } };
    expect(toSavePayload(forjado).profile).toEqual({});
  });
});

describe("links", () => {
  it("addLink monta o href como o assistente e põe no fim", () => {
    const s = addLink(free(2), { type: "instagram", value: "@barpepe" });
    expect(s.links).toHaveLength(3);
    const l = s.links[2];
    expect(l.url).toBe("https://www.instagram.com/barpepe");
    expect(l.position).toBe(2);
    expect(l.id).toMatch(/^new-/);
  });
  it("addLink recusa valor inválido e tipo desconhecido", () => {
    expect(addLink(free(), { type: "instagram", value: "!!" }).notice).toBe("valor");
    expect(addLink(free(), { type: "zzz", value: "x" }).notice).toBe("valor");
    expect(addLink(free(), { type: "website", value: "javascript:alert(1)" }).links).toHaveLength(2);
  });
  it("grátis: 6º link recusado; com 7 guardados também recusa", () => {
    expect(addLink(free(5), { type: "website", value: "https://a.es" }).notice).toBe("limite");
    const s = addLink(free(7), { type: "website", value: "https://a.es" });
    expect(s.notice).toBe("limite");
    expect(s.links).toHaveLength(7);
  });
  it("pago passa de 5", () => {
    expect(addLink(paid(8), { type: "website", value: "https://a.es", label: "Carta" }).links).toHaveLength(9);
  });
  it("label livre só para sites; é cortado em 40", () => {
    const s = addLink(paid(), { type: "website", value: "https://a.es", label: "x".repeat(50) });
    expect(s.links[2].label).toHaveLength(40);
  });
  it("rótulo em redes com marca: só no pago", () => {
    expect(addLink(free(), { type: "instagram", value: "@a", label: "Síguenos" }).links[2].label).toBeNull();
    expect(addLink(paid(), { type: "instagram", value: "@a", label: "Síguenos" }).links[2].label).toBe("Síguenos");
  });
  it("updateLink refaz o href e guarda o rótulo", () => {
    const s = updateLink(free(), U(0), { value: "https://novo.es", label: "Novo" });
    expect(s.links[0].url).toBe("https://novo.es/");
    expect(s.links[0].label).toBe("Novo");
    expect(updateLink(free(), U(0), { value: "javascript:x" }).notice).toBe("valor");
  });
  it("moveLink troca vizinhos e reescreve position contíguo; nas pontas não faz nada", () => {
    const s = moveLink(free(3), U(0), "down");
    expect(s.links.map((l) => l.id)).toEqual([U(1), U(0), U(2)]);
    expect(s.links.map((l) => l.position)).toEqual([0, 1, 2]);
    expect(moveLink(free(3), U(0), "up").links.map((l) => l.id)).toEqual([U(0), U(1), U(2)]);
    expect(moveLink(free(3), U(2), "down").links.map((l) => l.id)).toEqual([U(0), U(1), U(2)]);
  });
  it("removeLink: guardado vai para deletes; novo some sem deixar rastro", () => {
    const a = removeLink(free(3), U(1));
    expect(a.links.map((l) => l.position)).toEqual([0, 1]);
    expect(toSavePayload(a).deletes).toEqual([U(1)]);
    const b = removeLink(addLink(free(2), { type: "website", value: "https://a.es" }), addLink(free(2), { type: "website", value: "https://a.es" }).links[2].id);
    expect(b.links).toHaveLength(2);
  });
  it("estilo: grátis recusa; pago saneia e guarda", () => {
    const g = setLinkStyle(free(), U(0), { color: "#ff0000" });
    expect(g.notice).toBe("plan");
    expect(g.links[0].style).toEqual({});
    const p = setLinkStyle(paid(), U(0), { color: "#FF0000", glow: false, featured: true, hack: "x", extra: { a: 1 } });
    expect(p.links[0].style).toEqual({ color: "#ff0000", glow: false, featured: true });
    expect(setLinkStyle(paid(), U(0), { color: "red;" }).links[0].style).toEqual({});
  });
});

describe("displayValue (o que a pessoa vê ao editar)", () => {
  it.each([
    [{ type: "phone", url: "tel:+34600111222" }, "600111222"],
    [{ type: "whatsapp", url: "https://wa.me/34600111222" }, "600111222"],
    [{ type: "instagram", url: "https://www.instagram.com/barpepe" }, "@barpepe"],
    [{ type: "tiktok", url: "https://www.tiktok.com/@barpepe" }, "@barpepe"],
    [{ type: "website", url: "https://a.es/" }, "https://a.es/"],
  ])("%j → %s", (l, v) => expect(displayValue(l)).toBe(v));
  it("editar sem mexer no valor não refaz o href (whatsapp continua válido)", () => {
    const s0 = fromServer({ profile, plan: "free", links: [{ id: U(0), type: "whatsapp", url: "https://wa.me/34600111222", position: 0 }] });
    const s = updateLink(s0, U(0), { value: displayValue(s0.links[0]), label: "Reservas" });
    expect(s.notice).toBeNull();
    expect(s.links[0].url).toBe("https://wa.me/34600111222");
    expect(s.links[0].label).toBe("Reservas");
  });
});

describe("toSavePayload", () => {
  it("sem mudanças → payload vazio", () => {
    expect(toSavePayload(free())).toEqual({ profile: {}, inserts: [], updates: [], deletes: [] });
  });
  it("só envia os campos de perfil alterados e nunca o username", () => {
    const s = setProfileField(setProfileField(free(), "name", "Novo"), "bg_color", "#000000");
    expect(toSavePayload(s).profile).toEqual({ name: "Novo", bg_color: "#000000" });
  });
  it("pago envia campos pagos alterados", () => {
    const s = setProfileField(setProfileField(paid(), "bg_blur", 60), "show_vcard", true);
    expect(toSavePayload(s).profile).toEqual({ bg_blur: 60, show_vcard: true });
  });
  it("inserts não levam id temporário; grátis nunca envia style", () => {
    const s = addLink(free(2), { type: "instagram", value: "barpepe" });
    const p = toSavePayload(s);
    expect(p.inserts).toEqual([{ type: "instagram", url: "https://www.instagram.com/barpepe", label: null, position: 2 }]);
    expect("style" in p.inserts[0]).toBe(false);
  });
  it("pago: insert leva style", () => {
    const s = setLinkStyle(addLink(paid(2), { type: "website", value: "https://a.es" }), "new-1", { featured: true });
    expect(toSavePayload(s).inserts[0].style).toEqual({ featured: true });
  });
  it("updates só dos links que mudaram (evita tocar em links escondidos)", () => {
    const s = updateLink(free(7), U(1), { label: "Carta" });
    const p = toSavePayload(s);
    expect(p.updates).toEqual([{ id: U(1), label: "Carta" }]);
  });
  it("reordenar gera updates só de position", () => {
    const p = toSavePayload(moveLink(free(3), U(0), "down"));
    expect(p.updates).toEqual([{ id: U(1), position: 0 }, { id: U(0), position: 1 }]);
  });
  it("estilo alterado no pago gera update de style", () => {
    const p = toSavePayload(setLinkStyle(paid(), U(0), { glow: false }));
    expect(p.updates).toEqual([{ id: U(0), style: { glow: false } }]);
  });
  it("campos pagos alterados e depois o plano some (estado de grátis forjado) não vazam", () => {
    const forjado = { ...paid(), plan: "free", profile: { ...paid().profile, bg_blur: 80, name: "Otro" } };
    expect(toSavePayload(forjado).profile).toEqual({ name: "Otro" });
  });
});

describe("fase 2.5: ajustes do logo, anel e mapa", () => {
  it.each(["logo_size", "logo_x", "logo_y", "show_ring", "show_map"])("grátis NÃO muda %s (notice plan)", (k) => {
    expect(setProfileField(free(), k, k.startsWith("show") ? false : 50).notice).toBe("plan");
  });
  it("pago arredonda e limita nas faixas do banco", () => {
    const set = (k, v) => setProfileField(paid(), k, v).profile[k];
    expect(set("logo_size", 500)).toBe(100);
    expect(set("logo_size", 3)).toBe(30);
    expect(set("logo_x", "-999")).toBe(-100);
    expect(set("logo_x", 12.6)).toBe(13);
    expect(set("logo_y", 999)).toBe(60);
    expect(set("logo_y", -999)).toBe(-30);
  });
  it.each([["abc"], [""], [null], [Number.NaN], [{}]])("valor inválido %o é recusado", (v) => {
    expect(setProfileField(paid(), "logo_size", v).notice).toBe("valor");
  });
  it("show_ring/show_map só viram true com true de verdade", () => {
    expect(setProfileField(paid(), "show_ring", "true").profile.show_ring).toBe(false);
    expect(setProfileField(paid(), "show_map", true).profile.show_map).toBe(true);
  });
  it("o payload leva só o que mudou", () => {
    const s = setProfileField(setProfileField(paid(), "logo_size", 55), "show_map", false);
    expect(toSavePayload(s).profile).toEqual({ logo_size: 55, show_map: false });
  });
  it("grátis forjado não vaza os campos novos no payload", () => {
    const forjado = { ...paid(), plan: "free", profile: { ...paid().profile, logo_size: 40, logo_x: 5, show_ring: false } };
    expect(toSavePayload(forjado).profile).toEqual({});
  });
});
