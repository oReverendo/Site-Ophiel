import { getClient, requireSession, signOut, friendlyError } from "./auth.js";
import { fromServer, toSavePayload, isDirty } from "../lib/panel-state.js";
import { planFromSubscription, isLocked } from "../lib/plan.js";
import { renderPage } from "../lib/render-page.js";
import { waitForPlan, billingErrorText } from "../lib/wait-plan.js";
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
  const act = $("plan-accion");
  act.hidden = false;
  $("upgrade-bar").hidden = state.plan === "personalizado";
  $("upgrade-top").onclick = () => goBilling("checkout");
  act.onclick = () => goBilling(state.plan === "personalizado" ? "portal" : "checkout");
  act.textContent = state.plan === "personalizado" ? "Gestionar suscripción" : "Pasar a Personalizado · 9,90 €/mes";
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
  upgrade: () => goBilling("checkout"),
};

/* ---------- suscripción (Stripe) ---------- */
let billingBusy = false;
async function goBilling(action) {
  if (billingBusy) return;
  if (state && isDirty(state)) { say("Guarda o descarta tus cambios antes de continuar con el pago.", "err"); return; }
  billingBusy = true;
  say(action === "portal" ? "Abriendo tu suscripción…" : "Abriendo el pago seguro…", "ok");
  try {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw Object.assign(new Error("auth"), { code: "auth" });
    const r = await fetch("/api/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || typeof j.url !== "string") throw Object.assign(new Error("billing"), { code: j.error });
    location.assign(j.url);
    return; // la página se va: el botón queda bloqueado a propósito
  } catch (err) {
    say(billingErrorText(err?.code), "err");
  }
  billingBusy = false;
}

function warnUnsaved(e) { if (state && isDirty(state)) { e.preventDefault(); e.returnValue = ""; } }

/** Al volver de Stripe (?pago=1/0): avisa y, si pagó, espera a que el plan se active. */
async function handleReturn() {
  const q = new URLSearchParams(location.search).get("pago");
  if (q !== "1" && q !== "0") return;
  history.replaceState(null, "", location.pathname);
  if (q === "0") { say("No se ha hecho ningún cobro. Puedes suscribirte cuando quieras.", "ok"); return; }
  if (state.plan === "personalizado") { say("¡Gracias! Tu plan Personalizado está activo.", "ok"); return; }
  say("¡Gracias! Estamos activando tu plan…", "ok");
  const fresh = await waitForPlan(load);
  if (!fresh) { say("El pago está en proceso. En unos minutos tu plan se activará; recarga la página para verlo.", "ok"); return; }
  adopt(fresh);
  renderPlanChip();
  buildTabs();
  drawTab();
  updatePreview();
  updateBar();
  say("¡Listo! Ya tienes el plan Personalizado.", "ok");
}

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
  window.addEventListener("beforeunload", warnUnsaved);
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
  handleReturn();
}

init();
