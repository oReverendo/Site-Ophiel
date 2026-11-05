import { describe, it, expect } from "vitest";
import { LINK_TYPES, buildHref } from "../lib/linktypes.js";

describe("LINK_TYPES", () => {
  it("tem as 8 redes do plano grátis", () => {
    expect(Object.keys(LINK_TYPES).sort()).toEqual(
      ["facebook", "google", "instagram", "phone", "tiktok", "website", "whatsapp", "youtube"]
    );
  });
  it("cada rede tem rótulo, cores e tipo de campo", () => {
    for (const t of Object.values(LINK_TYPES)) {
      expect(t.label).toBeTruthy();
      expect(["handle", "phone", "url"]).toContain(t.input);
      expect(t.bg).toBeTruthy();
    }
  });
  it("cores oficiais", () => {
    expect(LINK_TYPES.google.bg).toBe("#4285F4");
    expect(LINK_TYPES.whatsapp.bg).toBe("#25D366");
    expect(LINK_TYPES.facebook.bg).toBe("#1877F2");
  });
});

describe("buildHref", () => {
  it("instagram", () => {
    expect(buildHref("instagram", "@perfumeselixea")).toBe("https://www.instagram.com/perfumeselixea");
    expect(buildHref("instagram", "perfumeselixea")).toBe("https://www.instagram.com/perfumeselixea");
    expect(buildHref("instagram", "https://www.instagram.com/perfumeselixea/")).toBe("https://www.instagram.com/perfumeselixea");
  });
  it("tiktok", () => {
    expect(buildHref("tiktok", "@perfumes.elixea")).toBe("https://www.tiktok.com/@perfumes.elixea");
    expect(buildHref("tiktok", "https://www.tiktok.com/@perfumes.elixea?lang=es")).toBe("https://www.tiktok.com/@perfumes.elixea");
  });
  it("whatsapp", () => {
    expect(buildHref("whatsapp", "623 11 99 97")).toBe("https://wa.me/34623119997");
    expect(buildHref("whatsapp", "+34 623119997")).toBe("https://wa.me/34623119997");
  });
  it("phone", () => expect(buildHref("phone", "623119997")).toBe("tel:+34623119997"));
  it("website", () => {
    expect(buildHref("website", "perfumeselixea.com")).toBe("https://perfumeselixea.com/");
    expect(buildHref("website", "javascript:alert(1)")).toBeNull();
    expect(buildHref("website", "http://x.es")).toBeNull();
  });
  it("google", () => {
    expect(buildHref("google", "https://g.page/r/Ceu0EBuInQqDEAE/review")).toBe("https://g.page/r/Ceu0EBuInQqDEAE/review");
    expect(buildHref("google", "hola")).toBeNull();
  });
  it("vazio, espaços, tipo desconhecido e valor não-string", () => {
    expect(buildHref("facebook", "")).toBeNull();
    expect(buildHref("facebook", "   ")).toBeNull();
    expect(buildHref("nada", "x")).toBeNull();
    expect(buildHref("instagram", undefined)).toBeNull();
  });
  it("handle com caracteres perigosos é recusado", () => {
    expect(buildHref("instagram", "a/b?x=1")).toBeNull();
    expect(buildHref("instagram", "<script>")).toBeNull();
  });
});

describe("buildHref: tamanho máximo", () => {
  it("URL com mais de 500 caracteres é recusada (o banco também recusaria)", () => {
    expect(buildHref("website", "https://largo.es/" + "a".repeat(600))).toBeNull();
    expect(buildHref("website", "https://largo.es/" + "a".repeat(400))).not.toBeNull();
  });
});
