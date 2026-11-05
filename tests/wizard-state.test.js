import { describe, it, expect } from "vitest";
import { initialState, toggleNetwork, setValue, addExtra, removeExtra, setField, toPayload } from "../lib/wizard-state.js";

const pick = (types) => types.reduce((s, t) => toggleNetwork(s, t), initialState());

describe("wizard-state", () => {
  it("marcar 5 redes e tentar a 6ª mantém 5 e avisa", () => {
    const s = pick(["instagram", "whatsapp", "tiktok", "facebook", "website"]);
    expect(s.selected).toHaveLength(5);
    const s6 = toggleNetwork(s, "youtube");
    expect(s6.selected).toHaveLength(5);
    expect(s6.selected).not.toContain("youtube");
    expect(s6.notice).toBe("limite");
  });
  it("desmarcar libera espaço, limpa o valor e o aviso", () => {
    let s = setValue(pick(["instagram", "whatsapp", "tiktok", "facebook", "website"]), "tiktok", "@x");
    s = toggleNetwork(s, "tiktok");
    expect(s.selected).not.toContain("tiktok");
    expect(s.values.tiktok).toBeUndefined();
    expect(s.notice).toBeNull();
    expect(toggleNetwork(s, "youtube").selected).toContain("youtube");
  });
  it("links extras contam no limite", () => {
    let s = pick(["instagram", "whatsapp", "tiktok", "facebook"]);
    s = addExtra(s, "https://extra.es");
    expect(s.extras).toHaveLength(1);
    const s2 = addExtra(s, "https://outro.es");
    expect(s2.extras).toHaveLength(1);
    expect(s2.notice).toBe("limite");
    expect(toggleNetwork(s, "youtube").selected).toHaveLength(4);
  });
  it("removeExtra tira o extra e libera espaço", () => {
    let s = addExtra(initialState(), "https://a.es");
    s = removeExtra(s, 0);
    expect(s.extras).toEqual([]);
  });
  it("não muta o estado anterior", () => {
    const s0 = initialState();
    toggleNetwork(s0, "instagram");
    expect(s0.selected).toEqual([]);
  });
  it("toPayload: Instagram, WhatsApp e TikTok vazio → 2 links em ordem", () => {
    let s = pick(["instagram", "whatsapp", "tiktok"]);
    s = setValue(s, "instagram", "@x");
    s = setValue(s, "whatsapp", "623119997");
    s = setValue(s, "tiktok", "");
    s = setField(setField(s, "username", "ana"), "name", "Ana");
    const { profile, links } = toPayload(s, "uid-1");
    expect(links).toEqual([
      { profile_id: "uid-1", type: "instagram", url: "https://www.instagram.com/x", position: 0 },
      { profile_id: "uid-1", type: "whatsapp", url: "https://wa.me/34623119997", position: 1 },
    ]);
    expect(profile).toMatchObject({ id: "uid-1", username: "ana", name: "Ana" });
  });
  it("toPayload inclui extras válidos e descarta inválidos; nunca passa de 5", () => {
    let s = pick(["instagram", "whatsapp", "tiktok", "facebook"]);
    for (const t of s.selected) s = setValue(s, t, t === "whatsapp" ? "623119997" : t === "facebook" ? "facebook.com/x" : "@x");
    s = addExtra(s, "perfumeselixea.com");
    const out = toPayload(s, "u").links;
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out.at(-1)).toMatchObject({ type: "website", url: "https://perfumeselixea.com/", position: 4 });
    expect(toPayload(addExtra(initialState(), "javascript:alert(1)"), "u").links).toEqual([]);
  });
  it("toPayload do estado inicial usa as cores padrão e descrição vazia", () => {
    const { profile } = toPayload(initialState(), "u");
    expect(profile.bg_color).toBe("#0b131c");
    expect(profile.btn_color).toBe("#d9bd8a");
    expect(profile.bio).toBe("");
    expect(profile.avatar_url).toBeNull();
  });
  it("setField limita a descrição a 160 caracteres", () => {
    expect(setField(initialState(), "bio", "x".repeat(300)).bio).toHaveLength(160);
  });
});
