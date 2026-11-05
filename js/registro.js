import { getClient, signUp, signInWithGoogle, resendConfirmation } from "./auth.js";
import { initI18n } from "./i18n-dom.js";
import { validateSignup, wantedUsername, authErrorCode, isExistingAccount } from "../lib/signup.js";

const $ = (id) => document.getElementById(id);
const KEY_U = "ophiel-u";
const store = { get: () => { try { return localStorage.getItem(KEY_U); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(KEY_U, v); } catch { /* vale igual */ } } };

// El nombre que eligió en la landing (?u=) viaja hasta el asistente aunque pase por el correo o por Google.
const wanted = wantedUsername(new URLSearchParams(location.search).get("u") || "") || wantedUsername(store.get() || "");
if (wanted) store.set(wanted);

let i18n;
let lastEmail = "";
const msg = (id, key, tipo) => { const el = $(id); el.textContent = key ? i18n.t(key) : ""; el.className = "msg" + (tipo ? " " + tipo : ""); el.dataset.key = key || ""; };
const showChip = () => { const c = $("chip"); if (wanted) { c.classList.remove("oculto"); c.dataset.i18nVars = JSON.stringify({ u: wanted }); } };
const ver = (cual) => { $("vista-registro").classList.toggle("oculto", cual !== "registro"); $("vista-correo").classList.toggle("oculto", cual !== "correo"); };
const showCheck = () => { const p = $("texto-correo"); p.dataset.i18nVars = JSON.stringify({ email: lastEmail }); i18n.refresh(); ver("correo"); };

i18n = initI18n(() => {
  // al cambiar de idioma, los mensajes ya mostrados se traducen también
  for (const id of ["msg-registro", "msg-google", "msg-reenviar"]) {
    const el = $(id);
    if (el && el.dataset.key) el.textContent = i18n?.t(el.dataset.key) ?? el.textContent;
  }
});
showChip();
i18n.refresh();

$("form-registro").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("email").value, password = $("password").value;
  const v = validateSignup({ email, password });
  if (!v.ok) return msg("msg-registro", "err." + v.errors[0], "err");
  const btn = $("btn-registro");
  btn.disabled = true; btn.textContent = i18n.t("common.wait"); msg("msg-registro", "");
  try {
    const data = await signUp(email, password);
    lastEmail = email.trim();
    if (isExistingAccount(data)) { msg("msg-registro", "err.exists", "err"); }
    else if (data.session) { location.replace("/criar"); return; }
    else showCheck();
  } catch (err) {
    msg("msg-registro", "err." + authErrorCode(err), "err");
  }
  btn.disabled = false; btn.textContent = i18n.t("registro.btn");
});

$("btn-google").addEventListener("click", async () => {
  msg("msg-google", "");
  try { await signInWithGoogle("/criar"); } catch (err) { msg("msg-google", "err." + authErrorCode(err), "err"); }
});

$("btn-reenviar").addEventListener("click", async () => {
  $("btn-reenviar").disabled = true;
  try { await resendConfirmation(lastEmail); msg("msg-reenviar", "registro.check.resent", "ok"); }
  catch (err) { msg("msg-reenviar", "err." + authErrorCode(err), "err"); }
  setTimeout(() => { $("btn-reenviar").disabled = false; }, 30000); // Supabase limita los reenvíos
});

// Quien ya tiene sesión (por ejemplo, volvió de Google o del enlace del correo) sigue al asistente.
getClient().auth.getSession().then(({ data }) => { if (data.session) location.replace("/criar"); });
