import { getClient, requireSession, signOut, friendlyError } from "./auth.js";
import { fromServer, toSavePayload, isDirty } from "../lib/panel-state.js";
import { planFromSubscription, isLocked } from "../lib/plan.js";
import { renderPage } from "../lib/render-page.js";
import { TABS, renderTab, h, lockIcon } from "./painel-tabs.js";

const $ = (id) => document.getElementById(id);
const NOTICES = {
  plan: "Esta función es del plan Personalizado.",
  limite: "Con la página gratis tienes hasta 5 botones.",
  valor: "Revisa el valor: no parece válido.",
  largo: "El texto es demasiado largo.",
  horario: "Revisa las horas.",
  campo: "Ese dato no se puede cambiar.",
};

const sb = getClient();
const session = await requireSession("/entrar");
const userId = session.user.id;

let server = null;     // lo último leído del servidor (para descartar cambios)
let state = null;
let activeTab = "tema";
let saving = false;
let toastTimer;

/* ---------- avisos ---------- */
function say(text, kind = "") {
  const t = $("toast");
  t.textContent = text;
  t.className = "toast" + (kind ? " " + kind : "");
  t.hidden = !text;
  clearTimeout(toastTimer);
  if (text) toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
}

/* ---------- carga ---------- */
async function load() {
  const [p, l, s] = await Promise.all([
    sb.from("profiles").select("*").eq("id", userId).maybeSingle(),
    sb.from("links").select("id,type,url,label,position,style").eq("profile_id", userId).order("position"),
    sb.from("subscriptions").select("status,current_period_end,cancel_at_period_end").eq("profile_id", userId).maybeSingle(),
  ]);
  if (p.error || l.error || s.error) throw new Error("carga");
  if (!p.data) { location.replace("/criar"); return new Promise(() => {}); }
  return { profile: p.data, links: l.data || [], sub: s.data, plan: planFromSubscription(s.data) };
}

function adopt(data) {
  server = data;
  state = fromServer({ profile: data.profile, links: data.links, plan: data.plan });
}

/* ---------- vista previa y barra de guardar ---------- */
let previewTimer;
function updatePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    $("preview").srcdoc = renderPage(state.profile, state.links, state.plan);
  }, 120);
}

function updateBar() {
  const dirty = isDirty(state);
  $("savebar").hidden = !dirty;
  $("guardar").disabled = saving;
}

function renderPlanChip() {
  const chip = $("plan-chip");
  const sub = server.sub;
  const date = sub ? new Date(sub.current_period_end).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "";
  if (state.plan === "personalizado") {
    chip.textContent = sub?.cancel_at_period_end ? `Plan Personalizado · termina el ${date}` : `Plan Personalizado · renueva el ${date}`;
    chip.className = "plan-chip pago";
  } else {
    chip.textContent = "Plan Gratis";
    chip.className = "plan-chip";
  }
}

/* ---------- contexto para las pestañas ---------- */
const ctx = {
  sb, userId,
  state: () => state,
  apply(fn) {
    state = fn(state);
    say(state.notice ? NOTICES[state.notice] || "" : "", state.notice ? "err" : "");
    updatePreview();
    updateBar();
    return state;
  },
  rerender: (focusSel) => drawTab(focusSel),
  upgrade: () => say("La suscripción a Personalizado (9,90 €/mes, IVA incluido) estará disponible muy pronto.", "ok"),
};

/* ---------- pestañas ---------- */
function buildTabs() {
  const list = $("tabs");
  list.replaceChildren(...TABS.map((t) => h("button", { class: "tab", type: "button", role: "tab", id: `tab-${t.id}`, "aria-controls": "tab-body", "data-id": t.id, onclick: () => selectTab(t.id) },
    t.label, t.feature && isLocked(t.feature, state.plan) ? h("span", { class: "tab-lock" }, lockIcon(), h("span", { class: "sr" }, " (plan Personalizado)")) : null)));
  list.addEventListener("keydown", (e) => {
    const i = TABS.findIndex((t) => t.id === activeTab);
    const j = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length : -1;
    if (j < 0) return;
    e.preventDefault();
    selectTab(TABS[j].id);
    $(`tab-${TABS[j].id}`).focus();
  });
}

function drawTab(focusSel) {
  for (const b of $("tabs").children) {
    const on = b.dataset.id === activeTab;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  }
  $("tab-body").setAttribute("aria-labelledby", `tab-${activeTab}`);
  $("tab-body").replaceChildren(renderTab(activeTab, ctx));
  if (focusSel) { // no perder el foco del teclado al redibujar: el primer selector que exista gana
    const el = [].concat(focusSel).map((q) => $("tab-body").querySelector(q)).find(Boolean);
    (el || $("tab-body")).focus();
  }
}

function selectTab(id) {
  activeTab = id;
  say("");
  drawTab();
}

/* ---------- guardar ---------- */
function saveErrorText(err) {
  const m = String(err?.message || "");
  if (m.includes("plano_pago")) return "Esa función es del plan Personalizado y tu plan no la incluye.";
  if (m.includes("limite_de_links")) return "Con la página gratis tienes hasta 5 botones.";
  return friendlyError(err);
}

async function save() {
  if (saving) return;
  saving = true;
  updateBar();
  const p = toSavePayload(state);
  let failure = null;
  try {
    const ok = (r) => { if (r.error) throw r.error; };
    if (p.deletes.length) ok(await sb.from("links").delete().in("id", p.deletes));
    for (const { id, ...rest } of p.updates) ok(await sb.from("links").update(rest).eq("id", id));
    if (p.inserts.length) ok(await sb.from("links").insert(p.inserts.map((r) => ({ ...r, profile_id: userId }))));
    if (Object.keys(p.profile).length) ok(await sb.from("profiles").update(p.profile).eq("id", userId));
  } catch (err) {
    failure = err;
  }
  try {
    adopt(await load());
    drawTab();
    updatePreview();
  } catch {
    say("No pudimos releer tu página. Recarga en un momento.", "err");
  }
  saving = false;
  updateBar();
  if (failure) say(saveErrorText(failure), "err");
  else say("¡Guardado! Tu página ya está actualizada.", "ok");
}

/* ---------- arranque ---------- */
async function init() {
  $("salir").addEventListener("click", async () => { await signOut(); location.replace("/entrar"); });
  $("guardar").addEventListener("click", save);
  $("descartar").addEventListener("click", () => { adopt(server); drawTab(); updatePreview(); updateBar(); say(""); });
  $("ver-previa").addEventListener("click", () => document.body.classList.add("previa-abierta"));
  $("cerrar-previa").addEventListener("click", () => document.body.classList.remove("previa-abierta"));
  window.addEventListener("beforeunload", (e) => { if (state && isDirty(state)) { e.preventDefault(); e.returnValue = ""; } });
  try {
    adopt(await load());
  } catch {
    $("cargando").textContent = "No pudimos cargar tu página. Recarga en un momento.";
    $("cargando").className = "msg err";
    return;
  }
  const url = `https://www.ophiel.es/all2/${state.profile.username}`;
  $("dir-txt").textContent = url;
  $("ver").href = url;
  $("copiar").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(url); say("Enlace copiado.", "ok"); } catch { say("No se pudo copiar. Selecciónalo y cópialo a mano.", "err"); }
  });
  renderPlanChip();
  buildTabs();
  drawTab();
  updatePreview();
  $("cargando").hidden = true;
  $("panel").hidden = false;
}

init();
