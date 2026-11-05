/** Menor tamanho que cabe em `max` x `max` mantendo a proporção. Nunca amplia; nunca devolve lado 0. */
export function fitWithin(w, h, max) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

// ---- Enquadramento: viewport quadrado de lado V (px da tela). A imagem sempre cobre o viewport (escala base = "cover"),
// `zoom` >= 1 a amplia e (ox, oy) é o deslocamento do centro da imagem em relação ao centro do viewport.
const scaleOf = (w, h, V, zoom) => (V / Math.min(w, h)) * zoom;

/** Limita o deslocamento para que nunca apareça fundo fora da imagem. */
export function clampOffset(w, h, V, zoom, ox, oy) {
  const s = scaleOf(w, h, V, zoom);
  const mx = Math.max(0, (w * s - V) / 2);
  const my = Math.max(0, (h * s - V) / 2);
  return { ox: Math.min(mx, Math.max(-mx, ox)) || 0, oy: Math.min(my, Math.max(-my, oy)) || 0 };
}

/** Quadrado da imagem original (em px dela) que fica visível no viewport. */
export function cropSource(w, h, V, zoom, ox, oy) {
  const s = scaleOf(w, h, V, zoom);
  const c = clampOffset(w, h, V, zoom, ox, oy);
  const sw = V / s;
  return { sx: w / 2 - (V / 2 + c.ox) / s, sy: h / 2 - (V / 2 + c.oy) / s, sw };
}

/** Tamanho final da imagem de fundo: cabe em maxW x maxH (padrão 1080 x 1920), mantém a proporção, nunca amplia. */
export function fitCover(w, h, maxW = 1080, maxH = 1920) {
  if (![w, h, maxW, maxH].every((n) => Number.isFinite(n) && n > 0)) throw new RangeError("tamanho inválido");
  const scale = Math.min(1, maxW / w, maxH / h);
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}
