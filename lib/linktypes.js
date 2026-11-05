// Catálogo de redes do plano grátis. `glow` = halo colorido do botão; `generic` = sem cor de marca (usa a cor de botão da página). Cores e rótulos iguais ao modelo atual (all2/elixea.html).
export const LINK_TYPES = {
  google: { label: "Reseña en Google", bg: "#4285F4", color: "#ffffff", glow: "rgba(66,133,244,.75)", input: "url", placeholder: "https://g.page/r/…/review",
    icon: "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z\"/></svg>" },
  instagram: { label: "Instagram", bg: "linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5)", color: "#ffffff", glow: "rgba(214,41,118,.75)", input: "handle", placeholder: "@tunegocio",
    icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"4\"/><circle cx=\"17.5\" cy=\"6.5\" r=\"1\"/></svg>" },
  whatsapp: { label: "WhatsApp", bg: "#25D366", color: "#06301a", glow: "rgba(37,211,102,.70)", input: "phone", placeholder: "600 000 000",
    icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z\"/></svg>" },
  tiktok: { label: "TikTok", bg: "#010101", color: "#ffffff", glow: "rgba(255,255,255,.30)", input: "handle", placeholder: "@tunegocio",
    icon: "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M14 3v10.2a2.8 2.8 0 1 1-2-2.7V8.4a5 5 0 1 0 4 4.9V8a5.2 5.2 0 0 0 3 1V6.8A3.4 3.4 0 0 1 16.5 3H14z\"/></svg>" },
  facebook: { label: "Facebook", bg: "#1877F2", color: "#ffffff", glow: "rgba(24,119,242,.75)", input: "url", placeholder: "facebook.com/tunegocio",
    icon: "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H7v3h3v6h3v-6h3l1-3h-4v-2c0-.6.4-1 1-1z\"/></svg>" },
  website: { label: "Sitio web", bg: "var(--gold)", color: "#0c0910", generic: true, input: "url", placeholder: "tunegocio.com",
    icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20\"/></svg>" },
  youtube: { label: "YouTube", bg: "#FF0000", color: "#ffffff", glow: "rgba(255,0,0,.65)", input: "url", placeholder: "youtube.com/@tunegocio",
    icon: "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3z\"/></svg>" },
  phone: { label: "Llamar", bg: "rgba(16,12,20,.62)", color: "#f0e2c4", generic: true, input: "phone", placeholder: "600 000 000",
    icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.1-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z\"/></svg>" },
};
const HANDLE = /^[A-Za-z0-9._]{1,30}$/;

function clean(v) {
  return typeof v === "string" ? v.trim() : "";
}

function toHttps(raw) {
  const v = clean(raw);
  if (!v) return null;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : "https://" + v);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".")) return null;
  return url.href;
}

function handleFrom(raw, hostRe) {
  let v = clean(raw);
  if (!v) return null;
  if (/^https?:\/\//i.test(v) || hostRe.test(v)) {
    try {
      const u = new URL(/^https?:/i.test(v) ? v : "https://" + v);
      if (!hostRe.test(u.hostname)) return null;
      v = u.pathname.split("/").filter(Boolean)[0] || "";
    } catch {
      return null;
    }
  }
  v = v.replace(/^@/, "");
  return HANDLE.test(v) ? v : null;
}

function spanishPhone(raw) {
  const v = clean(raw);
  if (!v || /[^\d\s+()-]/.test(v)) return null;
  let d = v.replace(/\D/g, "");
  if (v.startsWith("+") || d.startsWith("34") && d.length === 11) {
    if (d.startsWith("34")) d = d.slice(2);
    else return d.length >= 8 && d.length <= 14 ? d : null;
  }
  return /^\d{9}$/.test(d) ? d : null;
}

/** Monta o link final de uma rede a partir do que a pessoa digitou. null = valor inválido. */
export function buildHref(type, value) {
  const href = buildHrefRaw(type, value);
  return href && href.length <= MAX_URL ? href : null; // o banco recusa mais de 500 caracteres
}

const MAX_URL = 500;
function buildHrefRaw(type, value) {
  if (!Object.hasOwn(LINK_TYPES, type)) return null;
  switch (type) {
    case "instagram": {
      const h = handleFrom(value, /(^|\.)instagram\.com$/i);
      return h && `https://www.instagram.com/${h}`;
    }
    case "tiktok": {
      const h = handleFrom(value, /(^|\.)tiktok\.com$/i);
      return h && `https://www.tiktok.com/@${h}`;
    }
    case "whatsapp": {
      const p = spanishPhone(value);
      if (!p) return null;
      return `https://wa.me/${p.length === 9 ? "34" + p : p}`;
    }
    case "phone": {
      const p = spanishPhone(value);
      if (!p) return null;
      return `tel:+${p.length === 9 ? "34" + p : p}`;
    }
    case "google": {
      const u = toHttps(value);
      if (!u) return null;
      const host = new URL(u).hostname;
      return /(^|\.)(google\.[a-z.]+|g\.page|goo\.gl|maps\.app\.goo\.gl)$/i.test(host) ? u : null;
    }
    case "facebook": {
      const u = toHttps(value);
      return u && /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i.test(new URL(u).hostname) ? u : null;
    }
    case "youtube": {
      const u = toHttps(value);
      return u && /(^|\.)(youtube\.com|youtu\.be)$/i.test(new URL(u).hostname) ? u : null;
    }
    default:
      return toHttps(value);
  }
}
