import { describe, it, expect } from "vitest";
import { renderPage, renderNotFound } from "../lib/render-page.js";

const profile = {
  username: "ana",
  name: "Ana Perfumes",
  bio: "Perfumes de nicho en Almería",
  avatar_url: "https://abc.supabase.co/storage/v1/object/public/avatars/u1/avatar.webp",
  bg_color: "#112233",
  btn_color: "#d9bd8a",
};
const mk = (n, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({ type: "website", url: `https://ex${i}.es/`, position: i, ...extra }));

describe("renderPage", () => {
  it("(a) mostra nome, bio, foto e um <a> por botão", () => {
    const html = renderPage(profile, [
      { type: "instagram", url: "https://www.instagram.com/ana", position: 0 },
      { type: "phone", url: "tel:+34623119997", position: 1 },
    ]);
    expect(html).toContain("Ana Perfumes");
    expect(html).toContain("Perfumes de nicho en Almería");
    expect(html).toContain(profile.avatar_url);
    expect(html).toContain('href="https://www.instagram.com/ana"');
    expect(html).toContain('href="tel:+34623119997"');
    expect((html.match(/class="link-btn/g) || []).length).toBe(2);
  });
  it("(b) com 7 links só renderiza 5", () => {
    expect((renderPage(profile, mk(7)).match(/class="link-btn/g) || []).length).toBe(5);
  });
  it("(c) nome com <script> sai escapado", () => {
    const html = renderPage({ ...profile, name: "<script>alert(1)</script>" }, []);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });
  it("(c2) aspas no nome não quebram atributos", () => {
    const html = renderPage({ ...profile, name: 'A" onmouseover="x' }, []);
    expect(html).not.toContain('onmouseover="x');
    expect(html).toContain("&quot;");
  });
  it("(d) link javascript: é descartado", () => {
    const html = renderPage(profile, [{ type: "website", url: "javascript:alert(1)", position: 0 }, ...mk(1).map((l) => ({ ...l, position: 1 }))]);
    expect(html).not.toContain("javascript:");
    expect((html.match(/class="link-btn/g) || []).length).toBe(1);
  });
  it("(d2) http: e data: também são descartados", () => {
    const html = renderPage(profile, [
      { type: "website", url: "http://x.es", position: 0 },
      { type: "website", url: "data:text/html,hola", position: 1 },
    ]);
    expect((html.match(/class="link-btn/g) || []).length).toBe(0);
  });
  it("(e) cor inválida cai no padrão; válida entra no CSS", () => {
    const bad = renderPage({ ...profile, bg_color: "red;}body{display:none" }, []);
    expect(bad).toContain("#0b131c");
    expect(bad).not.toContain("display:none");
    expect(renderPage(profile, [])).toContain("#112233");
  });
  it("(e2) texto do botão é legível: escuro em botão claro, claro em botão escuro", () => {
    expect(renderPage({ ...profile, btn_color: "#ffffff" }, mk(1))).toContain("--btn-ink:#0c0910");
    expect(renderPage({ ...profile, btn_color: "#000000" }, mk(1))).toContain("--btn-ink:#ffffff");
  });
  it("(f) rodapé, noindex e metas de compartilhamento", () => {
    const html = renderPage(profile, []);
    expect(html).toContain("Creado con Ophiel");
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('property="og:title" content="Ana Perfumes"');
    expect(html).toContain('property="og:description" content="Perfumes de nicho en Almería"');
  });
  it("(g) não emite <script>", () => expect(renderPage(profile, mk(2))).not.toMatch(/<script/i));
  it("(h) tel: não abre em nova aba, https sim", () => {
    const html = renderPage(profile, [
      { type: "phone", url: "tel:+34623119997", position: 0 },
      { type: "website", url: "https://x.es/", position: 1 },
    ]);
    const tel = html.match(/<a [^>]*href="tel:[^>]*>/)[0];
    const web = html.match(/<a [^>]*href="https:\/\/x\.es\/"[^>]*>/)[0];
    expect(tel).not.toContain("_blank");
    expect(web).toContain('target="_blank"');
    expect(web).toContain('rel="noopener"');
  });
  it("(i) sem foto mostra a inicial; avatar não-https é ignorado", () => {
    const html = renderPage({ ...profile, avatar_url: "javascript:alert(1)", name: "ana" }, []);
    expect(html).not.toContain("javascript:");
    expect(html).toContain(">A<");
  });
  it("(j) perfil vazio (sem nome, bio nem links) ainda gera página válida", () => {
    const html = renderPage({ username: "zz9", name: "", bio: "", avatar_url: null, bg_color: null, btn_color: null }, []);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("zz9");
  });
  it("(k) rótulo livre do link é escapado e usado", () => {
    const html = renderPage(profile, [{ type: "website", url: "https://x.es/", label: "Tienda <b>", position: 0 }]);
    expect(html).toContain("Tienda &lt;b&gt;");
  });
});

describe("renderNotFound", () => {
  it("diz que a página não existe e leva ao site", () => {
    const html = renderNotFound();
    expect(html).toContain("Esta página no existe");
    expect(html).toContain("https://www.ophiel.es");
    expect(html).toContain('<meta name="robots" content="noindex">');
  });
});

describe("foto de perfil só do nosso armazenamento", () => {
  it("avatar de outro host (rastreador) é ignorado", () => {
    const html = renderPage({ ...profile, avatar_url: "https://tracker.example/p.gif" }, []);
    expect(html).not.toContain("tracker.example");
    expect(html).toContain(">A<");
  });
  it("avatar de outro bucket do mesmo Supabase também", () => {
    expect(renderPage({ ...profile, avatar_url: "https://abc.supabase.co/storage/v1/object/public/outro/x.png" }, [])).not.toContain("outro/x.png");
  });
});

describe("plano grátis: todos os botões na cor escolhida pela pessoa", () => {
  const links = [
    { type: "instagram", url: "https://www.instagram.com/a", position: 0 },
    { type: "whatsapp", url: "https://wa.me/34600000000", position: 1 },
    { type: "google", url: "https://g.page/r/x/review", position: 2 },
  ];
  it("todos usam a cor de botão, sem cor de marca nem bolha", () => {
    const html = renderPage({ ...profile, btn_color: "#e0457b" }, links);
    expect(html).not.toContain("#25D366");
    expect(html).not.toContain("feda75");
    expect(html).not.toContain('class="ico"');
    expect((html.match(/style="background:var\(--btn\)/g) || []).length).toBe(3);
    expect(html).toContain("--btn:#e0457b");
  });
  it("trocar a cor de botão muda todos os botões ao mesmo tempo", () => {
    expect(renderPage({ ...profile, btn_color: "#4285f4" }, links)).toContain("--btn:#4285f4");
  });
});

describe("plano personalizado: botões candy, cada rede na sua cor oficial", () => {
  const links = [
    { type: "instagram", url: "https://www.instagram.com/a", position: 0 },
    { type: "whatsapp", url: "https://wa.me/34600000000", position: 1 },
    { type: "google", url: "https://g.page/r/x/review", position: 2 },
    { type: "facebook", url: "https://facebook.com/a", position: 3 },
    { type: "website", url: "https://a.es/", position: 4 },
  ];
  const btnOf = (html, type) => html.match(new RegExp(`<a class="link-btn"[^>]*data-rede="${type}"[^>]*>`))[0];
  const paid = (p, l) => renderPage(p, l, "personalizado");
  it("cada botão leva a cor da própria rede, mesmo com a página dourada", () => {
    const html = paid({ ...profile, btn_color: "#d9bd8a" }, links);
    expect(btnOf(html, "instagram")).toContain("linear-gradient(45deg,#feda75");
    expect(btnOf(html, "whatsapp")).toContain("background:#25D366");
    expect(btnOf(html, "whatsapp")).toContain("color:#06301a");
    expect(btnOf(html, "google")).toContain("background:#4285F4");
    expect(btnOf(html, "facebook")).toContain("background:#1877F2");
  });
  it("cada botão tem halo colorido (--brilho) na própria cor", () => {
    const html = paid(profile, links);
    expect(btnOf(html, "whatsapp")).toMatch(/--brilho:rgba\(37,211,102/);
    expect(btnOf(html, "instagram")).toMatch(/--brilho:rgba\(214,41,118/);
  });
  it("site e telefone (sem cor de marca) usam a cor de botão escolhida", () => {
    const html = paid({ ...profile, btn_color: "#e0457b" }, links);
    expect(btnOf(html, "website")).toContain("background:var(--btn)");
    expect(btnOf(html, "website")).toMatch(/--brilho:rgba\(224,69,123/);
  });
  it("o ícone vem numa bolha brilhante", () => expect(paid(profile, links)).toContain('class="ico"'));
  it("tipo desconhecido não quebra e usa a cor de botão", () => {
    expect(paid(profile, [{ type: "zzz", url: "https://a.es/", position: 0 }])).toContain("background:var(--btn)");
  });
  it("plano desconhecido cai no grátis (nunca libera o candy por engano)", () => {
    expect(renderPage(profile, links, "qualquer-coisa")).not.toContain('class="ico"');
  });
});
