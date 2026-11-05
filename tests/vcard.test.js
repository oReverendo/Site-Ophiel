import { describe, it, expect, vi } from "vitest";
import { buildVcard } from "../lib/vcard.js";
import { createHandler } from "../api/vcard.js";

const profile = { username: "pepe", name: "Bar Pepe", address: "Calle Mayor 1, Almería", timezone: "Europe/Madrid", show_vcard: true };
const links = [
  { type: "instagram", url: "https://www.instagram.com/barpepe", position: 0 },
  { type: "phone", url: "tel:+34600111222", position: 1 },
  { type: "website", url: "https://barpepe.example/", position: 2 },
];
const lines = (v) => v.split("\r\n");
const unfold = (v) => v.replace(/\r\n /g, "");

describe("buildVcard", () => {
  const v = buildVcard({ profile, links });
  it("cartão 3.0 com linhas CRLF e campos principais", () => {
    expect(v.endsWith("\r\n")).toBe(true);
    const l = lines(v);
    expect(l[0]).toBe("BEGIN:VCARD");
    expect(l[1]).toBe("VERSION:3.0");
    expect(l).toContain("FN:Bar Pepe");
    expect(l).toContain("N:;Bar Pepe;;;");
    expect(l).toContain("ORG:Bar Pepe");
    expect(l).toContain("TEL;TYPE=CELL:+34600111222");
    expect(l).toContain("URL:https://barpepe.example/");
    expect(l).toContain("ADR;TYPE=WORK:;;Calle Mayor 1\\, Almería;;;;");
    expect(l[l.length - 2]).toBe("END:VCARD");
  });
  it("telefone vem do WhatsApp se não há telefone", () => {
    const w = buildVcard({ profile, links: [{ type: "whatsapp", url: "https://wa.me/34611222333", position: 0 }] });
    expect(lines(w)).toContain("TEL;TYPE=CELL:+34611222333");
  });
  it("sem telefone/site/endereço, essas linhas não aparecem", () => {
    const x = buildVcard({ profile: { username: "x", name: "X" }, links: [] });
    expect(x).not.toMatch(/TEL|URL|ADR/);
  });
  it("sem nome usa o usuário", () => {
    expect(lines(buildVcard({ profile: { username: "pepe", name: "  " }, links: [] }))).toContain("FN:pepe");
  });
  it("quebra de linha no nome não injeta linhas no cartão", () => {
    const h = buildVcard({ profile: { username: "x", name: "A\r\nEND:VCARD\r\nBEGIN:VCARD\r\nTEL:+34999" }, links: [] });
    const l = lines(h);
    expect(l.filter((x) => x === "BEGIN:VCARD")).toHaveLength(1);
    expect(l.filter((x) => x === "END:VCARD")).toHaveLength(1);
    expect(h).not.toMatch(/\r\nTEL:\+34999/);
    expect(l[2]).toContain("A\\nEND:VCARD\\nBEGIN:VCARD");
  });
  it("escapa ; , e \\ no endereço", () => {
    const h = buildVcard({ profile: { username: "x", name: "X", address: "a;b,c\\d" }, links: [] });
    expect(lines(h)).toContain("ADR;TYPE=WORK:;;a\\;b\\,c\\\\d;;;;");
  });
  it("; no nome não vira separador de campo", () => {
    const l = lines(buildVcard({ profile: { username: "x", name: "Bar; Pepe, S.L." }, links: [] }));
    expect(l).toContain("FN:Bar\\; Pepe\\, S.L.");
    expect(l).toContain("N:;Bar\\; Pepe\\, S.L.;;;");
  });
  it("esquemas perigosos no site são ignorados", () => {
    const h = buildVcard({ profile: { username: "x", name: "X" }, links: [{ type: "website", url: "javascript:alert(1)", position: 0 }] });
    expect(h).not.toContain("URL:");
  });
  it("dobra linhas longas a 75 octetos sem quebrar caracteres e sem perder texto", () => {
    const nome = "Ñandú ".repeat(40).trim();
    const h = buildVcard({ profile: { username: "x", name: nome }, links: [] });
    for (const l of lines(h)) expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
    expect(lines(unfold(h))).toContain("FN:" + nome);
  });
});

function fakeRes() {
  const r = { statusCode: 200, headers: {}, body: "" };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.end = (b) => { r.body = b ?? ""; };
  return r;
}
const pago = { plan: "personalizado", profile, links };

describe("api/vcard", () => {
  it("pago com show_vcard → 200 com cabeçalhos de download", async () => {
    const res = fakeRes();
    await createHandler({ getProfile: async () => pago })({ query: { u: "pepe" } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/vcard; charset=utf-8");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="pepe.vcf"');
    expect(res.headers["cache-control"]).toBe("s-maxage=60");
    expect(res.body).toContain("BEGIN:VCARD");
  });
  it("grátis → 404", async () => {
    const res = fakeRes();
    await createHandler({ getProfile: async () => ({ ...pago, plan: "free" }) })({ query: { u: "pepe" } }, res);
    expect(res.statusCode).toBe(404);
  });
  it("show_vcard desligado → 404", async () => {
    const res = fakeRes();
    await createHandler({ getProfile: async () => ({ ...pago, profile: { ...profile, show_vcard: false } }) })({ query: { u: "pepe" } }, res);
    expect(res.statusCode).toBe(404);
  });
  it("perfil inexistente → 404", async () => {
    const res = fakeRes();
    await createHandler({ getProfile: async () => null })({ query: { u: "pepe" } }, res);
    expect(res.statusCode).toBe(404);
  });
  it.each([["Maria"], [""], ["../x"], [undefined], [["a", "b"]]])("usuário inválido %j → 404 sem consultar o banco", async (u) => {
    const getProfile = vi.fn();
    const res = fakeRes();
    await createHandler({ getProfile })({ query: { u } }, res);
    expect(res.statusCode).toBe(404);
    expect(getProfile).not.toHaveBeenCalled();
  });
  it("erro do banco → 500 genérico", async () => {
    const res = fakeRes();
    await createHandler({ getProfile: async () => { throw new Error("segredo123"); } })({ query: { u: "pepe" } }, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("segredo123");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
