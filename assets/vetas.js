/* =====================================================================
   VETAS — pieza generativa de Ophiel
   Filamentos de oro que nacen en los bordes, siguen un campo de ruido
   y rodean un vacío central sin tocarlo: el sitio donde vive el titular.
   Cada página tiene su propia semilla (su ruta), así que cada héroe
   tiene sus propias vetas, siempre las mismas para esa página.
   Sin librerías. Se dibuja una vez; no anima en bucle.
   ===================================================================== */
(() => {
  const cv = document.querySelector("canvas.vetas");
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // La aparición progresiva es un momento de bienvenida: solo la primera
  // página de la visita. Al navegar, las vetas ya están ahí.
  let primera = true;
  try { primera = !sessionStorage.getItem("ophiel-vetas"); sessionStorage.setItem("ophiel-vetas", "1"); } catch { /* sin almacenamiento: se trata como primera */ }
  const animar = primera && !reduce;

  /* ---------- azar con semilla ---------- */
  const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /* ---------- ruido de Perlin 2D con semilla ---------- */
  function crearRuido(rng) {
    const p = new Uint8Array(512), base = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [base[i], base[j]] = [base[j], base[i]]; }
    for (let i = 0; i < 512; i++) p[i] = base[i & 255];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const grad = (h, x, y) => { const g = h & 7; const u = g < 4 ? x : y, v = g < 4 ? y : x; return ((g & 1) ? -u : u) + ((g & 2) ? -2 * v : 2 * v); };
    const perlin = (x, y) => {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
      const u = fade(x), v = fade(y), a = p[X] + Y, b = p[X + 1] + Y;
      const l1 = grad(p[a], x, y) + u * (grad(p[b], x - 1, y) - grad(p[a], x, y));
      const l2 = grad(p[a + 1], x, y - 1) + u * (grad(p[b + 1], x - 1, y - 1) - grad(p[a + 1], x, y - 1));
      return (l1 + v * (l2 - l1)) * 0.5;
    };
    // tres octavas: la grande da la dirección de la veta, las pequeñas su temblor
    return (x, y) => perlin(x, y) * 0.62 + perlin(x * 2.03 + 17.1, y * 2.03 - 9.4) * 0.27 + perlin(x * 4.11 - 3.3, y * 4.11 + 21.7) * 0.11;
  }

  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  let tarea = 0, anchoPrevio = 0;

  function dibujar(progresivo) {
    cancelAnimationFrame(tarea);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    anchoPrevio = w;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter"; // el oro se acumula donde las vetas se cruzan
    ctx.lineCap = "round";

    const rng = mulberry32(hash(cv.dataset.seed || location.pathname));
    const ruido = crearRuido(rng);
    const escala = 1 / Math.max(260, Math.min(w, 900) * 0.55);

    // vacío central: una elipse donde vive el texto
    const cx = w / 2, cy = h * 0.46;
    // en pantallas estrechas el texto ocupa todo el ancho: el vacío también
    const estrecho = w < 700;
    const rx = estrecho ? w * 0.6 : Math.min(w * 0.36, 560), ry = estrecho ? h * 0.42 : Math.max(h * 0.34, 150);
    const dist = (x, y) => Math.hypot((x - cx) / rx, (y - cy) / ry);
    const inclinacion = (rng() - 0.5) * 1.2; // dirección general de la piedra en esta página

    // número de vetas proporcional al área, con techo para móviles modestos
    const total = Math.round(Math.min(1500, Math.max(320, (w * h) / 950)));
    const semillas = [];
    while (semillas.length < total) {
      const x = rng() * w, y = rng() * h;
      if (rng() < smooth(0.75, 1.55, dist(x, y))) semillas.push([x, y, 0]);
    }

    const veta = (x, y, gen) => {
      const pasos = gen ? 30 + rng() * 70 : 70 + rng() * 170;
      const grosor = (gen ? 0.25 : 0.3) + Math.pow(rng(), 3) * (gen ? 0.6 : 1.5);
      const brillo = rng() < 0.05; // destellos crema, muy pocos
      const alfa = (brillo ? 0.16 : 0.07 + rng() * 0.12) * (gen ? 0.8 : 1);
      const color = brillo ? "244,239,212" : "235,179,94";
      let px = x, py = y, i = 0;
      const tramo = 9;
      while (i < pasos) {
        ctx.beginPath(); ctx.moveTo(px, py);
        let d = 1;
        for (let k = 0; k < tramo && i < pasos; k++, i++) {
          d = dist(px, py);
          const a = ruido(px * escala, py * escala) * Math.PI * 2.4 + inclinacion;
          let vx = Math.cos(a), vy = Math.sin(a);
          // cerca del vacío, la veta lo rodea en lugar de entrar
          const cerca = 1 - smooth(1, 1.5, d);
          if (cerca > 0) {
            const nx = (px - cx) / (rx * rx), ny = (py - cy) / (ry * ry), nl = Math.hypot(nx, ny) || 1;
            const tx = -ny / nl, ty = nx / nl, dir = Math.sign(vx * tx + vy * ty) || 1;
            vx += (tx * dir * 1.4 + (nx / nl) * 0.9) * cerca; vy += (ty * dir * 1.4 + (ny / nl) * 0.9) * cerca;
            const l = Math.hypot(vx, vy) || 1; vx /= l; vy /= l;
          }
          px += vx * 1.6; py += vy * 1.6;
          ctx.lineTo(px, py);
          if (!gen && rng() < 0.006) ramas.push([px, py, 1]); // bifurcación
        }
        const t = i / pasos;
        ctx.strokeStyle = `rgba(${color},${(alfa * Math.pow(1 - t, 0.55) * smooth(0.85, 1.25, d)).toFixed(3)})`;
        ctx.lineWidth = grosor * (1 - t * 0.6);
        ctx.stroke();
        if (px < -40 || px > w + 40 || py < -40 || py > h + 40) break;
      }
    };

    const ramas = [];
    const cola = semillas;
    let n = 0;
    // por lotes, para no bloquear el hilo principal más de unos milisegundos
    const lote = progresivo ? Math.ceil(cola.length / 70) : Math.ceil(cola.length / 4);
    const paso = () => {
      const fin = Math.min(cola.length, n + lote);
      for (; n < fin; n++) veta(...cola[n]);
      while (ramas.length) veta(...ramas.pop());
      if (n < cola.length) tarea = requestAnimationFrame(paso);
    };
    cv.classList.toggle("vetas-entra", progresivo);
    tarea = requestAnimationFrame(paso);
  }

  dibujar(animar);
  // un fotograma después, para que el fundido de entrada tenga un punto de partida
  requestAnimationFrame(() => cv.classList.add("vetas-lista"));

  // Redibuja solo si cambia el ancho (no por la barra de direcciones del móvil)
  let espera;
  new ResizeObserver(() => {
    if (Math.abs(cv.clientWidth - anchoPrevio) < 2) return;
    clearTimeout(espera);
    espera = setTimeout(() => dibujar(false), 200);
  }).observe(cv);
})();
