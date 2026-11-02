/* =========================================================
   Club Hana Taekwon-Do ITF — main.js
   ---------------------------------------------------------
   EDITA SOLO ESTE BLOQUE: los datos se rellenan solos en
   todas las páginas (index, aviso legal, privacidad, cookies).
   ========================================================= */
const CONFIG = {
  telefono: "",          // ej.: "600 123 456"
  whatsapp: "",          // solo números con prefijo, ej.: "34600123456"
  email: "",             // ej.: "info@clubhana.es"
  direccion: "",         // ej.: "Pabellón Municipal, C/ ..., 04716 Las Norias (Almería)"
  instagram: "",         // URL completa
  facebook: ""           // URL completa
};

(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {
    get(k){ try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v){ try { localStorage.setItem(k, v); } catch {} }
  };

  /* ---------- Rellenar datos de contacto ---------- */
  const waNumber = CONFIG.whatsapp || (CONFIG.telefono ? "34" + CONFIG.telefono.replace(/\D/g, "") : "");
  $$("[data-fill]").forEach(el => {
    const k = el.dataset.fill;
    if (k === "phone" && CONFIG.telefono) el.textContent = CONFIG.telefono;
    if (k === "email" && CONFIG.email) el.textContent = CONFIG.email;
    if (k === "address" && CONFIG.direccion) el.textContent = CONFIG.direccion;
    if (k === "tel" && CONFIG.telefono) el.href = "tel:+34" + CONFIG.telefono.replace(/\D/g, "");
    if (k === "mailto" && CONFIG.email) el.href = "mailto:" + CONFIG.email;
    if (k === "instagram" && CONFIG.instagram) { el.href = CONFIG.instagram; el.target = "_blank"; el.rel = "noopener"; }
    if (k === "facebook" && CONFIG.facebook) { el.href = CONFIG.facebook; el.target = "_blank"; el.rel = "noopener"; }
    if (k === "whatsapp" && waNumber) el.href = "https://wa.me/" + waNumber + "?text=" + encodeURIComponent("¡Hola! Me gustaría información sobre las clases de taekwondo.");
  });
  $$("[data-year]").forEach(el => el.textContent = new Date().getFullYear());

  /* ---------- Header ---------- */
  const header = $("#header");
  let lastY = window.scrollY;
  const onScroll = () => {
    if (!header) return;
    const y = window.scrollY;
    header.classList.toggle("is-scrolled", y > 8);
    // se esconde al bajar, vuelve al subir (con un margen para evitar parpadeos)
    if (Math.abs(y - lastY) > 6) {
      header.classList.toggle("is-hidden", y > lastY && y > 320 && !document.body.classList.contains("menu-open"));
      lastY = y;
    }
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Menú móvil ---------- */
  const toggle = $("#menuToggle");
  const nav = $("#nav");
  const setMenu = open => {
    document.body.classList.toggle("menu-open", open);
    toggle?.setAttribute("aria-expanded", String(open));
    toggle?.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
  };
  toggle?.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
  nav?.addEventListener("click", e => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") setMenu(false); });

  /* ---------- Enlace activo según sección ---------- */
  const links = $$('.nav a[href^="#"]');
  if (links.length && "IntersectionObserver" in window) {
    const map = new Map(links.map(a => [a.getAttribute("href").slice(1), a]));
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        links.forEach(l => l.classList.remove("is-active"));
        map.get(en.target.id)?.classList.add("is-active");
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------- Hero (carrusel) ---------- */
  const hero = $(".hero");
  if (hero) {
    const slides = $$(".hero-slide", hero);
    const texts = $$(".swap-item", hero);
    const dots = $$(".hero-dot", hero);
    const num = $("#heroNum");
    const DURATION = 6500;
    hero.style.setProperty("--slide-ms", DURATION + "ms");
    let i = 0, timer = null;

    const go = n => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => s.classList.toggle("is-active", k === i));
      texts.forEach((t, k) => { t.classList.toggle("is-active", k === i); t.setAttribute("aria-hidden", String(k !== i)); });
      dots.forEach((d, k) => {
        d.classList.remove("is-active");
        d.setAttribute("aria-selected", String(k === i));
      });
      // reinicia la barra de progreso del punto activo
      void dots[i]?.offsetWidth;
      dots[i]?.classList.add("is-active");
      if (num) num.textContent = String(i + 1).padStart(2, "0");
    };
    const start = () => { stop(); if (!reduceMotion) timer = setInterval(() => go(i + 1), DURATION); };
    const stop = () => { clearInterval(timer); timer = null; };

    dots.forEach((d, k) => d.addEventListener("click", () => { go(k); start(); }));
    document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
    hero.addEventListener("focusin", () => { stop(); hero.classList.add("is-paused"); });
    hero.addEventListener("focusout", () => { hero.classList.remove("is-paused"); start(); });

    // Deslizar en móvil
    let x0 = null, y0 = null;
    hero.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    hero.addEventListener("touchend", e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { go(i + (dx < 0 ? 1 : -1)); start(); }
      x0 = y0 = null;
    }, { passive: true });

    go(0); start();
  }

  /* ---------- Revelado al hacer scroll ---------- */
  const reveals = $$(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    reveals.forEach(el => io.observe(el));
  } else reveals.forEach(el => el.classList.add("is-in"));

  /* ---------- Lightbox ---------- */
  const lb = $("#lightbox");
  const items = $$("#gallery .g-item");
  if (lb && items.length) {
    const img = $("#lbImg"), cap = $("#lbCap");
    let idx = 0, lastFocus = null;
    const show = n => {
      idx = (n + items.length) % items.length;
      const it = items[idx], thumb = $("img", it);
      img.src = it.dataset.full; img.alt = thumb.alt; cap.textContent = thumb.alt;
    };
    const open = n => {
      lastFocus = document.activeElement; show(n);
      lb.classList.add("is-open"); document.body.style.overflow = "hidden";
      $(".lb-close", lb).focus({ preventScroll: true });
    };
    const close = () => {
      lb.classList.remove("is-open"); document.body.style.overflow = "";
      lastFocus?.focus({ preventScroll: true });
    };
    items.forEach((it, k) => it.addEventListener("click", () => open(k)));
    $(".lb-close", lb).addEventListener("click", close);
    $(".lb-prev", lb).addEventListener("click", () => show(idx - 1));
    $(".lb-next", lb).addEventListener("click", () => show(idx + 1));
    lb.addEventListener("click", e => { if (e.target === lb) close(); });
    document.addEventListener("keydown", e => {
      if (!lb.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") show(idx + 1);
      if (e.key === "ArrowLeft") show(idx - 1);
    });
    let sx = null;
    lb.addEventListener("touchstart", e => sx = e.touches[0].clientX, { passive: true });
    lb.addEventListener("touchend", e => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
      sx = null;
    }, { passive: true });
  }

  /* ---------- Formulario → WhatsApp ---------- */
  const form = $("#contactForm");
  if (form) {
    const hint = $("#formHint");
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (!form.checkValidity()) {
        const bad = form.querySelector(":invalid");
        hint.textContent = bad?.id === "f-legal" ? "Debes aceptar la política de privacidad." : "Revisa los campos obligatorios.";
        bad?.focus();
        return;
      }
      if (!waNumber) { hint.textContent = "Falta configurar el número de WhatsApp del club."; return; }
      const d = new FormData(form);
      const msg = `¡Hola! Quiero reservar una clase de prueba.\n\nNombre: ${d.get("nombre")}\nTeléfono: ${d.get("telefono")}\nPara: ${d.get("grupo")}` + (d.get("mensaje") ? `\nMensaje: ${d.get("mensaje")}` : "");
      window.open("https://wa.me/" + waNumber + "?text=" + encodeURIComponent(msg), "_blank", "noopener");
      hint.textContent = "¡Gracias! Se ha abierto WhatsApp con tu mensaje.";
      form.reset();
    });
  }

  /* ---------- Cookies ---------- */
  const KEY = "hana_cookie_consent_v1";
  const banner = $("#cookie");
  const mapsBox = $("#ck-maps");
  const mapWrap = $("#map");

  const loadMap = () => {
    if (!mapWrap || mapWrap.dataset.loaded) return;
    const q = CONFIG.direccion || "Club Hana Taekwondo ITF";
    mapWrap.innerHTML = `<iframe title="Ubicación del doyang" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed"></iframe>`;
    mapWrap.style.padding = "0"; mapWrap.style.border = "0";
    mapWrap.dataset.loaded = "1";
  };
  const read = () => { try { return JSON.parse(store.get(KEY)); } catch { return null; } };
  const save = maps => {
    store.set(KEY, JSON.stringify({ maps, date: new Date().toISOString() }));
    hideBanner();
    if (maps) loadMap();
  };
  const showBanner = (prefs = false) => {
    if (!banner) return;
    const c = read();
    if (mapsBox) mapsBox.checked = !!c?.maps;
    banner.classList.toggle("show-prefs", prefs);
    banner.classList.add("is-open");
  };
  const hideBanner = () => banner?.classList.remove("is-open", "show-prefs");

  if (banner) {
    banner.addEventListener("click", e => {
      const b = e.target.closest("[data-ck]"); if (!b) return;
      const act = b.dataset.ck;
      if (act === "accept") save(banner.classList.contains("show-prefs") ? !!mapsBox?.checked : true);
      if (act === "reject") save(false);
      if (act === "config") {
        if (banner.classList.contains("show-prefs")) save(!!mapsBox?.checked);
        else { banner.classList.add("show-prefs"); b.textContent = "Guardar selección"; }
      }
    });
    const c = read();
    if (!c) setTimeout(() => showBanner(false), reduceMotion ? 0 : 600);
    else if (c.maps) loadMap();
  }
  $$("[data-cookie-settings]").forEach(b => b.addEventListener("click", () => {
    const cfg = banner?.querySelector('[data-ck="config"]'); if (cfg) cfg.textContent = "Guardar selección";
    showBanner(true);
  }));
  $("#loadMap")?.addEventListener("click", () => {
    const c = read() || {};
    store.set(KEY, JSON.stringify({ ...c, maps: true, date: new Date().toISOString() }));
    hideBanner(); loadMap();
  });
})();
