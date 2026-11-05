import { LINK_TYPES } from "./linktypes.js";
import { visibleLinks } from "./plan.js";
import { DAYS, openStatus, validateHours } from "./hours.js";

// ESM sem dependências de Node: a função roda no Vercel e no navegador (prévia do assistente).

const DEFAULT_BG = "#0b131c";
const DEFAULT_BTN = "#d9bd8a";
const DARK_INK = "#0c0910";
// Só aceitamos fotos do nosso próprio bucket (impede rastreadores e imagens enormes de terceiros).
const AVATAR_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/avatars\//i;
const BG_URL = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/backgrounds\//i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TZ = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/;

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Só aceita #rgb ou #rrggbb; qualquer outra coisa vira o padrão. */
export function safeColor(c, fallback) {
  return typeof c === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim()) ? c.trim().toLowerCase() : fallback;
}

function luminance(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((x) => x + x).join("");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgba(hex, a) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((x) => x + x).join("");
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

export const inkOn = (hex) => (luminance(hex) > 0.4 ? DARK_INK : "#ffffff");

function safeUrl(u) {
  if (typeof u !== "string") return null;
  try {
    const p = new URL(u.trim());
    return ["https:", "tel:", "mailto:"].includes(p.protocol) ? p.href : null;
  } catch {
    return null;
  }
}

// Só no plano personalizado: botões "candy" (cada rede na cor oficial, halo colorido, ícone em bolha de vidro).
const CANDY_CSS = `
.link-btn{border-radius:18px;padding:12px 18px 12px 14px;min-height:62px;font-size:1.05rem;font-weight:700;border-color:rgba(255,255,255,.30);box-shadow:0 14px 24px -10px var(--brilho,rgba(0,0,0,.5)),0 2px 0 rgba(0,0,0,.30),inset 0 2px 0 rgba(255,255,255,.55),inset 0 -4px 10px rgba(0,0,0,.20)}
.link-btn::after{content:"";position:absolute;top:0;bottom:0;left:-50%;width:40%;border-radius:inherit;pointer-events:none;background:linear-gradient(100deg,transparent,rgba(255,255,255,.38),transparent);transition:left .55s ease}
.link-btn:hover::after,.link-btn:active::after{left:120%}
.link-btn .ico,.link-btn .link-label{position:relative;z-index:1}
.link-btn .ico{width:38px;height:38px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 32% 26%,rgba(255,255,255,.62),rgba(255,255,255,.16) 55%,rgba(0,0,0,.12));box-shadow:inset 0 1px 1px rgba(255,255,255,.7),inset 0 -2px 5px rgba(0,0,0,.20),0 2px 5px rgba(0,0,0,.22)}
.link-btn .ico svg{width:20px;height:20px}`;


// Só no plano personalizado: fundo com imagem, destaque, pílula de horário, endereço e botões de ação.
const EXTRAS_CSS = `
.bg-img{position:fixed;inset:-50px;z-index:-1;background-size:cover;background-position:center;pointer-events:none;transform:translateZ(0)}
.com-fondo .card{background:var(--vidrio);-webkit-backdrop-filter:blur(4px) saturate(1.1);backdrop-filter:blur(4px) saturate(1.1)}
.card{position:relative;overflow-x:clip}
.firma{margin:2px auto 20px;width:min(var(--ls,70%),var(--lm,238px));position:relative;left:calc(var(--lx,0)*.005*(100% - min(var(--ls,70%),var(--lm,238px))));top:calc(var(--ly,0)*1px)}
.firma img{width:100%;height:auto;max-height:300px;object-fit:contain;display:block;filter:drop-shadow(0 6px 14px rgba(0,0,0,.40))}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.link-btn.destaque{min-height:74px;font-size:1.15rem;animation:destaque 3.2s ease-in-out infinite}
@keyframes destaque{0%,100%{transform:scale(1)}50%{transform:scale(1.025)}}
.link-btn.acao{background:rgba(127,127,127,.16);color:var(--ink);border-color:rgba(127,127,127,.42);box-shadow:none;min-height:54px;font-size:.98rem;font-weight:600}
.link-btn.acao::before,.link-btn.acao::after{display:none}
.horario{margin:-10px 0 18px;text-align:center}
.horario-btn{display:inline-flex;align-items:center;gap:8px;appearance:none;font:inherit;color:inherit;cursor:pointer;padding:6px 14px;border-radius:999px;font-size:.82rem;font-weight:600;background:rgba(127,127,127,.18);border:1px solid rgba(127,127,127,.35)}
.horario .dot{width:9px;height:9px;border-radius:50%;background:#888;flex:none}
.horario[data-state=open] .dot{background:#2fbf71;box-shadow:0 0 8px #2fbf71}
.horario[data-state=closed] .dot{background:#e5484d}
.horario .seta{width:13px;height:13px;opacity:.6;transition:transform .2s ease}
.horario-btn[aria-expanded=true] .seta{transform:rotate(180deg)}
.horario-lista{list-style:none;margin:10px auto 0;padding:0 4px;max-width:280px;font-size:.83rem;opacity:.85;display:none}
.horario-lista.is-open{display:block}
.horario-lista li{display:flex;justify-content:space-between;gap:12px;padding:3px 0;text-align:left}
.horario-lista li.hoy{font-weight:700;opacity:1}
.local{display:flex;align-items:center;justify-content:center;gap:6px;margin:-14px 0 18px;font-size:.84rem;opacity:.8;text-align:center}
.local svg{width:15px;height:15px;flex:none}
.mapa{display:block;position:relative;margin:12px 0 0;border-radius:16px;overflow:hidden;height:190px;border:1px solid rgba(127,127,127,.35);box-shadow:0 12px 22px -14px rgba(0,0,0,.45);text-decoration:none;color:var(--ink)}
.mapa iframe{width:100%;height:100%;border:0;display:block;pointer-events:none;filter:grayscale(.22) contrast(1.02) saturate(.92)}
.mapa-pe{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:7px;padding:9px 13px;font-size:.82rem;font-weight:600;background:linear-gradient(to top,var(--bg-a),var(--bg-0))}
.mapa-pe svg{width:16px;height:16px;flex:none}
@media (hover:hover){.mapa:hover iframe{filter:none}}
@property --giro{syntax:"<angle>";initial-value:0deg;inherits:false}
.anel{position:fixed;inset:0;z-index:2;pointer-events:none;border-radius:inherit;padding:2px;background:conic-gradient(from var(--giro),transparent 0 68%,var(--anel-a) 78%,var(--anel-b) 86%,var(--anel-a) 94%,transparent 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;filter:drop-shadow(0 0 6px var(--anel-a));animation:girar 7s linear infinite}
@keyframes girar{to{--giro:360deg}}
.anel-cartao{display:none;position:absolute}
@media (min-width:560px) and (pointer:fine){.anel-tela{display:none}.anel-cartao{display:block}}
html.toque body{align-items:stretch;padding:0}
html.toque .card{max-width:none;width:100%;border:0;border-radius:0;min-height:100vh;min-height:100svh;padding:40px 28px calc(18px + env(safe-area-inset-bottom))}
html.toque .card-main{flex:1}
html.toque .anel-tela{display:block}
html.toque .anel-cartao{display:none}
@media (prefers-reduced-motion:no-preference){
@keyframes sobe{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.firma,.biz-sub,.horario,.links .link-btn,.mapa,.footer-credit{animation:sobe .62s cubic-bezier(.2,.75,.3,1) backwards}
.firma{animation-duration:.85s}
.biz-sub,.horario{animation-delay:.12s}
.links .link-btn{animation-delay:calc(.2s + var(--i,0)*70ms)}
.links .link-btn.destaque{animation:sobe .62s cubic-bezier(.2,.75,.3,1) calc(.2s + var(--i,0)*70ms) backwards,destaque 3.2s ease-in-out 1.2s infinite}
.mapa{animation-delay:calc(.24s + var(--total,6)*70ms)}
.footer-credit{animation-delay:.75s}
}
@media (prefers-reduced-motion:reduce){.link-btn.destaque{animation:none}.anel{animation:none;opacity:.4}}`;

const CSS = (bg, btn, plan) => `
:root{--bg:${bg};--ink:${inkOn(bg) === "#ffffff" ? "#f4efe6" : "#16121b"};--btn:${btn};--btn-ink:${inkOn(btn)};--gold:#d9bd8a}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;min-height:100vh;min-height:100svh;background:var(--bg);color:var(--ink);font-family:'Helvetica Neue',Arial,sans-serif;display:flex;justify-content:center}
.card{width:100%;min-height:100vh;min-height:100svh;display:flex;flex-direction:column;padding:40px 28px calc(18px + env(safe-area-inset-bottom))}
.card-main{flex:1;display:flex;flex-direction:column;justify-content:center;justify-content:safe center}
@media (min-width:560px) and (pointer:fine){body{align-items:center;padding:32px 18px}.card{max-width:420px;min-height:auto;border:1px solid rgba(127,127,127,.28);border-radius:22px;padding:38px 28px 26px;background:rgba(127,127,127,.08)}.card-main{flex:none}}
.avatar{width:112px;height:112px;border-radius:50%;margin:0 auto 18px;overflow:hidden;background:rgba(127,127,127,.14);border:1px solid rgba(127,127,127,.55);display:flex;align-items:center;justify-content:center;flex:none}
.avatar img{width:100%;height:100%;object-fit:cover;display:block}
.avatar span{font-family:Georgia,serif;font-size:42px;color:var(--ink)}
.biz-name{text-align:center;font-size:1.3rem;font-weight:600;margin:0 0 4px;line-height:1.3}
.biz-sub{text-align:center;font-size:.9rem;opacity:.72;margin:0 0 26px;white-space:pre-line}
.links{display:flex;flex-direction:column;gap:12px}
.link-btn{display:flex;align-items:center;gap:12px;text-decoration:none;border-radius:16px;padding:16px 20px;min-height:58px;font-size:1.02rem;font-weight:600;border:1px solid transparent;position:relative;overflow:hidden;background:var(--btn);color:var(--btn-ink);box-shadow:0 12px 22px -10px var(--brilho,rgba(0,0,0,.5)),0 2px 0 rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.40),inset 0 -3px 10px rgba(0,0,0,.18);transition:transform .16s cubic-bezier(.2,.8,.3,1)}
.link-btn::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.30),rgba(255,255,255,.04) 46%,rgba(0,0,0,.04) 54%,rgba(0,0,0,.16))}
.link-btn svg,.link-btn .link-label{position:relative;z-index:1}
.link-btn svg{width:21px;height:21px;flex:none}
.link-btn .link-label{flex:1}
@media (hover:hover){.link-btn:hover{transform:translateY(-2px)}}
.link-btn:active{transform:translateY(2px) scale(.99)}
.footer-credit{text-align:center;margin-top:20px;flex:none;font-size:.72rem;color:inherit;opacity:.5;text-decoration:none;display:block;padding:8px}
@media (prefers-reduced-motion:reduce){.link-btn,.link-btn::after{transition:none}}${plan === "personalizado" ? CANDY_CSS + EXTRAS_CSS : ""}`;

function head(title, description, bg, btn, image, plan = "free") {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="${bg}">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">${image ? `\n<meta property="og:image" content="${esc(image)}">` : ""}
<style>${CSS(bg, btn, plan)}</style>${plan === "personalizado" ? `\n<script>${TOQUE_SCRIPT}</script>` : ""}
</head>`;
}

const PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
const CARD_ADD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M19 8v6M16 11h6"/></svg>';

// Navegadores dentro de apps (Instagram, Facebook) dizem ter mouse e largura de tablet: a tela FÍSICA e o UA não mentem.
// Com toque + aparelho móvel, o cartão vira tela cheia (classe "toque" no <html>).
const TOQUE_SCRIPT = `(function(){try{var t=navigator.maxTouchPoints>0||"ontouchstart"in window;if(!t)return;var u=navigator.userAgentData;var m=(u&&u.mobile===true)||/Android|iPhone|iPod|iPad|Mobile|Silk|Kindle|FBAN|FBAV|Instagram/i.test(navigator.userAgent||"");var s=Math.min(screen.width||0,screen.height||0);if(m||(s>0&&s<560))document.documentElement.classList.add("toque")}catch(e){}})()`;

const CLICK_SCRIPT = `(function(){function s(e){var a=e.target&&e.target.closest&&e.target.closest("a[data-l]");if(!a)return;try{navigator.sendBeacon("/api/click",new Blob([JSON.stringify({l:a.getAttribute("data-l")})],{type:"application/json"}))}catch(x){}}document.addEventListener("click",s,true);document.addEventListener("auxclick",function(e){if(e.button===1)s(e)},true)})()`;

function clampBlur(v) {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n)) * 0.4) : 0;
}

function clampInt(v, lo, hi, dflt) {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : dflt;
}

const DAY_ES = { mon: "Lunes", tue: "Martes", wed: "Miércoles", thu: "Jueves", fri: "Viernes", sat: "Sábado", sun: "Domingo" };
const CHEVRON = '<svg class="seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

function hoursList(value) {
  return DAYS.map((d) => {
    const spans = (value[d] || []).map(([a, b]) => `${a}–${b}`).join(" · ");
    return `<li data-d="${d}"><span>${DAY_ES[d]}</span><span>${spans ? esc(spans) : "Cerrado"}</span></li>`;
  }).join("");
}

function plainObject(o) {
  return o && typeof o === "object" && !Array.isArray(o) ? o : {};
}

/**
 * HTML público de /all2/<usuario>. `plan` "free" (padrão): todos os botões na cor escolhida, sem JavaScript.
 * "personalizado": botões candy + recursos pagos (fundo, estilo por botão, horário, endereço/Maps, contacto, contador).
 * `opts.now` (Date) fixa a hora usada na pílula de horário (testes).
 */
export function renderPage(profile, links, plan = "free", opts = {}) {
  const paid = plan === "personalizado";
  const bg = safeColor(profile.bg_color, DEFAULT_BG);
  const btn = safeColor(profile.btn_color, DEFAULT_BTN);
  const name = (profile.name || "").trim() || profile.username || "";
  const bio = (profile.bio || "").trim();
  const avatar = safeUrl(profile.avatar_url);
  const avatarOk = avatar && AVATAR_URL.test(avatar) ? avatar : null;

  const valid = (links || [])
    .map((l) => ({ ...l, url: safeUrl(l.url) }))
    .filter((l) => l.url);
  let tracked = false;
  const buttons = visibleLinks(valid, paid ? "personalizado" : "free")
    .map((l, idx) => {
      const known = Object.hasOwn(LINK_TYPES, l.type);
      const meta = known ? LINK_TYPES[l.type] : LINK_TYPES.website;
      const label = (l.label || "").trim() || meta.label;
      const ext = l.url.startsWith("tel:") ? "" : ' target="_blank" rel="noopener"';
      // Cada rede na sua cor oficial (para a pessoa se guiar pela cor); site, telefone e tipos sem marca usam a cor de botão da página.
      const brand = profile.btn_style !== "color"; // "color": todos os botões na cor escolhida (mantém o acabamento candy)
      let style = paid && brand && known && !meta.generic
        ? `background:${meta.bg};color:${meta.color};--brilho:${meta.glow}`
        : `background:var(--btn);color:var(--btn-ink);--brilho:${rgba(btn, 0.65)}`;
      let extra = "";
      let cls = "link-btn";
      if (paid) {
        const st = plainObject(l.style);
        const own = safeColor(st.color, null);
        if (own) style = `background:${own};color:${inkOn(own)};--brilho:${rgba(own, 0.65)}`;
        if (st.glow === false) style = style.replace(/--brilho:[^;]*$/, "--brilho:rgba(0,0,0,.35)");
        if (st.featured === true) cls += " destaque";
        if (typeof l.id === "string" && UUID.test(l.id)) { extra = ` data-l="${esc(l.id)}"`; tracked = true; }
        style += `;--i:${idx}`;
      }
      return `<a class="${cls}" data-rede="${known ? l.type : "website"}"${extra} style="${style}" href="${esc(l.url)}"${ext}>${paid ? `<span class="ico">${meta.icon}</span>` : meta.icon}<span class="link-label">${esc(label)}</span></a>`;
    });

  let bgLayer = "", bodyAttrs = "", pill = "", local = "", scripts = "", ringTela = "", ringCartao = "", mapa = "";
  if (paid) {
    const bgHref = safeUrl(profile.bg_image_url);
    if (bgHref && BG_URL.test(bgHref) && !/[()'"\\\s]/.test(bgHref)) {
      bgLayer = `<div class="bg-img" aria-hidden="true" style="background-image:url(&quot;${esc(bgHref)}&quot;);filter:blur(${clampBlur(profile.bg_blur)}px)"></div>\n  `;
    }
    const ringBase = Math.abs(luminance(btn) - luminance(bg)) > 0.12 ? btn : inkOn(bg) === "#ffffff" ? "#f4efe6" : "#16121b";
    const vars = `--vidrio:${rgba(bg, 0.5)};--bg-a:${rgba(bg, 0.94)};--bg-0:${rgba(bg, 0)};--anel-a:${rgba(ringBase, 0.25)};--anel-b:${rgba(ringBase, 0.95)}`;
    bodyAttrs = `${bgLayer ? ' class="com-fondo"' : ""} style="${vars}"`;
    if (profile.show_ring !== false) {
      ringTela = '<span class="anel anel-tela" aria-hidden="true"></span>\n  ';
      ringCartao = '<span class="anel anel-cartao" aria-hidden="true"></span>\n    ';
    }
    const rawTz = profile.timezone ?? "Europe/Madrid";
    const tz = typeof rawTz === "string" && TZ.test(rawTz) ? rawTz : "";
    const hv = validateHours(profile.hours);
    const status = hv.ok && hv.value && tz ? openStatus(hv.value, tz, opts.now || new Date()) : { state: "none" };
    if (status.state !== "none") {
      pill = `<div class="horario" data-state="${status.state}" data-tz="${esc(tz)}" data-h="${esc(JSON.stringify(hv.value))}"><button type="button" class="horario-btn" aria-expanded="false"><span class="dot"></span><span class="txt">${esc(status.text)}</span>${CHEVRON}</button><ul class="horario-lista">${hoursList(hv.value)}</ul></div>`;
      scripts += `<script>(function(){var f=${openStatus.toString()};var e=document.querySelector(".horario");if(!e)return;var b=e.querySelector(".horario-btn"),l=e.querySelector(".horario-lista"),L=l.children;b.addEventListener("click",function(){var o=b.getAttribute("aria-expanded")!=="true";b.setAttribute("aria-expanded",String(o));l.classList.toggle("is-open",o)});function u(){var z=e.getAttribute("data-tz"),s;try{s=f(JSON.parse(e.getAttribute("data-h")),z,new Date())}catch(x){return}if(s.state==="none")return;e.setAttribute("data-state",s.state);e.querySelector(".txt").textContent=s.text;var w="";try{w=new Intl.DateTimeFormat("en-US",{timeZone:z,weekday:"short"}).format(new Date()).slice(0,3).toLowerCase()}catch(x){}for(var i=0;i<L.length;i++)L[i].classList.toggle("hoy",L[i].getAttribute("data-d")===w)}u();setInterval(u,60000)})()</script>\n`;
    }
    const address = String(profile.address || "").trim();
    if (address) {
      local = `<div class="local">${PIN}<span>${esc(address)}</span></div>`;
      const mapsHref = esc("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address));
      if (profile.show_map !== false) {
        mapa = `<a class="mapa" style="--total:${buttons.length}" href="${mapsHref}" target="_blank" rel="noopener" aria-label="Cómo llegar: ${esc(address)}"><iframe title="Mapa" loading="lazy" tabindex="-1" referrerpolicy="no-referrer-when-downgrade" src="${esc("https://maps.google.com/maps?q=" + encodeURIComponent(address) + "&z=16&output=embed")}"></iframe><span class="mapa-pe">${PIN}Cómo llegar</span></a>`;
      } else {
        buttons.push(`<a class="link-btn acao" style="--i:${buttons.length}" href="${mapsHref}" target="_blank" rel="noopener">${PIN}<span class="link-label">Cómo llegar</span></a>`);
      }
    }
    if (profile.show_vcard === true && profile.username) {
      buttons.push(`<a class="link-btn acao" style="--i:${buttons.length}" href="/all2/${esc(encodeURIComponent(profile.username))}/contacto.vcf" download>${CARD_ADD}<span class="link-label">Guardar contacto</span></a>`);
    }
    if (tracked) scripts += `<script>${CLICK_SCRIPT}</script>\n`;
  }

  const initial = esc((name[0] || "?").toUpperCase());
  // Personalizado: o logo PNG aparece inteiro (sem recorte redondo) e pode substituir foto + nome.
  const shape = paid && avatarOk && (profile.avatar_shape === "logo" || profile.avatar_shape === "logo_only") ? profile.avatar_shape : "circle";
  const top = shape === "circle"
    ? `<div class="avatar">${avatarOk ? `<img src="${esc(avatarOk)}" alt="${esc(name)}" width="112" height="112">` : `<span>${initial}</span>`}</div>`
    : `<div class="firma" style="--ls:${clampInt(profile.logo_size, 30, 100, 70)}%;--lm:${Math.round(clampInt(profile.logo_size, 30, 100, 70) * 3.4)}px;--lx:${clampInt(profile.logo_x, -100, 100, 0)};--ly:${clampInt(profile.logo_y, -30, 60, 0)}"><img src="${esc(avatarOk)}" alt="${esc(name)}"></div>`;
  return `${head(name, bio || name, bg, btn, avatarOk, paid ? plan : "free")}
<body${bodyAttrs}>
  ${bgLayer}${ringTela}<div class="card">
    ${ringCartao}<div class="card-main">
      ${top}
      <h1 class="${shape === "logo_only" ? "biz-name sr" : "biz-name"}">${esc(name)}</h1>
      ${bio ? `<p class="biz-sub">${esc(bio)}</p>` : ""}
      ${pill}${local}
      <div class="links">
      ${buttons.join("\n      ")}
      </div>
      ${mapa}
    </div>
    <a href="https://ophiel.es" class="footer-credit">Creado con Ophiel</a>
  </div>
${scripts}</body>
</html>`;
}

export function renderNotFound() {
  return `${head("Página no encontrada", "Esta página no existe", DEFAULT_BG, DEFAULT_BTN, null)}
<body>
  <div class="card"><div class="card-main" style="text-align:center">
    <h1 class="biz-name">Esta página no existe</h1>
    <p class="biz-sub">Puede que el enlace esté mal escrito.</p>
    <div class="links"><a class="link-btn" href="https://www.ophiel.es"><span class="link-label" style="text-align:center">Ir a ophiel.es</span></a></div>
  </div></div>
</body>
</html>`;
}
