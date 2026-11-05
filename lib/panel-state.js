import { buildHref, LINK_TYPES } from "./linktypes.js";
import { canAddLink, isLocked } from "./plan.js";
import { validateHours } from "./hours.js";

// Estado puro do painel de edição (sem DOM; tudo testável). Imutável: cada função devolve um estado novo.
// state = { plan, profile, links[{id,type,url,label,position,style}], orig, hiddenCount, notice, seq }
// notice: null | "plan" (recurso pago) | "limite" | "valor" | "largo" | "horario" | "campo"

const FIELD_FEATURE = { bg_image_url: "bgImage", bg_blur: "bgImage", address: "address", hours: "hours", timezone: "hours", show_vcard: "vcard", btn_style: "btnStyle", avatar_shape: "logo", logo_size: "logo", logo_x: "logo", logo_y: "logo", show_ring: "ring", show_map: "map" };
const FREE_FIELDS = ["name", "bio", "avatar_url", "bg_color", "btn_color"];
const EDITABLE = [...FREE_FIELDS, ...Object.keys(FIELD_FEATURE)];
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const TZ = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/;
const LIMITS = { name: 80, bio: 160, address: 200 };
/** Faixas dos ajustes do logo (o banco repete: tamanho em % da largura; x de -100 (encostado à esquerda) a 100 (à direita), sempre dentro do cartão; y em px). */
export const LOGO_RANGE = { logo_size: [30, 100, 70], logo_x: [-100, 100, 0], logo_y: [-30, 60, 0] };
const LABEL_MAX = 40;

const snap = (v) => JSON.stringify(v ?? null);
const withNotice = (s, notice) => ({ ...s, notice });

function snapshotLinks(links) {
  return Object.fromEntries(links.map((l) => [l.id, { url: l.url, label: l.label, position: l.position, style: l.style }]));
}

export function fromServer({ profile, links, plan }) {
  const p = plan === "personalizado" ? "personalizado" : "free";
  const sorted = [...(links || [])].sort((a, b) => a.position - b.position)
    .map((l) => ({ id: l.id, type: l.type, url: l.url, label: l.label ?? null, position: l.position, style: l.style && typeof l.style === "object" ? l.style : {} }));
  const prof = { ...profile };
  return {
    plan: p, profile: prof, links: sorted,
    orig: { profile: { ...prof }, links: snapshotLinks(sorted) },
    hiddenCount: p === "free" ? Math.max(0, sorted.length - 5) : 0,
    notice: null, seq: 0,
  };
}

/** Valor normalizado para o campo, ou { error } com o código do aviso. */
function normalize(key, value) {
  if (key === "name" || key === "bio" || key === "address") {
    const v = String(value ?? "");
    if (v.length > LIMITS[key]) return { error: "largo" };
    return { value: key === "address" && !v.trim() ? null : v };
  }
  if (key === "bg_color" || key === "btn_color") return HEX.test(String(value)) ? { value: String(value).toLowerCase() } : { error: "valor" };
  if (key === "bg_blur") {
    const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
    return Number.isFinite(n) ? { value: Math.round(Math.min(100, Math.max(0, n))) } : { error: "valor" };
  }
  if (key === "hours") {
    const r = validateHours(value);
    return r.ok ? { value: r.value } : { error: "horario" };
  }
  if (key === "timezone") return typeof value === "string" && TZ.test(value) && value.length <= 64 ? { value } : { error: "valor" };
  if (Object.hasOwn(LOGO_RANGE, key)) {
    const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
    const [lo, hi] = LOGO_RANGE[key];
    return Number.isFinite(n) ? { value: Math.round(Math.min(hi, Math.max(lo, n))) } : { error: "valor" };
  }
  if (key === "show_vcard" || key === "show_ring" || key === "show_map") return { value: value === true };
  if (key === "btn_style") return ["brand", "color"].includes(value) ? { value } : { error: "valor" };
  if (key === "avatar_shape") return ["circle", "logo", "logo_only"].includes(value) ? { value } : { error: "valor" };
  if (key === "avatar_url" || key === "bg_image_url") {
    if (value === null || value === "") return { value: null };
    return typeof value === "string" && /^https:\/\//.test(value) && value.length <= 500 ? { value } : { error: "valor" };
  }
  return { error: "campo" };
}

export function setProfileField(state, key, value) {
  if (!EDITABLE.includes(key)) return withNotice(state, "campo");
  if (FIELD_FEATURE[key] && isLocked(FIELD_FEATURE[key], state.plan)) return withNotice(state, "plan");
  const r = normalize(key, value);
  if ("error" in r) return withNotice(state, r.error);
  return { ...state, profile: { ...state.profile, [key]: r.value }, notice: null };
}

function cleanStyle(style) {
  const s = style && typeof style === "object" && !Array.isArray(style) ? style : {};
  const out = {};
  if (typeof s.color === "string" && HEX.test(s.color)) out.color = s.color.toLowerCase();
  if (typeof s.glow === "boolean") out.glow = s.glow;
  if (typeof s.featured === "boolean") out.featured = s.featured;
  return out;
}

export function setLinkStyle(state, id, style) {
  if (isLocked("linkStyle", state.plan)) return withNotice(state, "plan");
  if (!state.links.some((l) => l.id === id)) return state;
  return { ...state, links: state.links.map((l) => (l.id === id ? { ...l, style: cleanStyle(style) } : l)), notice: null };
}

export function addLink(state, { type, value, label }) {
  if (!canAddLink(state.links.length, state.plan)) return withNotice(state, "limite");
  if (!Object.hasOwn(LINK_TYPES, type)) return withNotice(state, "valor");
  const url = buildHref(type, value);
  if (!url) return withNotice(state, "valor");
  const seq = state.seq + 1;
  const canLabel = type === "website" || state.plan === "personalizado"; // grátis: texto livre só em links de site
  const text = canLabel && typeof label === "string" && label.trim() ? label.trim().slice(0, LABEL_MAX) : null;
  const link = { id: `new-${seq}`, type, url, label: text, position: state.links.length, style: {} };
  return { ...state, links: [...state.links, link], seq, notice: null };
}

/** Texto para mostrar no campo de edição (o que a pessoa digitaria), a partir do link guardado. */
export function displayValue(link) {
  const url = String(link.url || "");
  if (link.type === "phone") return url.replace(/^tel:\+?34/, "").replace(/^tel:/, "");
  if (link.type === "whatsapp") return url.replace(/^https:\/\/wa\.me\/34/, "").replace(/^https:\/\/wa\.me\//, "");
  if (link.type === "instagram" || link.type === "tiktok") {
    const m = /\/@?([^/?#]+)\/?$/.exec(url);
    return m ? "@" + m[1] : url;
  }
  return url;
}

export function updateLink(state, id, { value, label }) {
  const cur = state.links.find((l) => l.id === id);
  if (!cur) return state;
  let url = cur.url;
  if (value !== undefined && value !== displayValue(cur)) {
    url = buildHref(cur.type, value);
    if (!url) return withNotice(state, "valor");
  }
  const text = label === undefined ? cur.label : (String(label).trim().slice(0, LABEL_MAX) || null);
  return { ...state, links: state.links.map((l) => (l.id === id ? { ...l, url, label: text } : l)), notice: null };
}

export function moveLink(state, id, dir) {
  const i = state.links.findIndex((l) => l.id === id);
  const j = dir === "up" ? i - 1 : dir === "down" ? i + 1 : -1;
  if (i < 0 || j < 0 || j >= state.links.length) return state;
  const links = [...state.links];
  [links[i], links[j]] = [links[j], links[i]];
  return { ...state, links: links.map((l, position) => ({ ...l, position })), notice: null };
}

export function removeLink(state, id) {
  if (!state.links.some((l) => l.id === id)) return state;
  const links = state.links.filter((l) => l.id !== id).map((l, position) => ({ ...l, position }));
  return { ...state, links, hiddenCount: state.plan === "free" ? Math.max(0, links.length - 5) : 0, notice: null };
}

/** O que gravar: só diferenças em relação ao que veio do servidor. Campos pagos e style nunca saem no plano grátis. */
export function toSavePayload(state) {
  const profile = {};
  for (const k of EDITABLE) {
    if (FIELD_FEATURE[k] && isLocked(FIELD_FEATURE[k], state.plan)) continue;
    if (snap(state.profile[k]) !== snap(state.orig.profile[k])) profile[k] = state.profile[k] ?? null;
  }
  const paid = !isLocked("linkStyle", state.plan);
  const inserts = [];
  const updates = [];
  for (const l of state.links) {
    if (String(l.id).startsWith("new-")) {
      const row = { type: l.type, url: l.url, label: l.label, position: l.position };
      if (paid && Object.keys(l.style).length) row.style = l.style;
      inserts.push(row);
      continue;
    }
    const o = state.orig.links[l.id];
    if (!o) continue;
    const diff = {};
    if (l.url !== o.url) diff.url = l.url;
    if (l.label !== o.label) diff.label = l.label;
    if (l.position !== o.position) diff.position = l.position;
    if (paid && snap(l.style) !== snap(o.style)) diff.style = l.style;
    if (Object.keys(diff).length) updates.push({ id: l.id, ...diff });
  }
  const keep = new Set(state.links.map((l) => l.id));
  const deletes = Object.keys(state.orig.links).filter((id) => !keep.has(id));
  return { profile, inserts, updates, deletes };
}

export function isDirty(state) {
  const p = toSavePayload(state);
  return Object.keys(p.profile).length > 0 || p.inserts.length > 0 || p.updates.length > 0 || p.deletes.length > 0;
}
