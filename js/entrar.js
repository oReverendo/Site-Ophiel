import { getClient, signIn, resetPassword, updatePassword, signInWithGoogle } from "./auth.js";
import { initI18n } from "./i18n-dom.js";
import { authErrorCode } from "../lib/signup.js";

const $ = (id) => document.getElementById(id);
const vistas = ["entrar", "olvide", "nueva"];
const ver = (v) => vistas.forEach((n) => $("vista-" + n).classList.toggle("oculto", n !== v));
let i18n;
const msg = (id, key, tipo) => { const el = $(id); el.textContent = key ? i18n.t(key) : ""; el.className = "msg" + (tipo ? " " + tipo : ""); el.dataset.key = key || ""; };
const setBusy = (btn, on, key) => { btn.disabled = on; btn.textContent = i18n.t(on ? "common.wait" : key); };
const viaRecuperacion = location.hash.includes("type=recovery") || location.search.includes("recuperar");
const emailOk = (v) => /^\S+@\S+\.\S+$/.test(v.trim());

i18n = initI18n(() => {
  for (const id of ["msg-entrar", "msg-olvide", "msg-nueva", "msg-google"]) {
    const el = $(id);
    if (el && el.dataset.key) el.textContent = i18n?.t(el.dataset.key) ?? el.textContent;
  }
});

$("ir-olvide").addEventListener("click", () => { $("email-olvide").value = $("email").value; ver("olvide"); $("email-olvide").focus(); });
$("ir-entrar").addEventListener("click", () => { ver("entrar"); $("email").focus(); });

$("form-entrar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("email").value, password = $("password").value;
  if (!emailOk(email) || !password) return msg("msg-entrar", "entrar.fill", "err");
  setBusy($("btn-entrar"), true, "common.login"); msg("msg-entrar", "");
  try {
    await signIn(email, password);
    location.replace("/painel");
  } catch (err) {
    msg("msg-entrar", "err." + authErrorCode(err), "err");
    setBusy($("btn-entrar"), false, "common.login");
  }
});

$("btn-google").addEventListener("click", async () => {
  msg("msg-google", "");
  try { await signInWithGoogle("/painel"); } catch (err) { msg("msg-google", "err." + authErrorCode(err), "err"); }
});

$("form-olvide").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("email-olvide").value;
  if (!emailOk(email)) return msg("msg-olvide", "err.email", "err");
  setBusy($("btn-olvide"), true, "olvide.btn"); msg("msg-olvide", "");
  try {
    await resetPassword(email);
    // Mismo mensaje exista o no la cuenta: no revelamos quién tiene cuenta.
    msg("msg-olvide", "olvide.ok", "ok");
  } catch (err) {
    msg("msg-olvide", "err." + authErrorCode(err), "err");
  }
  setBusy($("btn-olvide"), false, "olvide.btn");
});

$("form-nueva").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = $("password-nueva").value;
  if (pw.length < 8) return msg("msg-nueva", "err.password", "err");
  setBusy($("btn-nueva"), true, "nueva.btn");
  try {
    await updatePassword(pw);
    location.replace("/painel");
  } catch (err) {
    msg("msg-nueva", "err." + authErrorCode(err), "err");
    setBusy($("btn-nueva"), false, "nueva.btn");
  }
});

// El enlace del correo de recuperación llega aquí con una sesión temporal: pedimos la contraseña nueva.
getClient().auth.onAuthStateChange((evento) => { if (evento === "PASSWORD_RECOVERY") ver("nueva"); });
// Quien ya tiene sesión (y no viene a recuperar) va directo al panel.
getClient().auth.getSession().then(({ data }) => {
  if (data.session && !viaRecuperacion) location.replace("/painel");
});
