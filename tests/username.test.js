import { describe, it, expect } from "vitest";
import { validateUsername } from "../lib/username.js";

describe("validateUsername", () => {
  it("aceita maria-cafe", () => expect(validateUsername("maria-cafe")).toEqual({ ok: true, value: "maria-cafe" }));
  it("recusa maiúscula", () => expect(validateUsername("Maria")).toEqual({ ok: false, reason: "caracteres" }));
  it("recusa curto", () => expect(validateUsername("ma")).toEqual({ ok: false, reason: "curto" }));
  it("recusa 31 letras", () => expect(validateUsername("a".repeat(31))).toEqual({ ok: false, reason: "largo" }));
  it("aceita 30 letras", () => expect(validateUsername("a".repeat(30)).ok).toBe(true));
  it("recusa hífen na borda", () => {
    expect(validateUsername("-maria")).toEqual({ ok: false, reason: "borde" });
    expect(validateUsername("maria-")).toEqual({ ok: false, reason: "borde" });
  });
  it("recusa acento e espaço", () => {
    expect(validateUsername("café")).toEqual({ ok: false, reason: "caracteres" });
    expect(validateUsername("ma ria")).toEqual({ ok: false, reason: "caracteres" });
  });
  it("recusa nome de um all2 existente", () => expect(validateUsername("cementoymas")).toEqual({ ok: false, reason: "reservado" }));
  it("recusa reservados fixos", () => {
    for (const n of ["nube", "admin", "placa"]) expect(validateUsername(n)).toEqual({ ok: false, reason: "reservado" });
  });
  it("apara espaços nas pontas", () => expect(validateUsername("  maria ")).toEqual({ ok: true, value: "maria" }));
  it("recusa ../x e vazio", () => {
    expect(validateUsername("../x").ok).toBe(false);
    expect(validateUsername("").ok).toBe(false);
    expect(validateUsername(undefined).ok).toBe(false);
  });
});

describe("nomes parecidos com clientes existentes", () => {
  it.each([["le-coquette"], ["lecoquette"], ["studio-hair-27"], ["studiohair27"], ["palladium-salsa-elejido"], ["mia-bella"], ["miabella"]])(
    "%s é reservado (variante de um all2 com _)", (n) => expect(validateUsername(n)).toEqual({ ok: false, reason: "reservado" })
  );
  it("um nome livre continua livre", () => expect(validateUsername("livre-123").ok).toBe(true));
});
