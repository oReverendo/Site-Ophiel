import { describe, it, expect } from "vitest";
import { renderPage } from "../lib/render-page.js";

const BG = "https://abc.supabase.co/storage/v1/object/public/backgrounds/u1/bg.jpg";
const base = { username: "pepe", name: "Bar Pepe", bio: "Tapas", bg_color: "#112233", btn_color: "#d9bd8a" };
const ID = "123e4567-e89b-42d3-a456-426614174000";
const links = [{ id: ID, type: "instagram", url: "https://www.instagram.com/pepe", position: 0 }];
const pago = (extra = {}, ls = links, opts) => renderPage({ ...base, ...extra }, ls, "personalizado", opts);
const mkLinks = (n) => Array.from({ length: n }, (_, i) => ({ id: `123e4567-e89b-42d3-a456-42661417400${i % 10}`, type: "website", url: `https://ex${i}.es/`, position: i }));
const hours = { mon: [["09:00", "14:00"]] };
const MON_10 = { now: new Date("2026-10-05T08:00:00Z") };
const MON_20 = { now: new Date("2026-10-05T18:00:00Z") };

describe("grátis nunca mostra recursos pagos (mesmo se o perfil trouxer os dados)", () => {
  const full = { bg_image_url: BG, bg_blur: 50, address: "Calle 1", hours, timezone: "Europe/Madrid", show_vcard: true };
  const html = renderPage({ ...base, ...full }, [{ ...links[0], style: { color: "#ff0000", featured: true } }], "free", MON_10);
  it.each([["bg-img"], ["horario"], ["<script"], ["data-l="], ["contacto.vcf"], ["google.com/maps"], ["Calle 1"], ["destaque"], ["#ff0000"]])("sem %s", (s) => {
    expect(html).not.toContain(s);
  });
});

describe("imagem de fundo e desfoque", () => {
  it.each([[50, 20], [100, 40], [0, 0], [150, 40], [-5, 0], ["x", 0], [null, 0], [33, 13]])("bg_blur %j → blur(%ipx)", (v, px) => {
    expect(pago({ bg_image_url: BG, bg_blur: v })).toContain(`filter:blur(${px}px)`);
  });
  it("usa a imagem do nosso bucket", () => {
    const html = pago({ bg_image_url: BG, bg_blur: 10 });
    expect(html).toContain('class="bg-img"');
    expect(html).toContain(BG);
  });
  it.each([["https://evil.example/a.jpg"], ["https://abc.supabase.co/storage/v1/object/public/avatars/u1/a.jpg"], ["javascript:alert(1)"], ["http://abc.supabase.co/storage/v1/object/public/backgrounds/u1/a.jpg"], [null], [""]])("recusa %j", (u) => {
    expect(pago({ bg_image_url: u, bg_blur: 10 })).not.toContain('class="bg-img"');
  });
  it("aspas na URL não escapam do atributo", () => {
    const html = pago({ bg_image_url: BG.replace("bg.jpg", 'x").jpg"onload="alert(1)') });
    expect(html).not.toMatch(/onload=/);
    expect(html).not.toContain('"onload');
  });
});

describe("estilo por botão", () => {
  const style = (s) => pago({}, [{ ...links[0], style: s }]);
  const btn = (html) => html.match(/<a class="link-btn[^"]*"[^>]*data-rede="instagram"[^>]*>/)[0];
  it("cor própria sobrepõe a cor da rede, com texto legível e halo na mesma cor", () => {
    const b = btn(style({ color: "#ffffff" }));
    expect(b).toContain("background:#ffffff");
    expect(b).toContain("color:#0c0910");
    expect(b).toMatch(/--brilho:rgba\(255,255,255/);
  });
  it("glow:false apaga o halo colorido", () => {
    expect(btn(style({ glow: false }))).toContain("--brilho:rgba(0,0,0,.35)");
  });
  it("featured liga a classe destaque", () => {
    expect(btn(style({ featured: true }))).toContain("destaque");
    expect(btn(style({}))).not.toContain("destaque");
  });
  it("cor maliciosa é descartada sem vazar HTML/CSS", () => {
    const html = style({ color: 'red;"><script>alert(1)</script>' });
    expect(html).not.toContain("alert(1)");
    expect(btn(html)).toContain("background:linear-gradient(45deg,#feda75"); // volta à cor da rede
  });
  it("style null, texto ou array não quebram", () => {
    for (const s of [null, "x", [1], 5]) expect(() => style(s)).not.toThrow();
  });
});

describe("horário de abertura", () => {
  it("aberto: pílula com texto e dados para o script atualizar", () => {
    const html = pago({ hours }, links, MON_10);
    expect(html).toContain('class="horario"');
    expect(html).toContain('data-state="open"');
    expect(html).toContain("Abierto ahora");
    expect(html).toContain('data-tz="Europe/Madrid"');
  });
  it("fechado", () => {
    const html = pago({ hours }, links, MON_20);
    expect(html).toContain('data-state="closed"');
    expect(html).toContain("Cerrado");
  });
  it("o script embutido é o mesmo openStatus testado", () => {
    expect(pago({ hours }, links, MON_10)).toContain("function openStatus(");
  });
  it.each([[null], [{}], [{ mon: "x" }], [[1]], ["x"]])("horário inválido %j → sem pílula", (h) => {
    expect(pago({ hours: h }, links, MON_10)).not.toContain('class="horario"');
  });
  it("fuso inválido → sem pílula", () => {
    expect(pago({ hours, timezone: "Mars/Base" }, links, MON_10)).not.toContain('class="horario"');
  });
  it("dados no atributo ficam escapados", () => {
    const html = pago({ hours, timezone: 'Europe/Madrid"><b>' }, links, MON_10);
    expect(html).not.toContain("<b>");
  });
});

describe("endereço, Maps e Guardar contacto", () => {
  it("endereço escapado e botão Cómo llegar para o Google Maps", () => {
    const html = pago({ address: "<b>Calle 1</b> & Co" });
    expect(html).not.toContain("<b>Calle 1</b>");
    expect(html).toContain("&lt;b&gt;Calle 1&lt;/b&gt; &amp; Co");
    expect(html).toContain("https://www.google.com/maps/search/?api=1&amp;query=%3Cb%3ECalle%201%3C%2Fb%3E%20%26%20Co");
    expect(html).toContain("Cómo llegar");
  });
  it("sem endereço, sem botão", () => {
    expect(pago({ address: "  " })).not.toContain("Cómo llegar");
  });
  it("show_vcard liga o botão para o .vcf do próprio usuário", () => {
    const html = pago({ show_vcard: true });
    expect(html).toContain('href="/all2/pepe/contacto.vcf"');
    expect(html).toContain("Guardar contacto");
    expect(pago({ show_vcard: false })).not.toContain("contacto.vcf");
  });
});

describe("contador de cliques", () => {
  it("link com UUID leva data-l e a página tem o script de envio", () => {
    const html = pago();
    expect(html).toContain(`data-l="${ID}"`);
    expect(html).toContain("/api/click");
    expect(html).toContain("sendBeacon");
  });
  it("clique direito não conta: o auxclick só vale para o botão do meio", () => {
    expect(pago()).toContain("e.button===1");
  });
  it("id que não é UUID não vira data-l (nem injeta atributos)", () => {
    const html = pago({}, [{ ...links[0], id: '"><script>x</script>' }]);
    expect(html).not.toContain("data-l=");
    expect(html).not.toContain("<script>x</script>");
  });
  it("sem links com id e sem horário, só sobra o script de aparelho (nada de contador nem relógio)", () => {
    const html = pago({}, [{ type: "website", url: "https://a.es/", position: 0 }]);
    expect(html).not.toContain("sendBeacon");
    expect(html).not.toContain("setInterval");
    expect((html.match(/<script/g) || []).length).toBe(1);
  });
});

describe("limite de links", () => {
  it("personalizado mostra todos; grátis só 5", () => {
    const count = (h) => (h.match(/class="link-btn/g) || []).length;
    expect(count(pago({}, mkLinks(8)))).toBe(8);
    expect(count(renderPage(base, mkLinks(8), "free"))).toBe(5);
  });
});

describe("cor única dos botões (btn_style) mantendo o acabamento candy", () => {
  const ig = [{ id: ID, type: "instagram", url: "https://www.instagram.com/pepe", position: 0 },
              { id: "123e4567-e89b-42d3-a456-426614174001", type: "whatsapp", url: "https://wa.me/34600111222", position: 1 }];
  const btn = (html, t) => html.match(new RegExp(`<a class="link-btn[^"]*"[^>]*data-rede="${t}"[^>]*>`))[0];
  it("btn_style 'color': redes de marca usam a cor escolhida, com halo e bolha de vidro", () => {
    const html = pago({ btn_style: "color", btn_color: "#e0457b" }, ig);
    for (const t of ["instagram", "whatsapp"]) {
      expect(btn(html, t)).toContain("background:var(--btn)");
      expect(btn(html, t)).toMatch(/--brilho:rgba\(224,69,123/);
    }
    expect(html).toContain('class="ico"');
  });
  it("btn_style 'brand' (padrão) mantém a cor oficial de cada rede", () => {
    const html = pago({ btn_color: "#e0457b" }, ig);
    expect(btn(html, "whatsapp")).toContain("background:#25D366");
    expect(pago({ btn_style: "brand", btn_color: "#e0457b" }, ig)).toContain("background:#25D366");
  });
  it("valor desconhecido cai em 'brand'", () => {
    expect(pago({ btn_style: "neon" }, ig)).toContain("background:#25D366");
  });
  it("a cor própria de um botão ainda vence a cor única", () => {
    const html = pago({ btn_style: "color", btn_color: "#e0457b" }, [{ ...ig[0], style: { color: "#00ff00" } }]);
    expect(btn(html, "instagram")).toContain("background:#00ff00");
  });
});

describe("logo sem recorte (avatar_shape)", () => {
  const AV = "https://abc.supabase.co/storage/v1/object/public/avatars/u1/avatar.webp";
  it("circle (padrão): foto redonda como sempre", () => {
    const html = pago({ avatar_url: AV });
    expect(html).toContain('class="avatar"');
    expect(html).not.toContain('class="firma"');
  });
  it("logo: imagem inteira (sem círculo) e o nome continua visível", () => {
    const html = pago({ avatar_url: AV, avatar_shape: "logo" });
    expect(html).toContain('class="firma"');
    expect(html).toContain(`src="${AV}"`);
    expect(html).not.toContain('class="avatar"');
    expect(html).toContain('<h1 class="biz-name">Bar Pepe</h1>');
  });
  it("logo_only: só o logo; o nome fica só para leitores de tela", () => {
    const html = pago({ avatar_url: AV, avatar_shape: "logo_only" });
    expect(html).toContain('class="firma"');
    expect(html).toContain('<h1 class="biz-name sr">Bar Pepe</h1>');
  });
  it("logo sem imagem válida cai na inicial redonda", () => {
    for (const u of [null, "https://evil.example/a.png"]) {
      const html = pago({ avatar_url: u, avatar_shape: "logo" });
      expect(html).toContain('class="avatar"');
      expect(html).not.toContain('class="firma"');
    }
  });
  it("valor desconhecido → circle; grátis ignora o formato", () => {
    expect(pago({ avatar_url: AV, avatar_shape: "xyz" })).toContain('class="avatar"');
    const g = renderPage({ ...base, avatar_url: AV, avatar_shape: "logo" }, links, "free");
    expect(g).toContain('class="avatar"');
    expect(g).not.toContain('class="firma"');
  });
});

describe("vidro fosco sobre a imagem de fundo", () => {
  it("com imagem: o corpo ganha a classe e a cor do vidro vem da cor de fundo", () => {
    const html = pago({ bg_image_url: BG, bg_blur: 10, bg_color: "#112233" });
    expect(html).toMatch(/<body class="com-fondo" style="--vidrio:rgba\(17,34,51,0\.5\);/);
    expect(html).toContain("backdrop-filter");
  });
  it("sem imagem: nada disso", () => {
    expect(pago({ bg_color: "#112233" })).not.toContain('<body class="com-fondo"');
  });
  it("a camada de fundo não leva mais véu escuro (o vidro do cartão faz esse papel)", () => {
    expect(pago({ bg_image_url: BG })).not.toContain("linear-gradient(rgba(");
  });
});

const AV = "https://abc.supabase.co/storage/v1/object/public/avatars/u1/avatar.png";
const logo = (extra = {}) => pago({ avatar_url: AV, avatar_shape: "logo", ...extra });

describe("fase 2.5: logo ajustável", () => {
  it("padrão: 70 %, centrado", () => {
    expect(logo()).toContain('style="--ls:70%;--lm:238px;--lx:0;--ly:0"');
  });
  it("tamanho e posição escolhidos saem nas variáveis", () => {
    expect(logo({ logo_size: 50, logo_x: -20, logo_y: 35 })).toContain("--ls:50%;--lm:170px;--lx:-20;--ly:35");
  });
  it.each([[{ logo_size: 500 }, "--ls:100%"], [{ logo_size: 1 }, "--ls:30%"], [{ logo_x: 999 }, "--lx:100;"], [{ logo_x: -999 }, "--lx:-100;"],
    [{ logo_y: 999 }, "--ly:60"], [{ logo_y: -999 }, "--ly:-30"]])("fora da faixa %o é limitado", (extra, expected) => {
    expect(logo(extra)).toContain(expected);
  });
  it.each([["50;}body{display:none"], ["abc"], [null], [Number.NaN], [{}]])("valor hostil %o cai no padrão", (v) => {
    const html = logo({ logo_size: v, logo_x: v, logo_y: v });
    expect(html).toContain("--ls:70%;--lm:238px;--lx:0;--ly:0");
    expect(html).not.toContain("}body{display:none");
    expect(html).not.toContain("50;}");
  });
  it("com foto redonda não há bloco de logo", () => {
    expect(pago({ avatar_url: AV, logo_size: 50 })).not.toContain('class="firma"');
  });
  it("grátis ignora os ajustes", () => {
    const html = renderPage({ ...base, avatar_url: AV, avatar_shape: "logo", logo_size: 50 }, links, "free");
    expect(html).not.toContain('class="firma"');
    expect(html).not.toContain("--ls:");
  });
});

describe("fase 2.5: anel de luz", () => {
  it("padrão: dois anéis (tela cheia no celular, cartão no computador)", () => {
    const html = pago();
    expect(html).toContain('class="anel anel-tela"');
    expect(html).toContain('class="anel anel-cartao"');
  });
  it("show_ring false: nenhum anel", () => {
    const html = pago({ show_ring: false });
    expect(html).not.toContain('class="anel anel-');
  });
  it("a cor do anel acompanha o botão; botão da cor do fundo usa tinta neutra", () => {
    expect(pago({ btn_color: "#aa33aa", bg_color: "#101010" })).toContain("--anel-b:rgba(170,51,170,0.95)");
    expect(pago({ btn_color: "#101010", bg_color: "#101010" })).toContain("--anel-b:rgba(244,239,230,0.95)");
  });
  it("quem pede menos movimento recebe o anel parado", () => {
    expect(pago()).toContain(".anel{animation:none;opacity:.4}");
  });
  it("grátis não tem anel", () => {
    expect(renderPage(base, links, "free")).not.toContain("anel");
  });
});

describe("fase 2.5: mapa dentro da página", () => {
  it("com endereço: mapa do Google embutido, preguiçoso, que abre o Maps ao tocar", () => {
    const html = pago({ address: "Calle Mayor 1, Almería" });
    expect(html).toContain('<iframe title="Mapa" loading="lazy"');
    expect(html).toContain("maps.google.com/maps?q=Calle%20Mayor%201%2C%20Almer%C3%ADa&amp;z=16&amp;output=embed");
    expect(html).toMatch(/<a class="mapa"[^>]*href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=Calle%20Mayor/);
    expect(html).toContain("Cómo llegar");
    expect(html).not.toContain('class="link-btn acao" style="--i:1" href="https://www.google.com/maps');
  });
  it("show_map false: volta ao botão, sem iframe", () => {
    const html = pago({ address: "Calle 1", show_map: false });
    expect(html).not.toContain("<iframe");
    expect(html).toContain("link-btn acao");
    expect(html).toContain("google.com/maps/search");
  });
  it("sem endereço não há mapa", () => {
    expect(pago({ show_map: true })).not.toContain("<iframe");
  });
  it("endereço malicioso não escapa do atributo", () => {
    const html = pago({ address: '"><script>alert(1)</script>' });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain('"><script');
  });
});

describe("fase 2.5: horário que abre", () => {
  const html = pago({ hours: { mon: [["09:00", "14:00"], ["17:00", "20:00"]], sat: [["10:00", "13:00"]] } }, links, MON_10);
  it("a pílula é um botão que controla a lista da semana", () => {
    expect(html).toContain('<button type="button" class="horario-btn" aria-expanded="false">');
    expect(html).toContain('<ul class="horario-lista">');
  });
  it("a lista traz os sete dias, na ordem de segunda a domingo, com Cerrado nos vazios", () => {
    const lis = [...html.matchAll(/<li data-d="(\w+)"><span>([^<]+)<\/span><span>([^<]+)<\/span><\/li>/g)];
    expect(lis.map((m) => m[1])).toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
    expect(lis[0][3]).toBe("09:00–14:00 · 17:00–20:00");
    expect(lis[1][3]).toBe("Cerrado");
    expect(lis[5][3]).toBe("10:00–13:00");
  });
  it("o script alterna a lista e marca o dia de hoje", () => {
    expect(html).toContain('aria-expanded');
    expect(html).toContain('classList.toggle("hoy"');
  });
});

describe("fase 2.5: entrada, aparelho e fundo", () => {
  it("os botões entram em cascata (índice por botão) e respeitam menos movimento", () => {
    const html = pago({}, mkLinks(3));
    expect(html).toMatch(/--i:0/);
    expect(html).toMatch(/--i:2/);
    expect(html).toContain("@media (prefers-reduced-motion:no-preference){");
    expect(html).toContain("@keyframes sobe");
  });
  it("o botão em destaque combina entrada e pulso", () => {
    expect(pago({}, [{ ...links[0], style: { featured: true } }])).toContain("destaque 3.2s ease-in-out 1.2s infinite");
  });
  it("página paga tem o script de aparelho no head; grátis não", () => {
    expect(pago()).toMatch(/<\/style>\n<script>\(function\(\)\{try\{var t=navigator\.maxTouchPoints/);
    expect(renderPage(base, links, "free")).not.toContain("maxTouchPoints");
  });
  it("cartão vira tela cheia em navegador que mente (html.toque)", () => {
    expect(pago()).toContain("html.toque .card{");
  });
  it("o corpo não rola para os lados quando o logo é empurrado", () => {
    expect(pago()).toContain("overflow-x:clip");
  });
});
