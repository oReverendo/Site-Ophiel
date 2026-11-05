import { initI18n } from "./i18n-dom.js";
import { wantedUsername } from "../lib/signup.js";

const form = document.getElementById("claim");
const input = document.getElementById("u");
const msg = document.getElementById("claim-msg");
const i18n = initI18n(() => { if (msg.dataset.key) msg.textContent = i18n?.t(msg.dataset.key) ?? msg.textContent; });

const setMsg = (key) => { msg.dataset.key = key || ""; msg.textContent = key ? i18n.t(key) : ""; };
input.addEventListener("input", () => setMsg(""));

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const raw = input.value.trim();
  const u = wantedUsername(raw);
  if (raw && !u) { setMsg("all2.claim.bad"); input.focus(); return; }
  location.assign("registro" + (u ? "?u=" + encodeURIComponent(u) : ""));
});

// el botón final lleva al campo y lo enfoca
document.querySelector("[data-foco]")?.addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("claim").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  input.focus({ preventScroll: true });
});
