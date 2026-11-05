import { describe, it, expect } from "vitest";
import { DAYS, openStatus, validateHours } from "../lib/hours.js";

const tienda = { mon: [["09:00", "14:00"], ["17:00", "20:00"]], tue: [["09:00", "14:00"]] };
const at = (iso) => new Date(iso);

describe("openStatus", () => {
  it("segunda 10:00 em Madrid (verão) está aberto", () => {
    expect(openStatus(tienda, "Europe/Madrid", at("2026-10-05T08:00:00Z"))).toEqual({ state: "open", text: "Abierto ahora" });
  });
  it("14:00 exato já está fechado (fim exclusivo)", () => {
    expect(openStatus(tienda, "Europe/Madrid", at("2026-10-05T12:00:00Z"))).toEqual({ state: "closed", text: "Cerrado" });
  });
  it("intervalo da tarde", () => {
    expect(openStatus(tienda, "Europe/Madrid", at("2026-10-05T16:00:00Z")).state).toBe("open"); // 18:00
    expect(openStatus(tienda, "Europe/Madrid", at("2026-10-05T14:30:00Z")).state).toBe("closed"); // 16:30
  });
  it("dia sem horário está fechado", () => {
    expect(openStatus(tienda, "Europe/Madrid", at("2026-10-07T10:00:00Z")).state).toBe("closed"); // quarta
  });
  it("cruza a meia-noite: terça 01:00 ainda vale o horário de segunda", () => {
    const bar = { mon: [["20:00", "02:00"]] };
    expect(openStatus(bar, "Europe/Madrid", at("2026-10-05T23:00:00Z")).state).toBe("open"); // terça 01:00
    expect(openStatus(bar, "Europe/Madrid", at("2026-10-05T19:00:00Z")).state).toBe("open"); // segunda 21:00
    expect(openStatus(bar, "Europe/Madrid", at("2026-10-06T00:30:00Z")).state).toBe("closed"); // terça 02:30
    expect(openStatus(bar, "Europe/Madrid", at("2026-10-05T17:00:00Z")).state).toBe("closed"); // segunda 19:00
  });
  it("domingo 23:00 cruzando para segunda (volta da semana)", () => {
    const bar = { sun: [["22:00", "01:00"]] };
    expect(openStatus(bar, "Europe/Madrid", at("2026-10-04T22:30:00Z")).state).toBe("open"); // segunda 00:30
  });
  it("horário de verão começa em 29/03/2026: segunda 30/03 09:30 CEST = 07:30Z", () => {
    expect(openStatus(tienda, "Europe/Madrid", at("2026-03-30T07:30:00Z")).state).toBe("open");
    expect(openStatus(tienda, "Europe/Madrid", at("2026-03-30T06:30:00Z")).state).toBe("closed"); // 08:30
  });
  it("horário de verão acaba em 25/10/2026: segunda 26/10 13:30 CET = 12:30Z", () => {
    expect(openStatus(tienda, "Europe/Madrid", at("2026-10-26T12:30:00Z")).state).toBe("open");
    expect(openStatus(tienda, "Europe/Madrid", at("2026-10-26T13:30:00Z")).state).toBe("closed"); // 14:30
  });
  it("usa o fuso do negócio, não o do servidor", () => {
    expect(openStatus(tienda, "Atlantic/Canary", at("2026-10-05T09:00:00Z")).state).toBe("open"); // 10:00 canárias (UTC+1)
    expect(openStatus(tienda, "Europe/Madrid", at("2026-10-05T09:00:00Z")).state).toBe("open"); // 11:00
    expect(openStatus(tienda, "Atlantic/Canary", at("2026-10-05T07:30:00Z")).state).toBe("closed"); // 08:30 canárias
  });
  it("sem dados confiáveis → none (a pílula não aparece)", () => {
    for (const h of [null, undefined, {}, [], "x", { mon: [] }, { mon: [["9:00", "14:00"]] }, { mon: "x" }, { mon: [["10:00", "10:00"]] }]) {
      expect(openStatus(h, "Europe/Madrid", at("2026-10-05T08:00:00Z")).state).toBe("none");
    }
  });
  it("fuso inválido → none, sem lançar", () => {
    expect(openStatus(tienda, "Mars/Base", at("2026-10-05T08:00:00Z")).state).toBe("none");
    expect(openStatus(tienda, "", at("2026-10-05T08:00:00Z")).state).toBe("none");
    expect(openStatus(tienda, null, at("2026-10-05T08:00:00Z")).state).toBe("none");
  });
  it("é auto-contida: pode ser embutida na página com toString()", () => {
    const copia = new Function("return " + openStatus.toString())();
    expect(copia(tienda, "Europe/Madrid", at("2026-10-05T08:00:00Z"))).toEqual({ state: "open", text: "Abierto ahora" });
  });
});

describe("validateHours", () => {
  it("aceita horário normal e devolve só dias conhecidos", () => {
    const r = validateHours({ mon: [["09:00", "14:00"]], foo: [["09:00", "10:00"]], tue: [] });
    expect(r).toEqual({ ok: true, value: { mon: [["09:00", "14:00"]] } });
  });
  it("null ou vazio = sem horário", () => {
    expect(validateHours(null)).toEqual({ ok: true, value: null });
    expect(validateHours({})).toEqual({ ok: true, value: null });
  });
  it("aceita 24:00 como fim", () => {
    expect(validateHours({ fri: [["18:00", "24:00"]] }).ok).toBe(true);
  });
  it("recusa hora inválida", () => {
    for (const bad of ["25:00", "9:00", "09:60", "ab:cd", "", 900]) {
      expect(validateHours({ mon: [[bad, "14:00"]] }).ok).toBe(false);
    }
  });
  it("recusa mais de 3 intervalos por dia, par incompleto e início = fim", () => {
    const i = ["09:00", "10:00"];
    expect(validateHours({ mon: [i, i, i, i] }).ok).toBe(false);
    expect(validateHours({ mon: [["09:00"]] }).ok).toBe(false);
    expect(validateHours({ mon: [["10:00", "10:00"]] }).ok).toBe(false);
  });
  it("recusa tipos errados", () => {
    expect(validateHours([1, 2]).ok).toBe(false);
    expect(validateHours("x").ok).toBe(false);
    expect(validateHours({ mon: "x" }).ok).toBe(false);
  });
  it("DAYS começa na segunda", () => {
    expect(DAYS).toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  });
});
