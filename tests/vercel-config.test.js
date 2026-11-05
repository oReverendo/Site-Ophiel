import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

describe("vercel.json", () => {
  it("mantém cleanUrls e trailingSlash", () => {
    expect(cfg.cleanUrls).toBe(true);
    expect(cfg.trailingSlash).toBe(false);
  });
  it("tem o rewrite /all2/:usuario -> /api/pagina?u=:usuario", () => {
    expect(cfg.rewrites).toContainEqual({
      source: "/all2/:usuario",
      destination: "/api/pagina?u=:usuario",
    });
  });
  it("o rewrite do .vcf vem antes do rewrite genérico", () => {
    const src = cfg.rewrites.map((r) => r.source);
    expect(cfg.rewrites).toContainEqual({ source: "/all2/:usuario/contacto.vcf", destination: "/api/vcard?u=:usuario" });
    expect(src.indexOf("/all2/:usuario/contacto.vcf")).toBeLessThan(src.indexOf("/all2/:usuario"));
  });
  it("mantém os redirects /producto e /empresa", () => {
    const sources = cfg.redirects.map((r) => r.source);
    expect(sources).toContain("/producto");
    expect(sources).toContain("/empresa");
  });
  it("mantém o cache de /assets/(.*)", () => {
    const rule = cfg.headers.find((h) => h.source === "/assets/(.*)");
    expect(rule).toBeTruthy();
    expect(rule.headers[0].value).toContain("immutable");
  });
});

describe("páginas all2 existentes", () => {
  it("vercel.json não aplica cabeçalho a /all2/:usuario (não pode afetar os arquivos estáticos)", () => {
    expect(cfg.headers.find((h) => h.source.startsWith("/all2"))).toBeUndefined();
  });
});
