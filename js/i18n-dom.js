import { detectLang, makeT } from "../lib/i18n.js";
import { DICT } from "./i18n-dict.js";

const KEY = "ophiel-lang";
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* sin almacenamiento: vale igual */ } };

/**
 * Traduce la página: [data-i18n] = texto, [data-i18n-html] = texto con <em> (solo textos nuestros del diccionario),
 * [data-i18n-attr="placeholder:clave;aria-label:clave"] = atributos, y <html data-i18n-title="clave"> = título.
 * Los botones [data-lang="es|en"] cambian el idioma y lo recuerdan.
 */
export function initI18n(onChange) {
  let lang = detectLang({ search: location.search, stored: read(), nav: navigator.language });
  let t = makeT(DICT, lang);
  const apply = () => {
    t = makeT(DICT, lang);
    document.documentElement.lang = lang;
    for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n, readVars(el));
    for (const el of document.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
    for (const el of document.querySelectorAll("[data-i18n-attr]")) {
      for (const pair of el.dataset.i18nAttr.split(";")) {
        const [attr, key] = pair.split(":");
        if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
      }
    }
    const tk = document.documentElement.dataset.i18nTitle;
    if (tk) document.title = t(tk);
    for (const b of document.querySelectorAll("[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
    onChange?.(lang, t);
  };
  const readVars = (el) => (el.dataset.i18nVars ? JSON.parse(el.dataset.i18nVars) : {});
  for (const b of document.querySelectorAll("[data-lang]")) {
    b.addEventListener("click", () => { lang = b.dataset.lang; write(lang); apply(); });
  }
  apply();
  return { t: (k, v) => t(k, v), lang: () => lang, refresh: apply };
}
