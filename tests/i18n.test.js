import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { detectLang, makeT } from "../lib/i18n.js";
import { DICT } from "../js/i18n-dict.js";
import { validateSignup, wantedUsername, authErrorCode, isExistingAccount } from "../lib/signup.js";
import { RESERVED } from "../lib/reserved.js";

const root = path.resolve(import.meta.dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

describe("detectLang", () => {
  it("?lang= manda sobre todo", () => expect(detectLang({ search: "?lang=en", stored: "es", nav: "es-ES" })).toBe("en"));
  it("guardado manda sobre el navegador", () => expect(detectLang({ stored: "es", nav: "en-US" })).toBe("es"));
  it("cualquier en-* es inglés", () => expect(detectLang({ nav: "en-GB" })).toBe("en"));
  it("idioma no soportado -> español", () => expect(detectLang({ nav: "pt-BR" })).toBe("es"));
  it("valores raros no rompen", () => {
    expect(detectLang({ search: "?lang=<script>", stored: 5, nav: null })).toBe("es");
    expect(detectLang()).toBe("es");
  });
});

describe("makeT", () => {
  const d = { es: { a: "hola {n}", solo: "solo es" }, en: { a: "hi {n}" } };
  it("sustituye variables", () => expect(makeT(d, "en")("a", { n: "Ana" })).toBe("hi Ana"));
  it("cae a español y luego a la clave", () => {
    expect(makeT(d, "en")("solo")).toBe("solo es");
    expect(makeT(d, "en")("nada")).toBe("nada");
  });
  it("deja {x} intacto si falta la variable y no confunde con claves heredadas", () => {
    expect(makeT(d, "es")("a")).toBe("hola {n}");
    expect(makeT(d, "es")("constructor")).toBe("constructor");
  });
});

describe("diccionario", () => {
  const es = Object.keys(DICT.es).sort(), en = Object.keys(DICT.en).sort();
  it("ES y EN tienen exactamente las mismas claves", () => expect(en).toEqual(es));
  it("ninguna traducción está vacía", () => {
    for (const l of ["es", "en"]) for (const [k, v] of Object.entries(DICT[l])) expect(v.length, `${l}:${k}`).toBeGreaterThan(0);
  });
  it("mismas variables {x} en ES y EN", () => {
    const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    for (const k of es) expect(vars(DICT.en[k]), k).toBe(vars(DICT.es[k]));
  });
  it("solo contienen <em> como HTML (se insertan con innerHTML)", () => {
    for (const l of ["es", "en"]) for (const [k, v] of Object.entries(DICT[l])) {
      const sin = v.replace(/<\/?em>/g, "");
      expect(sin, `${l}:${k}`).not.toMatch(/[<>]/);
    }
  });
  it("las claves data-i18n* de registro, entrar y all2 existen", () => {
    for (const f of ["registro.html", "entrar.html", "all2.html"]) {
      const html = read(f);
      const keys = [...html.matchAll(/data-i18n(?:-html)?="([\w.]+)"/g)].map((m) => m[1]);
      for (const m of html.matchAll(/data-i18n-(?:attr|title)="([^"]+)"/g)) for (const p of m[1].split(";")) keys.push(p.includes(":") ? p.split(":")[1].trim() : p.trim());
      expect(keys.length, f).toBeGreaterThan(5);
      for (const k of keys) expect(DICT.es, `${f}: ${k}`).toHaveProperty(k);
    }
  });
});

describe("signup", () => {
  it("valida correo y contraseña", () => {
    expect(validateSignup({ email: "a@b.es", password: "12345678" })).toEqual({ ok: true, errors: [] });
    expect(validateSignup({ email: "a@b", password: "1234567" }).errors).toEqual(["email", "password"]);
    expect(validateSignup({ email: " a@b.es ", password: "x".repeat(73) }).errors).toEqual(["password"]);
    expect(validateSignup().ok).toBe(false);
  });
  it("wantedUsername limpia y rechaza", () => {
    expect(wantedUsername("  MiNegocio ")).toBe("minegocio");
    expect(wantedUsername("a")).toBeNull();
    expect(wantedUsername("con espacio")).toBeNull();
    expect(wantedUsername("../etc")).toBeNull();
    expect(wantedUsername(null)).toBeNull();
    expect(wantedUsername("registro")).toBeNull(); // reservado
  });
  it("authErrorCode", () => {
    expect(authErrorCode({ message: "Invalid login credentials" })).toBe("invalid");
    expect(authErrorCode({ message: "Email not confirmed" })).toBe("not_confirmed");
    expect(authErrorCode({ message: "email rate limit exceeded" })).toBe("rate");
    expect(authErrorCode({ message: "User already registered" })).toBe("exists");
    expect(authErrorCode({ message: "Password should be at least 8 characters" })).toBe("short");
    expect(authErrorCode({ message: "Failed to fetch" })).toBe("network");
    expect(authErrorCode({ message: "Unsupported provider: provider is not enabled" })).toBe("provider");
    expect(authErrorCode(null)).toBe("other");
  });
  it("isExistingAccount detecta el usuario falso de Supabase", () => {
    expect(isExistingAccount({ user: { identities: [] } })).toBe(true);
    expect(isExistingAccount({ user: { identities: [{}] } })).toBe(false);
    expect(isExistingAccount({ user: null })).toBe(false);
    expect(isExistingAccount(null)).toBe(false);
  });
});

describe("sitio", () => {
  it("nombres reservados incluyen las rutas nuevas", () => {
    for (const n of ["registro", "entrar", "all2", "criar", "painel"]) expect(RESERVED, n).toContain(n);
  });
  it("todas las páginas con menú tienen el item All2 con el prefijo correcto y --i consecutivo", () => {
    const files = [];
    for (const d of [".", "servicios", "zonas"]) for (const f of fs.readdirSync(path.join(root, d))) if (f.endsWith(".html")) files.push(path.join(d, f));
    let con = 0;
    for (const f of files) {
      const h = read(f);
      const m = h.match(/<ul class="menu-principal">(.*?)<\/ul>/s);
      if (!m) continue;
      con++;
      const pref = f.includes("/") ? "../" : "";
      expect(m[1], f).toContain(`<a href="${pref}all2"`);
      const is = [...m[1].matchAll(/--i:(\d+)/g)].map((x) => +x[1]);
      expect(is, f).toEqual(is.map((_, i) => i));
      expect(h.match(/menu-lado escalon" style="--i:(\d+)/)[1], f).toBe(String(is.length));
    }
    expect(con).toBeGreaterThanOrEqual(21);
  });
  it("la landing y el sitemap", () => {
    expect(read("sitemap.xml")).toContain("https://www.ophiel.es/all2<");
    const h = read("all2.html");
    expect(h).toContain('rel="canonical" href="https://www.ophiel.es/all2"');
    expect(h).toContain('id="claim"');
    for (const n of ["maddox", "loluca", "lecoquette", "elixea", "jeonsa", "elgatogoloso"]) expect(fs.existsSync(path.join(root, `assets/img/all2-${n}.webp`)), n).toBe(true);
  });
});
