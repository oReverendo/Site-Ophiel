// Idioma (es/en) sin dependencias: lo usan la landing /all2, /entrar y /registro, y los tests.
export const LANGS = ["es", "en"];
export const DEFAULT_LANG = "es";

const norm = (v) => {
  const s = typeof v === "string" ? v.trim().toLowerCase().slice(0, 2) : "";
  return LANGS.includes(s) ? s : null;
};

/** Orden: ?lang= de la URL, idioma guardado, idioma del navegador (cualquier "en-*" = inglés), español. */
export function detectLang({ search = "", stored = null, nav = "" } = {}) {
  let fromUrl = null;
  try { fromUrl = norm(new URLSearchParams(search).get("lang")); } catch { /* búsqueda inválida: se ignora */ }
  return fromUrl || norm(stored) || norm(nav) || DEFAULT_LANG;
}

/** Devuelve t(clave, vars). Falta en el idioma pedido -> español -> la propia clave. {nombre} se sustituye por vars.nombre. */
export function makeT(dict, lang) {
  const pick = (l, key) => (Object.hasOwn(dict[l] || {}, key) ? dict[l][key] : undefined);
  return (key, vars = {}) => {
    const raw = pick(lang, key) ?? pick(DEFAULT_LANG, key) ?? key;
    return String(raw).replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(vars, k) ? String(vars[k]) : m));
  };
}
