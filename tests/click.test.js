import { describe, it, expect, vi } from "vitest";
import { createHandler } from "../api/click.js";

const ID = "123e4567-e89b-42d3-a456-426614174000";
function fakeRes() {
  const r = { statusCode: 0, headers: {}, body: undefined };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.end = (b) => { r.body = b; };
  return r;
}
const call = async (req, track = vi.fn().mockResolvedValue()) => {
  const res = fakeRes();
  await createHandler({ track })(req, res);
  return { res, track };
};
const post = (body, headers = {}) => ({ method: "POST", headers, body });

describe("api/click", () => {
  it("POST com UUID → conta 1 clique e responde 204 sem cache", async () => {
    const { res, track } = await call(post({ l: ID }));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(ID);
    expect(res.statusCode).toBe(204);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
  it("aceita corpo em texto JSON (sendBeacon sem parser)", async () => {
    const { track } = await call(post(JSON.stringify({ l: ID })));
    expect(track).toHaveBeenCalledWith(ID);
  });
  it.each([["GET"], ["PUT"], ["DELETE"], ["HEAD"]])("%s → 405 e não conta", async (method) => {
    const { res, track } = await call({ method, headers: {}, body: { l: ID } });
    expect(res.statusCode).toBe(405);
    expect(res.headers["allow"]).toBe("POST");
    expect(track).not.toHaveBeenCalled();
  });
  it.each([
    ["l não é UUID", { l: "x" }],
    ["l ausente", {}],
    ["l número", { l: 5 }],
    ["l array", { l: [ID] }],
    ["l com lixo", { l: ID + "'; drop table links;--" }],
    ["corpo null", null],
    ["corpo texto solto", "oi"],
    ["JSON inválido", "{l:"],
    ["array", [ID]],
  ])("%s → 204 sem contar", async (_, body) => {
    const { res, track } = await call(post(body));
    expect(res.statusCode).toBe(204);
    expect(track).not.toHaveBeenCalled();
  });
  it("corpo enorme (content-length) → 204 sem contar nem ler", async () => {
    const { res, track } = await call(post({ l: ID }, { "content-length": "10240" }));
    expect(res.statusCode).toBe(204);
    expect(track).not.toHaveBeenCalled();
  });
  it("corpo em texto maior que 512 → 204 sem contar", async () => {
    const { track } = await call(post(JSON.stringify({ l: ID, x: "a".repeat(600) })));
    expect(track).not.toHaveBeenCalled();
  });
  it("erro do banco → ainda 204 e sem vazar nada", async () => {
    const { res } = await call(post({ l: ID }), vi.fn().mockRejectedValue(new Error("segredo123")));
    expect(res.statusCode).toBe(204);
    expect(String(res.body ?? "")).not.toContain("segredo123");
  });
  it("sem req.method / req vazio não quebra", async () => {
    const { res } = await call({});
    expect(res.statusCode).toBe(405);
  });
});
