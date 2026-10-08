/* Ophiel — interacción mínima, sin dependencias. */
(() => {
  const html = document.documentElement;

  /* ---- menú a pantalla completa ---- */
  const btn = document.querySelector(".btn-menu");
  const menu = document.getElementById("menu");
  if (btn && menu) {
    menu.inert = true;
    const set = (abrir) => {
      btn.setAttribute("aria-expanded", String(abrir));
      btn.querySelector(".txt").textContent = abrir ? "Cerrar" : "Menú";
      menu.toggleAttribute("data-abierto", abrir);
      menu.inert = !abrir;
      html.classList.toggle("menu-abierto", abrir);
      if (abrir) menu.querySelector("a")?.focus({ preventScroll: true });
    };
    btn.addEventListener("click", () => set(btn.getAttribute("aria-expanded") !== "true"));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") { set(false); btn.focus(); }
    });
    // al volver con el botón "atrás" (bfcache), el menú no debe seguir abierto
    window.addEventListener("pageshow", () => set(false));
  }

  /* ---- carrusel: flechas que avanzan una diapositiva ---- */
  document.querySelectorAll("[data-carrusel]").forEach((root) => {
    const pista = root.querySelector(".pista");
    const prev = root.querySelector("[data-prev]");
    const next = root.querySelector("[data-next]");
    const paso = () => {
      const d = pista.children[0];
      return d ? d.getBoundingClientRect().width + parseFloat(getComputedStyle(pista).columnGap || 0) : 300;
    };
    const estado = () => {
      const max = pista.scrollWidth - pista.clientWidth - 2;
      prev.disabled = pista.scrollLeft <= 2;
      next.disabled = pista.scrollLeft >= max;
    };
    prev.addEventListener("click", () => pista.scrollBy({ left: -paso() }));
    next.addEventListener("click", () => pista.scrollBy({ left: paso() }));
    pista.addEventListener("scroll", () => requestAnimationFrame(estado), { passive: true });
    estado();
  });

  /* ---- visor de fotos ---- */
  const visor = document.getElementById("visor");
  if (visor) {
    const img = visor.querySelector("img");
    const pie = visor.querySelector("figcaption");
    document.querySelectorAll("[data-visor]").forEach((b) => {
      b.addEventListener("click", () => {
        img.src = b.dataset.visor;
        img.alt = b.dataset.alt || "";
        pie.textContent = b.dataset.alt || "";
        visor.showModal();
      });
    });
    visor.querySelector(".visor-cerrar").addEventListener("click", () => visor.close());
    visor.addEventListener("click", (e) => { if (e.target === visor) visor.close(); });
  }

  /* ---- formulario de contacto ---- */
  const form = document.getElementById("form-contacto");
  if (form) {
    const estado = document.getElementById("estado-form");
    const enviar = form.querySelector("button[type=submit]");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      enviar.disabled = true;
      estado.dataset.tipo = "";
      estado.textContent = "Enviando…";
      try {
        const r = await fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
        if (!r.ok) throw new Error(String(r.status));
        form.reset();
        estado.dataset.tipo = "ok";
        estado.textContent = "Solicitud enviada. Te responderemos lo antes posible.";
      } catch {
        estado.dataset.tipo = "error";
        estado.textContent = "No se ha podido enviar. Escríbenos por WhatsApp al 602 71 13 18 o a hola@ophiel.es.";
      } finally {
        enviar.disabled = false;
      }
    });
  }
})();

/* ---- NUESTRAS PLACAS: arrastre con inercia, muelle al soltar y paralaje ---- */
(() => {
  const root = document.querySelector("[data-placas]");
  if (!root) return;
  const pista = root.querySelector(".placas-pista");
  const prev = root.querySelector("[data-prev]");
  const next = root.querySelector("[data-next]");
  const barra = root.querySelector(".placas-progreso span");
  const fotos = [...pista.querySelectorAll(".placa-foto img:not(.placa-emblema)")];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const raton = matchMedia("(hover: hover) and (pointer: fine)");

  const max = () => pista.scrollWidth - pista.clientWidth;
  const inicios = () => [...pista.children].map((li) => Math.min(li.offsetLeft, max()));
  const masCercano = (x) => inicios().reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a), 0);

  /* paralaje: cada foto se desplaza un poco en sentido contrario al recorrido */
  let pintando = false;
  const pintar = () => {
    pintando = false;
    const m = max();
    barra.style.transform = `scaleX(${m > 0 ? Math.max(0.06, (pista.scrollLeft + pista.clientWidth) / pista.scrollWidth) : 1})`;
    prev.disabled = pista.scrollLeft <= 2;
    next.disabled = pista.scrollLeft >= m - 2;
    if (reduce) return;
    const c = pista.getBoundingClientRect(), centro = c.left + c.width / 2;
    for (const img of fotos) {
      const r = img.parentElement.getBoundingClientRect();
      const d = Math.max(-1, Math.min(1, (r.left + r.width / 2 - centro) / c.width));
      img.style.transform = `translate3d(${(-d * 7).toFixed(2)}%,0,0) scale(1.14)`;
    }
  };
  const pedirPintado = () => { if (!pintando) { pintando = true; requestAnimationFrame(pintar); } };
  pista.addEventListener("scroll", pedirPintado, { passive: true });
  window.addEventListener("resize", pedirPintado);

  /* muelle críticamente amortiguado (sin rebote), respuesta 0,4 s, que hereda la velocidad del gesto */
  const K = Math.pow((2 * Math.PI) / 0.4, 2), C = 2 * Math.sqrt(K);
  let anim = 0;
  const parar = () => { cancelAnimationFrame(anim); anim = 0; pista.classList.remove("en-movimiento"); };
  const muelle = (destino, v0 = 0) => {
    cancelAnimationFrame(anim);
    destino = Math.max(0, Math.min(max(), destino));
    if (reduce) { pista.scrollLeft = destino; parar(); return; }
    pista.classList.add("en-movimiento");
    let x = pista.scrollLeft, v = v0, t0 = performance.now();
    const paso = (t) => {
      const dt = Math.min(0.032, (t - t0) / 1000); t0 = t;
      const a = -K * (x - destino) - C * v;
      v += a * dt; x += v * dt;
      pista.scrollLeft = x;
      if (Math.abs(x - destino) < 0.5 && Math.abs(v) < 8) { pista.scrollLeft = destino; parar(); return; }
      anim = requestAnimationFrame(paso);
    };
    anim = requestAnimationFrame(paso);
  };

  /* flechas: una placa por clic */
  const anchoPlaca = () => { const a = pista.children[0], b = pista.children[1]; return b ? b.offsetLeft - a.offsetLeft : 300; };
  prev.addEventListener("click", () => muelle(masCercano(pista.scrollLeft - anchoPlaca())));
  next.addEventListener("click", () => muelle(masCercano(pista.scrollLeft + anchoPlaca())));

  /* arrastre con ratón (en táctil, el desplazamiento nativo ya tiene inercia) */
  let arrastre = null, movido = false;
  pista.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !raton.matches) return;
    parar();
    arrastre = { x: e.clientX, s: pista.scrollLeft, muestras: [[performance.now(), pista.scrollLeft]] };
    movido = false;
  });
  window.addEventListener("pointermove", (e) => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x;
    if (!movido && Math.abs(dx) < 5) return;
    if (!movido) { movido = true; pista.classList.add("arrastrando", "en-movimiento"); pista.setPointerCapture?.(e.pointerId); }
    // más allá de los bordes, resistencia de goma en vez de un tope seco
    const s = arrastre.s - dx, m = max(), dim = pista.clientWidth;
    const goma = (o) => (o * dim * 0.55) / (dim + 0.55 * Math.abs(o));
    let extra = 0;
    if (s < 0) extra = goma(s); else if (s > m) extra = goma(s - m);
    pista.scrollLeft = Math.max(0, Math.min(m, s));
    pista.style.transform = extra ? `translate3d(${(-extra).toFixed(1)}px,0,0)` : "";
    const ahora = performance.now();
    arrastre.muestras.push([ahora, arrastre.s - dx]);
    while (arrastre.muestras.length > 2 && ahora - arrastre.muestras[0][0] > 100) arrastre.muestras.shift();
  });
  const soltar = () => {
    if (!arrastre) return;
    const ms = arrastre.muestras; arrastre = null;
    pista.classList.remove("arrastrando");
    if (pista.style.transform) {   // vuelve de la goma
      pista.style.transition = "transform 300ms cubic-bezier(0.23, 1, 0.32, 1)";
      pista.style.transform = "";
      setTimeout(() => { pista.style.transition = ""; }, 320);
    }
    if (!movido) { pista.classList.remove("en-movimiento"); return; }
    const [t1, s1] = ms[0], [t2, s2] = ms[ms.length - 1];
    const v = t2 > t1 ? ((s2 - s1) / (t2 - t1)) * 1000 : 0; // px/s
    const d = 0.998, proyeccion = (v / 1000) * d / (1 - d);  // proyección de inercia (UIScrollView)
    muelle(masCercano(pista.scrollLeft + proyeccion), v);
  };
  window.addEventListener("pointerup", soltar);
  window.addEventListener("pointercancel", soltar);
  // un arrastre no debe abrir el enlace de la placa
  pista.addEventListener("click", (e) => { if (movido) { e.preventDefault(); e.stopPropagation(); movido = false; } }, true);
  // la rueda o un toque interrumpen el muelle al instante
  pista.addEventListener("wheel", parar, { passive: true });
  pista.addEventListener("touchstart", parar, { passive: true });

  pintar();
})();

/* ---- CONFIGURA TU PLACA ---- */
(() => {
  const form = document.getElementById("form-placa");
  if (!form) return;

  // cada casilla despliega su campo; desmarcada, el campo no se envía
  form.querySelectorAll("[data-opcion]").forEach((op) => {
    const caja = op.querySelector("input[type=checkbox]");
    const campo = document.getElementById(caja.dataset.activa);
    caja.addEventListener("change", () => {
      const on = caja.checked;
      op.toggleAttribute("data-activa", on);
      campo.disabled = !on; campo.required = on;
      if (on) setTimeout(() => campo.focus({ preventScroll: true }), 60);
    });
  });

  // buscar en Google Maps con lo que ya ha escrito
  const maps = document.getElementById("f-maps");
  document.getElementById("btn-maps").addEventListener("click", () => {
    const q = maps.value.trim();
    const url = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q || "mi negocio");
    window.open(url, "_blank", "noopener");
    document.getElementById("f-maps-url").focus({ preventScroll: true });
  });

  // logotipo: vista previa y control de tamaño
  const input = document.getElementById("f-logo");
  const zona = input.closest(".subida");
  const vista = zona.querySelector(".subida-vista");
  const nombre = document.getElementById("logo-nombre");
  const textoBase = nombre.textContent;
  const estado = document.getElementById("estado-placa");
  const MAX = 10 * 1024 * 1024;
  const mostrar = () => {
    const f = input.files[0];
    if (!f) { zona.classList.remove("con-archivo"); vista.style.backgroundImage = ""; nombre.textContent = textoBase; return; }
    if (f.size > MAX) {
      input.value = ""; zona.classList.remove("con-archivo"); vista.style.backgroundImage = "";
      nombre.textContent = textoBase;
      estado.dataset.tipo = "error"; estado.textContent = "El logotipo pesa más de 10 MB. Prueba con una versión más ligera.";
      return;
    }
    estado.textContent = "";
    zona.classList.add("con-archivo");
    nombre.textContent = `${f.name} · ${f.size < 1048576 ? Math.max(1, Math.round(f.size / 1024)) + " KB" : (f.size / 1048576).toFixed(1) + " MB"}`;
    if (f.type.startsWith("image/")) vista.style.backgroundImage = `url("${URL.createObjectURL(f)}")`;
  };
  input.addEventListener("change", mostrar);
  ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add("sobre"); }));
  ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, () => zona.classList.remove("sobre")));
  zona.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; mostrar(); }
  });

  // las casillas Logo y Código QR eligen la placa: logo → personalizada; QR → NFC + QR; nada → NFC
  const tp = document.getElementById("tu-placa");
  const modelo = document.getElementById("f-modelo");
  const MOD = JSON.parse(tp.dataset.modelos);
  const cLogo = document.getElementById("c-logo"), cQr = document.getElementById("c-qr");
  const pon = (id, txt) => {
    const el = document.getElementById(id);
    if (el.textContent === txt) return;
    el.innerHTML = ""; const s = document.createElement("span"); s.className = "cambia"; s.textContent = txt; el.append(s);
  };
  const elegir = () => {
    const [n, l, pr, v] = MOD[cLogo.checked ? "logo" : cQr.checked ? "qr" : "nfc"];
    modelo.value = `${n} | ${l} (${pr} €)`; modelo.dataset.variante = v;
    pon("tp-nombre", n); pon("tp-linea", l); pon("tp-precio", `${pr} €`);
  };
  [cLogo, cQr].forEach((c) => c.addEventListener("change", elegir));
  elegir(); // por si el navegador recuerda casillas marcadas al volver atrás

  // asunto del correo con el nombre del negocio
  form.addEventListener("submit", (e) => {
    if (!form.reportValidity()) { e.preventDefault(); return; }
    const n = document.getElementById("f-nombre").value.trim();
    form.querySelector("[name=_subject]").value = `Nueva placa: ${n || "sin nombre"}`;
    // la página de gracias recibe el modelo elegido para abrir el pago con la placa en el carrito
    const next = form.querySelector("[name=_next]");
    const q = new URLSearchParams();
    if (n) q.set("n", n);
    q.set("v", modelo.dataset.variante);
    next.value = next.value.split("?")[0] + (q.toString() ? "?" + q : "");
    const boton = form.querySelector("button[type=submit]");
    boton.disabled = true; boton.textContent = "Enviando…";
    const txt = document.querySelector(".cargador-txt");
    if (txt) txt.textContent = "Enviando tu placa…";
    document.documentElement.classList.add("enviando");
    // el envío es normal (no AJAX) para que el logotipo viaje adjunto
  });
  // si vuelve con el botón atrás, el botón vuelve a estar disponible
  window.addEventListener("pageshow", () => {
    const boton = form.querySelector("button[type=submit]");
    boton.disabled = false; boton.textContent = "Enviar y pagar";
  });
})();

/* ---- galería de placas junto al formulario ---- */
(() => {
  const img = document.getElementById("pg-img");
  if (!img) return;
  const nombre = document.getElementById("pg-nombre");
  const minis = [...document.querySelectorAll(".pg-mini")];
  // precarga para que el cambio sea instantáneo
  minis.forEach((m) => { const i = new Image(); i.src = m.dataset.src; });
  let t;
  minis.forEach((m) => m.addEventListener("click", () => {
    if (m.classList.contains("activa")) return;
    minis.forEach((x) => { x.classList.toggle("activa", x === m); x.toggleAttribute("aria-current", x === m); });
    clearTimeout(t);
    img.classList.add("cambiando");
    t = setTimeout(() => {
      img.src = m.dataset.src; img.alt = m.dataset.alt; nombre.textContent = m.dataset.nombre;
      requestAnimationFrame(() => img.classList.remove("cambiando"));
    }, 140);
  }));
})();

/* ---- cada página nueva empieza arriba (el visor podía conservar el scroll de la anterior) ---- */
(() => {
  const nav = performance.getEntriesByType?.("navigation")[0];
  if (location.hash || (nav && nav.type !== "navigate")) return;
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);
  addEventListener("load", () => { if (scrollY > 0 && !location.hash) window.scrollTo(0, 0); }, { once: true });
})();

/* ---- CARGADOR ---- */
(() => {
  const html = document.documentElement;
  if (html.classList.contains("con-carga")) {
    // visible lo justo para verse (0,9 s) y nunca más de 2,6 s
    const t0 = performance.now(), MIN = 900, MAX = 2600;
    const fuentes = document.fonts ? document.fonts.ready : Promise.resolve();
    const carga = new Promise((r) => (document.readyState === "complete" ? r() : addEventListener("load", r, { once: true })));
    Promise.race([Promise.all([fuentes, carga]), new Promise((r) => setTimeout(r, MAX))]).then(() => {
      setTimeout(() => {
        html.classList.add("cargado");
        setTimeout(() => html.classList.remove("con-carga", "cargado"), 500);
      }, Math.max(0, MIN - (performance.now() - t0)));
    });
  }
  // al volver atrás desde otra página, el cargador de envío no debe seguir puesto
  addEventListener("pageshow", () => html.classList.remove("enviando"));
})();

/* ---- tras enviar la placa: llevar al cliente al pago (Shopify, ophiel.eu) con la placa en el carrito ---- */
(() => {
  const btn = document.getElementById("ir-pago");
  if (!btn) return;
  // solo se aceptan los modelos que vendemos: nadie puede colar otro producto por la URL
  const MODELOS = ["54958279459143", "55116367462727", "55144201978183"];
  const qs = new URLSearchParams(location.search);
  const n = (qs.get("n") || "").slice(0, 80), v = qs.get("v") || "";
  if (MODELOS.includes(v)) {
    const extra = new URLSearchParams();
    if (n) { extra.set("attributes[Negocio]", n); extra.set("note", `Placa para ${n}. Datos enviados desde el formulario de ophiel.es.`); }
    btn.href = `https://www.ophiel.eu/cart/${v}:1` + (extra.toString() ? "?" + extra : "");
    const wa = document.getElementById("pago-wa");
    if (wa) wa.href = "https://wa.me/34602711318?text=" + encodeURIComponent(`¡Hola! Ya os he enviado los datos de mi placa NFC${n ? ` para ${n}` : ""} por la web. Prefiero pagar por Bizum o transferencia, ¿cómo lo hacemos?`);
  }
  // una sola vez: si vuelve atrás desde la tienda no se le redirige de nuevo
  let ya = false;
  try { ya = sessionStorage.getItem("ophiel-pago-placa") === location.search; sessionStorage.setItem("ophiel-pago-placa", location.search); } catch {}
  if (!ya && MODELOS.includes(v)) setTimeout(() => { location.href = btn.href; }, 1600);
})();

/* ---- vídeos en bucle: sin movimiento si el usuario lo pide, y en pausa fuera de pantalla ---- */
(() => {
  const vs = document.querySelectorAll("video.video-loop");
  if (!vs.length) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { vs.forEach((v) => { v.removeAttribute("autoplay"); v.pause(); }); return; }
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((es) => es.forEach((en) => { const v = en.target; if (en.isIntersecting) v.play().catch(() => {}); else v.pause(); }), { threshold: .25 });
  vs.forEach((v) => io.observe(v));
})();
