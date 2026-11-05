import { clampOffset, cropSource } from "../lib/image.js";

/**
 * Encuadre de foto cuadrada en una ventana modal. Devuelve un canvas (lado <= outSize) o null si se cancela.
 * Arrastrar con el dedo/ratón, zoom con el control, flechas con el teclado, Esc cancela.
 */
export function cropSquare(bmp, { outSize = 512 } = {}) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const root = document.createElement("div");
    root.className = "modal";
    root.innerHTML = `
      <div class="modal-caja recorte" role="dialog" aria-modal="true" aria-labelledby="mc-t">
        <h2 id="mc-t">Encuadra tu foto</h2>
        <p class="ayuda" id="mc-a">Arrastra la foto y usa el zoom. Con el teclado: flechas.</p>
        <div class="recorte-vp" tabindex="0" aria-describedby="mc-a"><canvas width="520" height="520"></canvas></div>
        <div class="campo"><label for="mc-z">Zoom</label><input type="range" id="mc-z" min="1" max="3" step="0.01" value="1"></div>
        <div class="nav-pasos"><button class="btn btn-atras" type="button" data-x="cancel">Cancelar</button><button class="btn btn-oro" type="button" data-x="ok">Usar esta foto</button></div>
      </div>`;
    document.body.appendChild(root);
    const vp = root.querySelector(".recorte-vp");
    const canvas = root.querySelector("canvas");
    const crop = { zoom: 1, ox: 0, oy: 0, V: vp.clientWidth || 260 };
    canvas.width = canvas.height = Math.round(crop.V * 2);

    const draw = (c, size) => {
      const { sx, sy, sw } = cropSource(bmp.width, bmp.height, crop.V, crop.zoom, crop.ox, crop.oy);
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(bmp, sx, sy, sw, sw, 0, 0, size, size);
    };
    const redraw = () => {
      const o = clampOffset(bmp.width, bmp.height, crop.V, crop.zoom, crop.ox, crop.oy);
      crop.ox = o.ox;
      crop.oy = o.oy;
      draw(canvas, canvas.width);
    };
    const close = (result) => {
      document.removeEventListener("keydown", onKey, true);
      root.remove();
      opener?.focus?.();
      resolve(result);
    };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(null); } };
    document.addEventListener("keydown", onKey, true);

    let drag = null;
    vp.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; vp.setPointerCapture(e.pointerId); vp.classList.add("arrastrando"); });
    vp.addEventListener("pointermove", (e) => {
      if (!drag) return;
      crop.ox += e.clientX - drag.x;
      crop.oy += e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
      redraw();
    });
    const end = () => { drag = null; vp.classList.remove("arrastrando"); };
    vp.addEventListener("pointerup", end);
    vp.addEventListener("pointercancel", end);
    vp.addEventListener("keydown", (e) => {
      const d = { ArrowLeft: [12, 0], ArrowRight: [-12, 0], ArrowUp: [0, 12], ArrowDown: [0, -12] }[e.key];
      if (!d) return;
      e.preventDefault();
      crop.ox += d[0];
      crop.oy += d[1];
      redraw();
    });
    root.querySelector("#mc-z").addEventListener("input", (e) => { crop.zoom = Number(e.target.value); redraw(); });
    root.querySelector('[data-x="cancel"]').addEventListener("click", () => close(null));
    root.querySelector('[data-x="ok"]').addEventListener("click", () => {
      const { sw } = cropSource(bmp.width, bmp.height, crop.V, crop.zoom, crop.ox, crop.oy);
      const side = Math.max(1, Math.round(Math.min(sw, outSize)));
      const out = document.createElement("canvas");
      out.width = out.height = side;
      draw(out, side);
      close(out);
    });
    redraw();
    vp.focus();
  });
}
