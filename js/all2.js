import { initI18n } from "./i18n-dom.js";
import { wantedUsername } from "../lib/signup.js";

const $ = (id) => document.getElementById(id);
const form = $("claim");
const input = $("u");
const msg = $("claim-msg");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- teléfono vivo ---------- */
const nameEl = $("live-name"), slugEl = $("live-slug"), avEl = $("live-av"), phone = $("live");
const titleCase = (s) => s.replace(/[-_]+/g, " ").trim().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
let i18n;
function drawLive(tick) {
  const raw = input.value.trim().toLowerCase();
  const fallback = i18n?.t("all2.live.name") ?? nameEl.textContent;
  const name = raw ? titleCase(raw) : fallback;
  slugEl.textContent = raw || input.placeholder || "tunegocio";
  nameEl.textContent = name;
  avEl.textContent = [...name][0]?.toUpperCase() ?? "";
  if (tick && !reduce) { nameEl.classList.remove("tick"); void nameEl.offsetWidth; nameEl.classList.add("tick"); }
}

i18n = initI18n(() => {
  if (msg.dataset.key) msg.textContent = i18n?.t(msg.dataset.key) ?? msg.textContent;
  if (i18n) drawLive(false);
});
drawLive(false);

const setMsg = (key) => { msg.dataset.key = key || ""; msg.textContent = key ? i18n.t(key) : ""; };
input.addEventListener("input", () => { setMsg(""); drawLive(true); });

for (const b of document.querySelectorAll(".a2-sw")) {
  b.addEventListener("click", () => {
    const bg = b.dataset.bg;
    phone.style.setProperty("--bg", bg);
    phone.classList.toggle("claro", bg.toLowerCase() === "#f4efd4");
    for (const o of document.querySelectorAll(".a2-sw")) o.setAttribute("aria-pressed", String(o === b));
  });
}

/* ---------- enviar ---------- */
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const raw = input.value.trim();
  const u = wantedUsername(raw);
  if (raw && !u) { setMsg("all2.claim.bad"); input.focus(); return; }
  location.assign("registro" + (u ? "?u=" + encodeURIComponent(u) : ""));
});

// todos los botones "crear" llevan al campo y lo enfocan
for (const a of document.querySelectorAll("[data-foco]")) {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    $("claim").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    input.focus({ preventScroll: true });
  });
}

/* ---------- entradas al hacer scroll ---------- */
const rv = [...document.querySelectorAll(".rv")];
if ("IntersectionObserver" in window && !reduce) {
  const io = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  rv.forEach((el) => io.observe(el));
} else rv.forEach((el) => el.classList.add("in"));

/* ---------- botón fijo (móvil): aparece cuando el campo del hero ya no se ve ---------- */
const sticky = $("sticky");
if (sticky && "IntersectionObserver" in window) {
  let heroOut = false, finalIn = false;
  const set = () => { const on = heroOut && !finalIn; sticky.classList.toggle("on", on); sticky.setAttribute("aria-hidden", String(!on)); };
  new IntersectionObserver(([e]) => { heroOut = !e.isIntersecting && e.boundingClientRect.top < 0; set(); }).observe(form);
  const fin = document.querySelector(".a2-final");
  if (fin) new IntersectionObserver(([e]) => { finalIn = e.isIntersecting; set(); }).observe(fin);
}
