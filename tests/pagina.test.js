import { describe, it, expect, vi } from "vitest";
import { createHandler } from "../api/pagina.js";

function fakeRes() {
  const r = { statusCode: 200, headers: {}, body: "" };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.end = (b) => { r.body = b ?? ""; };
  return r;
}
const found = { profile: { username: "ana", name: "Ana Perfumes", bio: "hola", avatar_url: null, bg_color: "#112233", btn_color: "#d9bd8a" }, links: [] };

describe("api/pagina", () => {
  it("usuário existente → 200 com cabeçalhos certos", async () => {
    const getProfile = vi.fn().mockResolvedValue(found);
    const res = fakeRes();
    await createHandler({ getProfile })({ query: { u: "ana" } }, res);
    expect(getProfile).toHaveBeenCalledWith("ana");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(res.headers["cache-control"]).toBe("s-maxage=60, stale-while-revalidate=300");
    expect(res.headers["x-robots-tag"]).toBe("noindex");
    expect(res.body).toContain("Ana Perfumes");
  });
  it("repassa o plano do banco para o desenho da página", async () => {
    const links = [{ id: "1", type: "instagram", url: "https://www.instagram.com/ana", position: 0 }];
    const gratis = fakeRes(), pago = fakeRes();
    await createHandler({ getProfile: async () => ({ plan: "free", profile: found.profile, links }) })({ query: { u: "ana" } }, gratis);
    await createHandler({ getProfile: async () => ({ plan: "personalizado", profile: found.profile, links }) })({ query: { u: "ana" } }, pago);
    expect(gratis.body).not.toContain('class="ico"');
    expect(pago.body).toContain('class="ico"');
  });
  it("sem plano no retorno → grátis", async () => {
    const res = fakeRes();
    await createHandler({ getProfile: async () => ({ profile: found.profile, links: [{ type: "instagram", url: "https://www.instagram.com/ana", position: 0 }] }) })({ query: { u: "ana" } }, res);
    expect(res.body).not.toContain('class="ico"');
  });
  it("inexistente → 404 amigável", async () => {
    const res = fakeRes();
    await createHandler({ getProfile: vi.fn().mockResolvedValue(null) })({ query: { u: "nao-existe-123" } }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain("Esta página no existe");
    expect(res.headers["x-robots-tag"]).toBe("noindex");
  });
  it.each([["Maria"], [""], ["../x"], [undefined], [["a", "b"]], ["ana%00"]])("usuário inválido %j → 404 sem consultar o banco", async (u) => {
    const getProfile = vi.fn();
    const res = fakeRes();
    await createHandler({ getProfile })({ query: { u } }, res);
    expect(res.statusCode).toBe(404);
    expect(getProfile).not.toHaveBeenCalled();
  });
  it("sem req.query também dá 404", async () => {
    const res = fakeRes();
    await createHandler({ getProfile: vi.fn() })({}, res);
    expect(res.statusCode).toBe(404);
  });
  it("erro do banco → 500 genérico, sem vazar a mensagem", async () => {
    const res = fakeRes();
    await createHandler({ getProfile: vi.fn().mockRejectedValue(new Error("senha do banco: segredo123")) })({ query: { u: "ana" } }, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("segredo123");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

import { makeGetProfile } from "../api/pagina.js";
import { makeGetProfile as makeGetProfileLib } from "../lib/get-page.js";

describe("makeGetProfile (lê pela função get_page, nunca direto das tabelas)", () => {
  it("chama a RPC get_page com o usuário e devolve perfil + links", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { profile: { username: "ana" }, links: [{ type: "website" }] }, error: null });
    const out = await makeGetProfile({ rpc })("ana");
    expect(rpc).toHaveBeenCalledWith("get_page", { p_username: "ana" });
    expect(out).toEqual({ plan: "free", profile: { username: "ana" }, links: [{ type: "website" }] });
  });
  it("repassa o plano personalizado e trata plano desconhecido como grátis", async () => {
    const mk = (plan) => makeGetProfile({ rpc: async () => ({ data: { plan, profile: {}, links: [] }, error: null }) })("ana");
    expect((await mk("personalizado")).plan).toBe("personalizado");
    expect((await mk("gold")).plan).toBe("free");
    expect((await mk(undefined)).plan).toBe("free");
  });
  it("api/pagina.js reexporta o mesmo makeGetProfile de lib/get-page.js", () => {
    expect(makeGetProfile).toBe(makeGetProfileLib);
  });
  it("null quando a página não existe", async () => {
    expect(await makeGetProfile({ rpc: async () => ({ data: null, error: null }) })("ana")).toBeNull();
  });
  it("propaga o erro do banco", async () => {
    await expect(makeGetProfile({ rpc: async () => ({ data: null, error: new Error("boom") }) })("ana")).rejects.toThrow("boom");
  });
});
