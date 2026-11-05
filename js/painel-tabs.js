import { LINK_TYPES } from "../lib/linktypes.js";
import { isLocked } from "../lib/plan.js";
import { DAYS, validateHours } from "../lib/hours.js";
import { BG_PALETTE, BTN_PALETTE } from "../lib/palettes.js";
import { LOGO_RANGE, setProfileField, setLinkStyle, addLink, updateLink, moveLink, removeLink, displayValue } from "../lib/panel-state.js";
import { checkImageFile, fileToBitmap, canvasToBlobUnder, backgroundBlob, logoBlob, AVATAR_MAX_BYTES } from "./image-io.js";
import { cropSquare } from "./cropper.js";

/** Elemento DOM con texto siempre como texto (nunca HTML): los datos del usuario no pueden inyectar nada. */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value" || k === "checked" || k === "disabled" || k === "hidden") el[k] = k === "value" ? v : !!v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

export const TABS = [
  { id: "tema", label: "Tema" },
  { id: "botones", label: "Botones" },
  { id: "fondo", label: "Fondo", feature: "bgImage" },
  { id: "horario", label: "Horario", feature: "hours" },
  { id: "ubicacion", label: "Ubicación", feature: "address" },
  { id: "contacto", label: "Contacto", feature: "vcard" },
  { id: "stats", label: "Estadísticas", feature: "stats" },
];

const LOCK_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
export const lockIcon = () => icon(LOCK_SVG);
const icon = (svg) => { const s = h("span", { class: "ico-mini", "aria-hidden": "true" }); s.innerHTML = svg; return s; };

function lockedCard(ctx, title, text) {
  return h("div", { class: "bloqueado" },
    h("div", { class: "bloqueado-t" }, icon(LOCK_SVG), h("strong", {}, title)),
    h("p", { class: "sub" }, text),
    h("button", { class: "btn btn-oro", type: "button", onclick: ctx.upgrade }, "Pasar a Personalizado"));
}

const field = (label, input, help) => h("div", { class: "campo" }, h("label", { for: input.id }, label), input, help || null);
const fieldId = (() => { let n = 0; return () => `p-${++n}`; })();

/* ---------------- Tema ---------------- */
const HEX6 = /^#[0-9a-f]{6}$/i;

function colorPicker(ctx, label, key, palette) {
  const cur = () => ctx.state().profile[key];
  const wrap = h("div", { class: "campo" }, h("label", {}, label));
  const row = h("div", { class: "paleta", role: "group", "aria-label": label });
  const free = h("input", { type: "color", id: fieldId(), value: HEX6.test(cur()) ? cur() : "#000000", "aria-label": `${label}: color libre` });
  const hex = h("input", { type: "text", id: fieldId(), maxlength: 7, value: cur(), class: "hex", autocomplete: "off", spellcheck: "false", "aria-label": `${label}: código hexadecimal` });
  const paint = () => {
    for (const b of row.children) b.setAttribute("aria-pressed", String(b.dataset.c.toLowerCase() === String(cur()).toLowerCase()));
    if (HEX6.test(cur())) free.value = cur();
    hex.value = cur();
  };
  for (const c of palette) {
    row.append(h("button", { type: "button", "data-c": c, style: `background:${c}`, "aria-label": c, "aria-pressed": "false",
      onclick: () => { ctx.apply((s) => setProfileField(s, key, c)); paint(); } }));
  }
  free.addEventListener("input", () => { ctx.apply((s) => setProfileField(s, key, free.value)); paint(); });
  hex.addEventListener("change", () => {
    const v = hex.value.trim().startsWith("#") ? hex.value.trim() : "#" + hex.value.trim();
    ctx.apply((s) => setProfileField(s, key, v));
    paint();
  });
  wrap.append(row, h("div", { class: "color-libre" }, h("label", { for: free.id }, "Otro color (RGB)"), free, hex));
  paint();
  return wrap;
}

/** Grupo de opciones (radio) para un campo de texto del perfil. */
function choice(ctx, legend, key, options) {
  const name = fieldId();
  const cur = () => ctx.state().profile[key];
  return h("fieldset", { class: "opciones" }, h("legend", {}, legend), options.map(([value, text, hint]) => {
    const r = h("input", { type: "radio", name, id: fieldId(), value, checked: cur() === value });
    r.addEventListener("change", () => { if (r.checked) { ctx.apply((s) => setProfileField(s, key, value)); ctx.afterChoice?.(key); } });
    return h("label", { class: "opcion", for: r.id }, r, h("span", {}, text, hint ? h("small", {}, hint) : null));
  }));
}

/** Deslizador para un campo numérico del perfil, con el valor al lado. */
function slider(ctx, key, label, text) {
  const [min, max] = LOGO_RANGE[key];
  const id = fieldId();
  const cur = ctx.state().profile[key] ?? LOGO_RANGE[key][2];
  const out = h("output", { for: id }, text(cur));
  const range = h("input", { type: "range", id, min, max, step: 1, value: cur });
  range.addEventListener("input", () => { out.textContent = text(Number(range.value)); ctx.apply((st) => setProfileField(st, key, Number(range.value))); });
  return h("div", { class: "campo" }, h("label", { for: id }, label, ": ", out), range);
}

function logoAdjust(ctx) {
  const box = h("fieldset", { class: "ajustes-logo" }, h("legend", {}, "Ajusta tu logo"),
    h("p", { class: "ayuda" }, "No siempre la imagen sale centrada: tócalo hasta que quede bien en la vista previa."),
    slider(ctx, "logo_size", "Tamaño", (v) => `${v} %`),
    slider(ctx, "logo_x", "Izquierda ‹ › derecha", (v) => (v === 0 ? "centro" : v < 0 ? `‹ ${-v} %` : `${v} % ›`)),
    slider(ctx, "logo_y", "Arriba ‹ › abajo", (v) => (v === 0 ? "centro" : v < 0 ? `↑ ${-v}` : `↓ ${v}`)),
    h("button", { class: "btn-texto", type: "button", onclick: () => {
      for (const k of Object.keys(LOGO_RANGE)) ctx.apply((st) => setProfileField(st, k, LOGO_RANGE[k][2]));
      ctx.rerender();
    } }, "Volver al tamaño y posición originales"));
  return box;
}

function themeTab(ctx) {
  const s = ctx.state();
  const paid = !isLocked("logo", s.plan);
  const prev = h("div", { class: "foto-prev", role: "img", "aria-label": "Imagen actual" });
  const paintPhoto = () => {
    const st = ctx.state().profile;
    const u = st.avatar_url;
    prev.style.backgroundImage = u && /^https:\/\//.test(u) ? `url("${u.replace(/["\\]/g, "")}")` : "";
    prev.classList.toggle("logo", paid && st.avatar_shape !== "circle");
  };
  const help = h("p", { class: "ayuda", "aria-live": "polite" });
  const file = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "oculto", id: fieldId() });
  file.addEventListener("change", async () => {
    const f = file.files[0];
    file.value = "";
    const bad = checkImageFile(f);
    if (bad) { if (bad !== "no_file") { help.className = "ayuda err"; help.textContent = bad === "tipo" ? "Usa una imagen JPG, PNG o WebP." : "La imagen es demasiado grande (máximo 12 MB)."; } return; }
    try {
      const asLogo = paid && ctx.state().profile.avatar_shape !== "circle";
      const bmp = await fileToBitmap(f);
      let blob;
      if (asLogo) {
        help.className = "ayuda"; help.textContent = "Subiendo…";
        blob = await logoBlob(bmp);          // entero, sin recorte, con su transparencia
      } else {
        const canvas = await cropSquare(bmp);
        if (!canvas) return;
        help.className = "ayuda"; help.textContent = "Subiendo…";
        blob = await canvasToBlobUnder(canvas, AVATAR_MAX_BYTES);
      }
      if (!blob) throw new Error("grande");
      const ext = { "image/webp": "webp", "image/png": "png" }[blob.type] || "jpg";
      const path = `${ctx.userId}/avatar.${ext}`;
      const { error } = await ctx.sb.storage.from("avatars").upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: "3600" });
      if (error) throw error;
      const url = ctx.sb.storage.from("avatars").getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
      ctx.apply((st) => setProfileField(st, "avatar_url", url));
      paintPhoto();
      help.className = "ayuda ok"; help.textContent = "Imagen lista. Pulsa Guardar para publicarla.";
    } catch {
      help.className = "ayuda err"; help.textContent = "No pudimos subir la imagen. Prueba con otra.";
    }
  });
  paintPhoto();
  const adjust = paid ? logoAdjust(ctx) : null;
  const showAdjust = () => { if (adjust) adjust.hidden = ctx.state().profile.avatar_shape === "circle"; };
  showAdjust();
  const shapeBox = paid
    ? choice({ ...ctx, afterChoice: () => { paintPhoto(); showAdjust(); } }, "Cómo se muestra tu imagen", "avatar_shape", [
        ["circle", "Foto redonda", "Se recorta en círculo: ideal para fotos."],
        ["logo", "Logo completo", "Sube tu PNG: se ve entero, sin recortar, con tu nombre debajo."],
        ["logo_only", "Logo grande, sin nombre", "Cuando tu logo ya incluye el nombre del negocio."]])
    : h("button", { class: "btn-texto bloq-mini", type: "button", onclick: ctx.upgrade }, icon(LOCK_SVG), " Logo PNG sin recorte: Personalizado");
  const nameIn = h("input", { type: "text", id: fieldId(), maxlength: 80, value: s.profile.name || "", autocomplete: "off" });
  nameIn.addEventListener("input", () => ctx.apply((st) => setProfileField(st, "name", nameIn.value)));
  const bioIn = h("textarea", { id: fieldId(), maxlength: 160, rows: 3 });
  bioIn.value = s.profile.bio || "";
  const count = h("p", { class: "contador-bio" }, `${bioIn.value.length}/160`);
  bioIn.addEventListener("input", () => { count.textContent = `${bioIn.value.length}/160`; ctx.apply((st) => setProfileField(st, "bio", bioIn.value)); });
  const btnMode = !isLocked("btnStyle", s.plan)
    ? choice(ctx, "Color de los botones", "btn_style", [
        ["brand", "Colores de cada red", "Instagram, WhatsApp… cada uno con su color oficial."],
        ["color", "Un solo color (el que elijas)", "Todos los botones con el acabado premium en tu color."]])
    : null;
  const ring = !isLocked("ring", s.plan)
    ? (() => {
        const chk = h("input", { type: "checkbox", id: fieldId(), checked: s.profile.show_ring !== false });
        chk.addEventListener("change", () => ctx.apply((st) => setProfileField(st, "show_ring", chk.checked)));
        return h("div", { class: "campo" }, h("label", { class: "check", for: chk.id }, chk, " Anillo de luz girando alrededor de la página"));
      })()
    : h("button", { class: "btn-texto bloq-mini", type: "button", onclick: ctx.upgrade }, icon(LOCK_SVG), " Anillo de luz y logo ajustable: Personalizado");
  return h("div", {},
    h("div", { class: "foto-fila" }, prev, h("div", {}, file, h("button", { class: "btn", type: "button", onclick: () => file.click() }, paid ? "Cambiar imagen" : "Cambiar foto"), help)),
    shapeBox,
    adjust,
    field("Nombre", nameIn),
    field("Descripción", bioIn, count),
    colorPicker(ctx, "Color de fondo", "bg_color", BG_PALETTE),
    btnMode,
    colorPicker(ctx, paid ? "Tu color de botones (RGB)" : "Color de los botones", "btn_color", BTN_PALETTE),
    ring);
}

/* ---------------- Botones ---------------- */
function linkRow(ctx, l, i, total) {
  const s = ctx.state();
  const meta = Object.hasOwn(LINK_TYPES, l.type) ? LINK_TYPES[l.type] : LINK_TYPES.website;
  const paid = !isLocked("linkStyle", s.plan);
  const hidden = s.plan === "free" && i >= 5;
  const bubble = h("span", { class: "bolha", style: `background:${meta.generic ? "var(--oro)" : meta.bg}` });
  bubble.innerHTML = meta.icon;
  const valueIn = h("input", { type: "text", id: fieldId(), value: displayValue(l), autocomplete: "off", autocapitalize: "none", spellcheck: "false" });
  valueIn.addEventListener("change", () => {
    const st = ctx.apply((x) => updateLink(x, l.id, { value: valueIn.value }));
    if (st.notice) valueIn.value = displayValue(st.links.find((k) => k.id === l.id));
  });
  const parts = [field("Enlace", valueIn)];
  if (l.type === "website" || paid) {
    const labelIn = h("input", { type: "text", id: fieldId(), maxlength: 40, value: l.label || "", placeholder: meta.label, autocomplete: "off" });
    labelIn.addEventListener("input", () => ctx.apply((x) => updateLink(x, l.id, { label: labelIn.value })));
    parts.push(field("Texto del botón", labelIn));
  }
  if (paid) {
    const st = l.style || {};
    const color = h("input", { type: "color", id: fieldId(), value: st.color || "#ffffff", "aria-label": "Color del botón" });
    const upd = (patch) => ctx.apply((x) => setLinkStyle(x, l.id, { ...(x.links.find((k) => k.id === l.id).style || {}), ...patch }));
    color.addEventListener("input", () => upd({ color: color.value }));
    const glow = h("input", { type: "checkbox", id: fieldId(), checked: st.glow !== false });
    glow.addEventListener("change", () => upd({ glow: glow.checked }));
    const feat = h("input", { type: "checkbox", id: fieldId(), checked: st.featured === true });
    feat.addEventListener("change", () => upd({ featured: feat.checked }));
    parts.push(h("details", { class: "estilo" }, h("summary", {}, "Estilo del botón"),
      h("div", { class: "estilo-fila" }, h("label", { for: color.id }, "Color"), color,
        h("button", { class: "btn-texto", type: "button", onclick: () => { ctx.apply((x) => { const cur = { ...(x.links.find((k) => k.id === l.id).style || {}) }; delete cur.color; return setLinkStyle(x, l.id, cur); }); ctx.rerender(); } }, "Usar el color de la red")),
      h("label", { class: "check", for: glow.id }, glow, " Brillo de color"),
      h("label", { class: "check", for: feat.id }, feat, " Destacado (más grande y animado)")));
  } else {
    parts.push(h("button", { class: "btn-texto bloq-mini", type: "button", onclick: ctx.upgrade }, icon(LOCK_SVG), " Estilo del botón: Personalizado"));
  }
  const small = (txt, label, fn, dis, act) => h("button", { class: "mini", type: "button", "aria-label": label, "data-act": act, "data-id": l.id, disabled: dis, onclick: fn }, txt);
  const keep = (act) => `button[data-id="${l.id}"][data-act="${act}"]:not([disabled])`;
  return h("li", { class: "fila-link" + (hidden ? " oculta" : "") },
    h("div", { class: "fila-cab" }, bubble, h("strong", {}, l.label || meta.label), hidden ? h("span", { class: "etiqueta" }, "Oculto") : null,
      h("div", { class: "fila-acc" },
        small("↑", "Subir", () => { ctx.apply((x) => moveLink(x, l.id, "up")); ctx.rerender([keep("up"), keep("down")]); }, i === 0, "up"),
        small("↓", "Bajar", () => { ctx.apply((x) => moveLink(x, l.id, "down")); ctx.rerender([keep("down"), keep("up")]); }, i === total - 1, "down"),
        small("✕", "Quitar este botón", () => { ctx.apply((x) => removeLink(x, l.id)); ctx.rerender(".fila-link .mini[data-act=remove]"); }, false, "remove"))),
    ...parts);
}

function linksTab(ctx) {
  const s = ctx.state();
  const paid = !isLocked("moreLinks", s.plan);
  const list = h("ul", { class: "lista-links" }, s.links.map((l, i) => linkRow(ctx, l, i, s.links.length)));
  const sel = h("select", { id: fieldId() }, Object.entries(LINK_TYPES).map(([k, m]) => h("option", { value: k }, m.label)));
  const val = h("input", { type: "text", id: fieldId(), autocomplete: "off", autocapitalize: "none", spellcheck: "false" });
  const lab = h("input", { type: "text", id: fieldId(), maxlength: 40, autocomplete: "off", placeholder: "Ej.: Carta del día" });
  const labBox = field("Texto del botón (opcional)", lab);
  const sync = () => { val.placeholder = LINK_TYPES[sel.value].placeholder || ""; labBox.hidden = !(sel.value === "website" || paid); };
  sel.addEventListener("change", sync);
  sync();
  const add = h("button", { class: "btn", type: "button", onclick: () => {
    const st = ctx.apply((x) => addLink(x, { type: sel.value, value: val.value, label: lab.value }));
    if (!st.notice) ctx.rerender();
  } }, "Añadir botón");
  const full = !paid && s.links.length >= 5;
  return h("div", {},
    s.hiddenCount > 0 ? h("p", { class: "aviso" }, `Tu página gratis muestra solo los 5 primeros botones. ${s.hiddenCount} ${s.hiddenCount === 1 ? "está oculto" : "están ocultos"} y se guardan: vuelven a aparecer con el plan Personalizado.`) : null,
    s.links.length ? list : h("p", { class: "sub" }, "Todavía no tienes botones."),
    h("h3", { class: "sec" }, "Añadir un botón"),
    full ? h("div", {}, h("p", { class: "aviso" }, "Con la página gratis tienes hasta 5 botones. Quita uno o pasa a Personalizado para botones ilimitados."), h("button", { class: "btn btn-oro", type: "button", onclick: ctx.upgrade }, "Pasar a Personalizado"))
         : h("div", {}, field("Tipo", sel), field("Enlace", val), labBox, add));
}

/* ---------------- Fondo ---------------- */
function backgroundTab(ctx) {
  const s = ctx.state();
  if (isLocked("bgImage", s.plan)) return lockedCard(ctx, "Imagen de fondo", "Pon una foto de fondo en tu página y difumínala del 0 al 100 %. Incluido en el plan Personalizado.");
  const help = h("p", { class: "ayuda", "aria-live": "polite" });
  const thumb = h("div", { class: "fondo-prev", role: "img", "aria-label": "Imagen de fondo actual" });
  const paintThumb = () => {
    const u = ctx.state().profile.bg_image_url;
    thumb.style.backgroundImage = u && /^https:\/\//.test(u) ? `url("${u.replace(/["\\]/g, "")}")` : "";
    thumb.hidden = !u;
    rm.hidden = !u;
  };
  const file = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "oculto", id: fieldId() });
  const rm = h("button", { class: "btn-texto", type: "button", onclick: () => { ctx.apply((st) => setProfileField(st, "bg_image_url", null)); paintThumb(); help.textContent = ""; } }, "Quitar imagen");
  file.addEventListener("change", async () => {
    const f = file.files[0];
    file.value = "";
    const bad = checkImageFile(f);
    if (bad) { if (bad !== "no_file") { help.className = "ayuda err"; help.textContent = bad === "tipo" ? "Usa una imagen JPG, PNG o WebP." : "La imagen es demasiado grande (máximo 12 MB)."; } return; }
    try {
      help.className = "ayuda"; help.textContent = "Preparando y subiendo…";
      const blob = await backgroundBlob(await fileToBitmap(f));
      if (!blob) throw new Error("grande");
      const path = `${ctx.userId}/bg.${blob.type === "image/webp" ? "webp" : "jpg"}`;
      const { error } = await ctx.sb.storage.from("backgrounds").upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: "3600" });
      if (error) throw error;
      const url = ctx.sb.storage.from("backgrounds").getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
      ctx.apply((st) => setProfileField(st, "bg_image_url", url));
      paintThumb();
      help.className = "ayuda ok"; help.textContent = "Imagen lista. Pulsa Guardar para publicarla.";
    } catch {
      help.className = "ayuda err"; help.textContent = "No pudimos subir la imagen. Prueba con otra.";
    }
  });
  const blurVal = s.profile.bg_blur ?? 0;
  const out = h("output", { for: "bg-blur" }, `${blurVal} %`);
  const range = h("input", { type: "range", id: "bg-blur", min: 0, max: 100, step: 1, value: blurVal });
  range.addEventListener("input", () => { out.textContent = `${range.value} %`; ctx.apply((st) => setProfileField(st, "bg_blur", Number(range.value))); });
  paintThumb();
  return h("div", {}, thumb, file,
    h("div", { class: "foto-botones" }, h("button", { class: "btn", type: "button", onclick: () => file.click() }, "Elegir imagen"), rm), help,
    h("div", { class: "campo" }, h("label", { for: "bg-blur" }, "Desenfoque: ", out), range,
      h("p", { class: "ayuda" }, "0 % deja la foto nítida; 100 % la difumina del todo (útil para que se lean bien los botones).")));
}

/* ---------------- Horario ---------------- */
const DAY_NAMES = { mon: "Lunes", tue: "Martes", wed: "Miércoles", thu: "Jueves", fri: "Viernes", sat: "Sábado", sun: "Domingo" };
const ZONES = [["Europe/Madrid", "Península y Baleares"], ["Atlantic/Canary", "Canarias"]];

function hoursTab(ctx) {
  const s = ctx.state();
  if (isLocked("hours", s.plan)) return lockedCard(ctx, "Horario de apertura", "Muestra «Abierto ahora» o «Cerrado» en tu página según tu horario. Incluido en el plan Personalizado.");
  // modelo local: día -> [[abre, cierra], ...] (puede tener huecos mientras se escribe)
  const saved = validateHours(s.profile.hours); // si hay datos corruptos en el servidor, se parte de un horario vacío
  const model = Object.fromEntries(DAYS.map((d) => [d, ((saved.ok && saved.value?.[d]) || []).map((p) => [...p])]));
  const wrap = h("div", {});
  const help = h("p", { class: "ayuda", "aria-live": "polite" });
  const commit = () => {
    const obj = {};
    let partial = false;
    for (const d of DAYS) {
      const done = model[d].filter((p) => p[0] && p[1]);
      if (done.length !== model[d].length) partial = true;
      if (done.length) obj[d] = done;
    }
    help.className = "ayuda";
    help.textContent = partial ? "Completa la hora de apertura y de cierre de cada tramo." : "";
    const st = ctx.apply((x) => setProfileField(x, "hours", Object.keys(obj).length ? obj : null));
    if (st.notice === "horario") { help.className = "ayuda err"; help.textContent = "Revisa las horas: apertura y cierre no pueden ser iguales."; }
  };
  const draw = () => {
    wrap.replaceChildren(...DAYS.map((d) => {
      const open = model[d].length > 0;
      const chk = h("input", { type: "checkbox", id: fieldId(), checked: open });
      chk.addEventListener("change", () => { model[d] = chk.checked ? [["09:00", "14:00"]] : []; commit(); draw(); });
      const rows = model[d].map((p, i) => {
        const a = h("input", { type: "time", value: p[0], "aria-label": `${DAY_NAMES[d]}: abre (tramo ${i + 1})` });
        const b = h("input", { type: "time", value: p[1], "aria-label": `${DAY_NAMES[d]}: cierra (tramo ${i + 1})` });
        a.addEventListener("change", () => { p[0] = a.value; commit(); });
        b.addEventListener("change", () => { p[1] = b.value; commit(); });
        return h("div", { class: "tramo" }, a, h("span", {}, "–"), b,
          h("button", { class: "mini", type: "button", "aria-label": `Quitar tramo ${i + 1} del ${DAY_NAMES[d].toLowerCase()}`, onclick: () => { model[d].splice(i, 1); commit(); draw(); } }, "✕"));
      });
      return h("div", { class: "dia" },
        h("label", { class: "check dia-n", for: chk.id }, chk, ` ${DAY_NAMES[d]}`),
        open ? h("div", { class: "tramos" }, rows, model[d].length < 3 ? h("button", { class: "btn-texto", type: "button", onclick: () => { model[d].push(["17:00", "20:00"]); commit(); draw(); } }, "+ Añadir tramo") : null) : h("span", { class: "cerrado" }, "Cerrado"));
    }));
  };
  draw();
  const tz = h("select", { id: fieldId() }, ZONES.map(([v, t]) => h("option", { value: v, selected: v === s.profile.timezone }, t)));
  tz.addEventListener("change", () => ctx.apply((x) => setProfileField(x, "timezone", tz.value)));
  return h("div", {}, wrap,
    h("button", { class: "btn-texto", type: "button", onclick: () => { for (const d of ["tue", "wed", "thu", "fri"]) model[d] = model.mon.map((p) => [...p]); commit(); draw(); } }, "Copiar el horario del lunes a martes–viernes"),
    help, field("Zona horaria", tz),
    h("p", { class: "ayuda" }, "Si cierras de madrugada, pon la hora de cierre del día siguiente (por ejemplo 20:00 – 02:00)."));
}

/* ---------------- Ubicación y contacto ---------------- */
function addressTab(ctx) {
  const s = ctx.state();
  if (isLocked("address", s.plan)) return lockedCard(ctx, "Dirección y Google Maps", "Muestra tu dirección y un botón «Cómo llegar» que abre Google Maps. Incluido en el plan Personalizado.");
  const inp = h("input", { type: "text", id: fieldId(), maxlength: 200, value: s.profile.address || "", autocomplete: "off", placeholder: "Calle Mayor 1, 04001 Almería" });
  inp.addEventListener("input", () => ctx.apply((x) => setProfileField(x, "address", inp.value)));
  const map = h("input", { type: "checkbox", id: fieldId(), checked: s.profile.show_map !== false });
  map.addEventListener("change", () => ctx.apply((x) => setProfileField(x, "show_map", map.checked)));
  return h("div", {}, field("Dirección", inp, h("p", { class: "ayuda" }, "Aparece bajo tu nombre y en «Cómo llegar» (Google Maps). Déjala vacía para ocultarlo.")),
    h("label", { class: "check", for: map.id }, map, " Mostrar el mapa dentro de la página"),
    h("p", { class: "ayuda" }, "Si lo desactivas, solo queda el botón «Cómo llegar»."));
}

function contactTab(ctx) {
  const s = ctx.state();
  if (isLocked("vcard", s.plan)) return lockedCard(ctx, "Guardar contacto", "Un botón para que tus clientes guarden tu contacto en el móvil con un toque. Incluido en el plan Personalizado.");
  const chk = h("input", { type: "checkbox", id: fieldId(), checked: s.profile.show_vcard === true });
  chk.addEventListener("change", () => ctx.apply((x) => setProfileField(x, "show_vcard", chk.checked)));
  return h("div", {}, h("label", { class: "check", for: chk.id }, chk, " Mostrar el botón «Guardar contacto»"),
    h("p", { class: "ayuda" }, "El contacto incluye tu nombre, el primer teléfono o WhatsApp, tu web y tu dirección."));
}

/* ---------------- Estadísticas ---------------- */
function statsTab(ctx) {
  const s = ctx.state();
  if (isLocked("stats", s.plan)) return lockedCard(ctx, "Estadísticas de clics", "Mira cuántas personas tocan cada botón. Incluido en el plan Personalizado.");
  const box = h("div", { "aria-live": "polite" }, h("p", { class: "sub" }, "Cargando…"));
  ctx.sb.rpc("my_stats", { p_days: 30 }).then(({ data, error }) => {
    if (error) { box.replaceChildren(h("p", { class: "ayuda err" }, "No pudimos cargar las estadísticas. Inténtalo de nuevo en un momento.")); return; }
    const byLink = new Map();
    for (const r of data || []) {
      const cur = byLink.get(r.link_id) || { label: r.label, type: r.type, n: 0 };
      cur.n += Number(r.n) || 0;
      byLink.set(r.link_id, cur);
    }
    const rows = [...byLink.values()];
    const total = rows.reduce((a, r) => a + r.n, 0);
    const max = Math.max(1, ...rows.map((r) => r.n));
    if (!rows.length) { box.replaceChildren(h("p", { class: "sub" }, "Todavía no tienes botones.")); return; }
    box.replaceChildren(
      h("p", { class: "contador" }, "Últimos 30 días: ", h("strong", {}, `${total} ${total === 1 ? "clic" : "clics"}`)),
      total === 0 ? h("p", { class: "sub" }, "Aún no hay clics. Aparecerán aquí cuando alguien toque tus botones.") : null,
      h("ul", { class: "stats" }, rows.map((r) => {
        const name = r.label || (LINK_TYPES[r.type]?.label ?? r.type);
        return h("li", {}, h("span", { class: "stats-n" }, name), h("span", { class: "stats-barra" }, h("i", { style: `width:${Math.round((r.n / max) * 100)}%` })), h("span", { class: "stats-v" }, String(r.n)));
      })));
  });
  return h("div", {}, box);
}

const RENDERERS = { tema: themeTab, botones: linksTab, fondo: backgroundTab, horario: hoursTab, ubicacion: addressTab, contacto: contactTab, stats: statsTab };
export const renderTab = (id, ctx) => RENDERERS[id](ctx);
