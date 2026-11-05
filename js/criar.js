import { getClient, requireSession } from "./auth.js";
import { validateUsername } from "../lib/username.js";
import { LINK_TYPES, buildHref } from "../lib/linktypes.js";
import { FREE_LINK_LIMIT } from "../lib/plan.js";
import { initialState, toggleNetwork, setValue, addExtra, removeExtra, setField, toPayload } from "../lib/wizard-state.js";
import { clampOffset, cropSource } from "../lib/image.js";
import { renderPage, inkOn } from "../lib/render-page.js";
import { BG_PALETTE, BTN_PALETTE } from "../lib/palettes.js";

const $ = (id) => document.getElementById(id);
const TOTAL_STEPS = 5;
const USERNAME_MSG = {
  curto: "Mínimo 3 caracteres.",
  largo: "Máximo 30 caracteres.",
  caracteres: "Solo minúsculas, números y guiones.",
  borde: "No puede empezar ni terminar con guion.",
  reservado: "Ese nombre no está disponible.",
};
const FIELD_HINT = {
  instagram: "Tu usuario, por ejemplo @minegocio", tiktok: "Tu usuario, por ejemplo @minegocio",
  whatsapp: "Tu número, por ejemplo 600 000 000", phone: "Tu número, por ejemplo 600 000 000",
  google: "Enlace para dejar reseñas (https://g.page/r/…/review)", facebook: "Enlace de tu página de Facebook",
  website: "Dirección de tu web", youtube: "Enlace de tu canal",
};

let sb, userId;
let state = initialState();
let step = 1;
let usernameOk = false;
let uploading = false;
let publishing = false;

function ayuda(id, texto, tipo) {
  const el = $(id);
  el.textContent = texto;
  el.className = "ayuda" + (tipo ? " " + tipo : "");
}
const total = () => state.selected.length + state.extras.length;

/* ---------- Vista previa (misma función que genera la página real) ---------- */
let previewTimer;
function updatePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const { profile, links } = toPayload(state, "preview");
    $("previa").srcdoc = renderPage({ ...profile, name: profile.name || "Tu negocio", bio: profile.bio || "Una frase sobre tu negocio" }, links);
  }, 120);
}

/* ---------- Navegación ---------- */
function canNext() {
  if (uploading || publishing) return false;
  if (step === 1) return usernameOk;
  if (step === 2) return state.selected.length >= 1;
  if (step === 3) return state.selected.every((t) => buildHref(t, state.values[t]));
  if (step === 4) return state.name.trim().length > 0;
  return true;
}
function updateNav() {
  $("siguiente").disabled = !canNext();
  $("siguiente").textContent = publishing ? "Publicando…" : step === TOTAL_STEPS ? "Publicar mi página" : "Siguiente";
  $("atras").classList.toggle("oculto", step === 1);
}
function goStep(n) {
  step = n;
  for (let i = 1; i <= TOTAL_STEPS; i++) $("paso-" + i).hidden = i !== n;
  [...$("progreso").children].forEach((el, i) => el.classList.toggle("hecho", i < n));
  $("paso-n").textContent = `Paso ${n} de ${TOTAL_STEPS}`;
  if (n === 3) renderFields();
  updateNav();
  updatePreview();
  const h = $("paso-" + n).querySelector("h2");
  if (h) h.focus({ preventScroll: false });
}

/* ---------- Paso 1: usuario ---------- */
let userTimer, checkId = 0;
function onUsernameInput() {
  clearTimeout(userTimer);
  const id = ++checkId; // invalida cualquier comprobación anterior, también cuando salimos antes por un error de formato
  usernameOk = false;
  updateNav();
  const raw = $("usuario").value;
  if (!raw.trim()) return ayuda("ayuda-usuario", "Minúsculas, números y guiones (3 a 30 caracteres).");
  const v = validateUsername(raw);
  if (!v.ok) return ayuda("ayuda-usuario", USERNAME_MSG[v.reason], "err");
  ayuda("ayuda-usuario", "Comprobando…");
  userTimer = setTimeout(async () => {
    const { data, error } = await sb.rpc("username_available", { u: v.value });
    if (id !== checkId || $("usuario").value.trim() !== v.value) return; // llegó tarde: la persona ya escribió otra cosa
    if (error) return ayuda("ayuda-usuario", "No pudimos comprobarlo. Inténtalo de nuevo.", "err");
    if (!data) return ayuda("ayuda-usuario", "Ese nombre ya está en uso.", "err");
    usernameOk = true;
    state = setField(state, "username", v.value);
    ayuda("ayuda-usuario", `Disponible: ophiel.es/all2/${v.value}`, "ok");
    updateNav();
    updatePreview();
  }, 350);
}

/* ---------- Paso 2: redes ---------- */
function buildNetworkGrid() {
  $("redes-grid").innerHTML = Object.entries(LINK_TYPES)
    .map(([type, t]) => `<button type="button" class="red-op" data-type="${type}" aria-pressed="false"><span class="bolha">${t.icon}</span><span>${t.label}</span></button>`)
    .join("");
  $("redes-grid").addEventListener("click", (e) => {
    const btn = e.target.closest(".red-op");
    if (!btn) return;
    state = toggleNetwork(state, btn.dataset.type);
    refreshNetworks();
  });
}
/** No plano grátis os ícones usan el color de botón elegido: cambian cuando la persona cambia el color. */
function paintBubbles() {
  for (const b of document.querySelectorAll("#redes-grid .bolha")) {
    b.style.background = state.btnColor;
    b.style.color = inkOn(state.btnColor);
  }
}
function refreshNetworks() {
  paintBubbles();
  for (const btn of $("redes-grid").children) btn.setAttribute("aria-pressed", String(state.selected.includes(btn.dataset.type)));
  $("contador-2").innerHTML = `<strong>${total()}</strong> de ${FREE_LINK_LIMIT} botones`;
  $("aviso-limite").classList.toggle("oculto", state.notice !== "limite");
  updateNav();
  updatePreview();
}

/* ---------- Paso 3: datos de cada red + enlaces extra ---------- */
function renderFields() {
  const box = $("campos-redes");
  box.innerHTML = "";
  for (const type of state.selected) {
    const t = LINK_TYPES[type];
    const wrap = document.createElement("div");
    wrap.className = "campo";
    const id = "campo-" + type;
    wrap.innerHTML = `<label for="${id}">${t.label}</label><input id="${id}" type="${t.input === "phone" ? "tel" : "text"}" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${t.placeholder}"><p class="ayuda" id="ayuda-${id}">${FIELD_HINT[type]}</p>`;
    const input = wrap.querySelector("input");
    input.value = state.values[type] || "";
    input.addEventListener("input", () => {
      state = setValue(state, type, input.value);
      const ok = input.value.trim() === "" || buildHref(type, input.value);
      ayuda("ayuda-" + id, ok ? FIELD_HINT[type] : "Este enlace no parece válido.", ok ? "" : "err");
      updateNav();
      updatePreview();
    });
    box.append(wrap);
  }
  refreshExtras();
}
function refreshExtras() {
  const list = $("extras-lista");
  list.innerHTML = "";
  state.extras.forEach((url, i) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = url;
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", "Quitar enlace " + url);
    b.textContent = "×";
    b.addEventListener("click", () => { state = removeExtra(state, i); refreshExtras(); });
    li.append(span, b);
    list.append(li);
  });
  $("contador-3").innerHTML = `<strong>${total()}</strong> de ${FREE_LINK_LIMIT} botones`;
  $("extra-add").disabled = total() >= FREE_LINK_LIMIT;
  updateNav();
  updatePreview();
}
function onAddExtra() {
  const raw = $("extra-url").value;
  if (!raw.trim()) return;
  if (!buildHref("website", raw)) return ayuda("ayuda-extra", "Escribe un enlace válido (empieza por https:// o es una dirección web).", "err");
  state = addExtra(state, raw.trim());
  if (state.notice === "limite") return ayuda("ayuda-extra", "Con la página gratis tienes hasta 5 botones.", "err");
  $("extra-url").value = "";
  ayuda("ayuda-extra", "");
  refreshExtras();
}

/* ---------- Paso 4: foto (con encuadre), nombre y descripción ---------- */
let photoBmp = null; // la última foto elegida, para poder volver a encuadrarla
const crop = { zoom: 1, ox: 0, oy: 0, V: 260 };

function drawCrop(canvas, bmp, size) {
  const { sx, sy, sw } = cropSource(bmp.width, bmp.height, crop.V, crop.zoom, crop.ox, crop.oy);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(bmp, sx, sy, sw, sw, 0, 0, size, size);
}
function redrawCrop() {
  const c = $("recorte-canvas");
  const o = clampOffset(photoBmp.width, photoBmp.height, crop.V, crop.zoom, crop.ox, crop.oy);
  crop.ox = o.ox;
  crop.oy = o.oy;
  drawCrop(c, photoBmp, c.width);
}
function openCropper(bmp) {
  photoBmp = bmp;
  crop.zoom = 1; crop.ox = 0; crop.oy = 0;
  $("recorte-zoom").value = "1";
  $("perfil-form").hidden = true;
  $("nav-pasos").hidden = true;
  $("recorte").hidden = false;
  crop.V = $("recorte-vp").clientWidth || 260;
  $("recorte-canvas").width = $("recorte-canvas").height = Math.round(crop.V * 2);
  redrawCrop();
  $("recorte-vp").focus();
}
function closeCropper() {
  $("recorte").hidden = true;
  $("perfil-form").hidden = false;
  $("nav-pasos").hidden = false;
  $("encuadrar-btn").hidden = !photoBmp;
  updateNav();
}
function setupCropper() {
  const vp = $("recorte-vp");
  let drag = null;
  vp.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; vp.setPointerCapture(e.pointerId); vp.classList.add("arrastrando"); });
  vp.addEventListener("pointermove", (e) => {
    if (!drag) return;
    crop.ox += e.clientX - drag.x;
    crop.oy += e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY };
    redrawCrop();
  });
  const end = () => { drag = null; vp.classList.remove("arrastrando"); };
  vp.addEventListener("pointerup", end);
  vp.addEventListener("pointercancel", end);
  vp.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: [12, 0], ArrowRight: [-12, 0], ArrowUp: [0, 12], ArrowDown: [0, -12] }[e.key];
    if (!step) return;
    e.preventDefault();
    crop.ox += step[0];
    crop.oy += step[1];
    redrawCrop();
  });
  $("recorte-zoom").addEventListener("input", (e) => { crop.zoom = Number(e.target.value); redrawCrop(); });
  $("recorte-cancel").addEventListener("click", closeCropper);
  $("recorte-ok").addEventListener("click", useCroppedPhoto);
  $("encuadrar-btn").addEventListener("click", () => photoBmp && openCropper(photoBmp));
}

async function onPhoto(file) {
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return ayuda("ayuda-foto", "Usa una imagen JPG, PNG o WebP.", "err");
  if (file.size > 12 * 1024 * 1024) return ayuda("ayuda-foto", "La imagen es demasiado grande (máximo 12 MB).", "err");
  try {
    openCropper(await createImageBitmap(file, { imageOrientation: "from-image" }));
  } catch {
    ayuda("ayuda-foto", "No pudimos leer la imagen. Prueba con otra.", "err");
  }
}

async function useCroppedPhoto() {
  const { sw } = cropSource(photoBmp.width, photoBmp.height, crop.V, crop.zoom, crop.ox, crop.oy);
  const side = Math.max(1, Math.round(Math.min(sw, 512)));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  drawCrop(canvas, photoBmp, side);
  closeCropper();
  uploading = true;
  updateNav();
  ayuda("ayuda-foto", "Subiendo…");
  try {
    let blob = await new Promise((res) => canvas.toBlob(res, "image/webp", 0.82));
    if (!blob || blob.type !== "image/webp") blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/avatar.${ext}`;
    const { error } = await sb.storage.from("avatars").upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: "3600" });
    if (error) throw error;
    const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
    state = setField(state, "avatarUrl", url);
    $("foto-prev").style.backgroundImage = `url("${url}")`;
    ayuda("ayuda-foto", "Foto lista.", "ok");
  } catch {
    ayuda("ayuda-foto", "No pudimos subir la foto. Prueba con otra imagen.", "err");
  } finally {
    uploading = false;
    updateNav();
    updatePreview();
  }
}

/* ---------- Paso 5: colores ---------- */
function buildPalette(containerId, colors, field, freeId) {
  const box = $(containerId);
  box.innerHTML = colors.map((c) => `<button type="button" style="background:${c}" data-color="${c}" aria-label="Color ${c}" aria-pressed="false"></button>`).join("");
  const refresh = () => {
    for (const b of box.children) b.setAttribute("aria-pressed", String(b.dataset.color === state[field]));
    $(freeId).value = /^#[0-9a-f]{6}$/i.test(state[field]) ? state[field] : "#000000";
  };
  box.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state = setField(state, field, b.dataset.color);
    refresh();
    paintBubbles();
    updatePreview();
  });
  $(freeId).addEventListener("input", (e) => {
    state = setField(state, field, e.target.value.toLowerCase());
    refresh();
    paintBubbles();
    updatePreview();
  });
  refresh();
}

/* ---------- Publicar ---------- */
async function publish() {
  publishing = true;
  updateNav();
  ayuda("err-5", "");
  const { profile, links } = toPayload(state, userId);
  const payloadLinks = links.map(({ type, url, label, position }) => ({ type, url, label: label ?? null, position }));
  const { error } = await sb.rpc("create_page", { p_profile: profile, p_links: payloadLinks });
  if (error) {
    publishing = false;
    const m = String(error.message || "");
    if (error.code === "23505" || m.includes("username_reservado")) {
      // 23505 también salta si esta cuenta YA tiene página (reintento tras un corte de red, dos pestañas): entonces vamos al panel.
      const { data: mine } = await sb.from("profiles").select("id").eq("id", userId).maybeSingle();
      if (mine) return location.replace("/painel");
      usernameOk = false;
      goStep(1);
      return ayuda("ayuda-usuario", "Ese nombre ya no está disponible. Elige otro.", "err");
    }
    updateNav();
    return ayuda("err-5", m.includes("limite_de_links") ? "Con la página gratis tienes hasta 5 botones." : "No pudimos crear tu página. Inténtalo de nuevo en un momento.", "err");
  }
  // ?n= evita que una respuesta 404 guardada en caché recién antes de crear la página se muestre otra vez.
  location.assign(`/all2/${profile.username}?n=${Date.now()}`);
}

/* ---------- Arranque ---------- */
async function init() {
  sb = getClient();
  const session = await requireSession("/entrar");
  userId = session.user.id;
  const { data: existing } = await sb.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (existing) return location.replace("/painel");

  buildNetworkGrid();
  buildPalette("paleta-fondo", BG_PALETTE, "bgColor", "libre-fondo");
  buildPalette("paleta-botones", BTN_PALETTE, "btnColor", "libre-botones");
  $("usuario").addEventListener("input", onUsernameInput);
  $("extra-add").addEventListener("click", onAddExtra);
  $("extra-url").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); onAddExtra(); } });
  $("foto-btn").addEventListener("click", () => $("foto").click());
  $("foto").addEventListener("change", (e) => { onPhoto(e.target.files[0]); e.target.value = ""; });
  setupCropper();
  $("nombre").addEventListener("input", (e) => { state = setField(state, "name", e.target.value); updateNav(); updatePreview(); });
  $("bio").addEventListener("input", (e) => {
    state = setField(state, "bio", e.target.value);
    $("contador-bio").textContent = `${state.bio.length} / 160`;
    updatePreview();
  });
  $("atras").addEventListener("click", () => goStep(step - 1));
  $("siguiente").addEventListener("click", () => {
    if (!canNext()) return;
    if (step < TOTAL_STEPS) goStep(step + 1);
    else publish();
  });
  refreshNetworks();
  goStep(1);
}

init().catch(() => {
  document.querySelector(".tarjeta").insertAdjacentHTML("afterbegin", '<p class="msg err" role="alert">No pudimos cargar el asistente. Recarga la página.</p>');
});
