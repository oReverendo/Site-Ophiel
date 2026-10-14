(function () {
  "use strict";
  var C = window.SITE_CONFIG || {};
  var root = document.documentElement;
  root.classList.add("js");


  /* ---------- Posición correcta al abrir una página o un ancla ---------- */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  function goTop() {
    var h = location.hash, t = h.length > 1 ? document.getElementById(decodeURIComponent(h.slice(1))) : null;
    root.style.scrollBehavior = "auto";
    if (t) t.scrollIntoView(); else window.scrollTo(0, 0);
    root.style.scrollBehavior = "";
  }
  goTop();
  window.addEventListener("load", goTop);
  window.addEventListener("pageshow", function (e) { if (e.persisted) goTop(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(goTop);

  /* ---------- Contacto desde config ---------- */
  function isPending(v) { return !v || String(v).charAt(0) === "["; }
  document.querySelectorAll("[data-cfg]").forEach(function (el) {
    var v = C[el.getAttribute("data-cfg")];
    if (v) el.textContent = v;
  });
  function waLink(msg) {
    if (!C.whatsappRaw) return "#contacto";
    return "https://wa.me/" + C.whatsappRaw + "?text=" + encodeURIComponent(msg);
  }
  document.querySelectorAll("[data-link]").forEach(function (el) {
    var t = el.getAttribute("data-link"), href = "#contacto";
    if (t === "tel" && C.phoneRaw) href = "tel:+" + C.phoneRaw.replace(/^\+/, "");
    if (t === "mail" && !isPending(C.email)) href = "mailto:" + C.email;
    if (t === "wa") href = waLink(C.whatsappMessage);
    if (t === "cita") href = waLink(C.citaMessage);
    if (t === "maps" && C.mapsUrl) href = C.mapsUrl;
    if (t === "servicio") href = waLink("Hola, he visitado vuestra página web y me gustaría información sobre: " + (el.getAttribute("data-servicio") || "") + ".");
    el.setAttribute("href", href);
    if (/^https?:/.test(href)) { el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener"); }
  });
  var mapBox = document.getElementById("mapa");
  if (mapBox && C.mapsEmbedUrl) {
    var f = document.createElement("iframe");
    f.src = C.mapsEmbedUrl; f.title = "Ubicación de Gestoría Balanegra en Google Maps";
    f.loading = "lazy"; f.referrerPolicy = "no-referrer-when-downgrade";
    mapBox.textContent = ""; mapBox.appendChild(f);
  }
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  /* ---------- Calendario fiscal (vencimientos trimestrales) ---------- */
  var MES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  var MES3 = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  var DEF = [ // mes (0-11), día, etiqueta
    { m: 0,  d: 30, q: "4.º trimestre" },
    { m: 3,  d: 20, q: "1.er trimestre" },
    { m: 6,  d: 20, q: "2.º trimestre" },
    { m: 9,  d: 20, q: "3.er trimestre" }
  ];
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var list = [];
  [today.getFullYear(), today.getFullYear() + 1].forEach(function (yr) {
    DEF.forEach(function (e) { list.push({ date: new Date(yr, e.m, e.d), q: e.q, m: e.m, d: e.d }); });
  });
  list = list.filter(function (e) { return e.date >= today; }).sort(function (a, b) { return a.date - b.date; });

  function diff(d) { return Math.round((d - today) / 86400000); }
  function when(n) { return n === 0 ? "hoy" : n === 1 ? "mañana" : "en " + n + " días"; }

  var next = list[0];
  if (next) {
    var n = diff(next.date);
    var dEl = document.getElementById("lg-days"), uEl = document.getElementById("lg-unit");
    if (dEl && uEl) {
      if (n === 0) { dEl.textContent = "Hoy"; uEl.textContent = "vence"; }
      else { dEl.textContent = String(n); uEl.textContent = n === 1 ? "día" : "días"; }
    }
    var dt = document.getElementById("lg-date");
    if (dt) dt.textContent = next.d + " de " + MES[next.m] + " de " + next.date.getFullYear() + " · " + next.q;
    var nx = document.getElementById("lg-next");
    if (nx) {
      nx.textContent = "";
      list.slice(1, 3).forEach(function (e) {
        var li = document.createElement("li");
        var a = document.createElement("span"); a.textContent = e.d + " " + MES3[e.m] + " · " + e.q;
        var b = document.createElement("span"); b.className = "num"; b.textContent = when(diff(e.date));
        li.appendChild(a); li.appendChild(b); nx.appendChild(li);
      });
    }
    var cal = document.getElementById("cal-list");
    if (cal) {
      Array.prototype.forEach.call(cal.children, function (li) {
        if (li.firstElementChild.textContent === next.q) {
          li.classList.add("is-next");
          var pill = document.createElement("em"); pill.textContent = "Próximo";
          li.firstElementChild.appendChild(pill);
        }
      });
    }
  }

  /* ---------- Menú móvil ---------- */
  var btn = document.querySelector(".menu-btn");
  var sheet = document.getElementById("sheet");
  function setMenu(open) {
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    sheet.classList.toggle("is-open", open);
    document.body.classList.toggle("no-scroll", open);
  }
  btn.addEventListener("click", function () { setMenu(btn.getAttribute("aria-expanded") !== "true"); });
  sheet.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") { setMenu(false); btn.focus(); }
  });
  window.matchMedia("(min-width: 900px)").addEventListener("change", function (m) { if (m.matches) setMenu(false); });

  /* ---------- Aparición al entrar en viewport ---------- */
  var items = document.querySelectorAll("[data-reveal]");
  if (!("IntersectionObserver" in window)) { items.forEach(function (el) { el.classList.add("is-in"); }); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
  items.forEach(function (el) {
    if (el.getAttribute("data-reveal") === "stagger") {
      var idx = Array.prototype.indexOf.call(el.parentNode.children, el);
      el.style.transitionDelay = Math.min(idx, 5) * 70 + "ms";
    }
    io.observe(el);
  });
})();
