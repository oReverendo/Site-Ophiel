import { fitCover } from "../lib/image.js";

// Entrada/saída de imagens no navegador (canvas). A lógica de tamanhos fica em lib/image.js (testada).
export const MAX_INPUT_BYTES = 12 * 1024 * 1024;
export const AVATAR_MAX_BYTES = 200 * 1024;       // limite do bucket avatars (204800)
export const BACKGROUND_MAX_BYTES = 400 * 1024;   // limite do bucket backgrounds (409600)

export function checkImageFile(file) {
  if (!file) return "no_file";
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return "tipo";
  if (file.size > MAX_INPUT_BYTES) return "grande";
  return null;
}

export const fileToBitmap = (file) => createImageBitmap(file, { imageOrientation: "from-image" });

const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));

/**
 * WebP com qualidade decrescente até caber em maxBytes (JPEG como alternativa; com `alpha` a alternativa é PNG, que
 * guarda a transparência de logos). Devolve null se não coube.
 */
export async function canvasToBlobUnder(canvas, maxBytes, { alpha = false } = {}) {
  const types = alpha ? ["image/webp", "image/png"] : ["image/webp", "image/jpeg"];
  for (const q of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]) {
    for (const type of types) {
      const blob = await toBlob(canvas, type, q);
      if (blob && blob.type === type && blob.size <= maxBytes) return blob;
    }
  }
  return null;
}

/** Reduz a imagem para caber em maxW x maxH e comprime até maxBytes; encolhe mais (3 vezes) se for preciso. */
async function scaledBlob(bmp, { maxW, maxH, maxBytes, alpha = false }) {
  let k = 1;
  for (let i = 0; i < 4; i++) {
    const { w, h } = fitCover(bmp.width, bmp.height, Math.round(maxW * k), Math.round(maxH * k));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
    const blob = await canvasToBlobUnder(canvas, maxBytes, { alpha });
    if (blob) return blob;
    k *= 0.75;
  }
  return null;
}

/** Imagem de fundo: lado maior até 1920 px (nítida no PC e no celular) e 400 KB; encolhe sozinha se não couber. */
export const backgroundBlob = (bmp) => scaledBlob(bmp, { maxW: 1920, maxH: 1920, maxBytes: BACKGROUND_MAX_BYTES });

/** Logo (PNG com transparência): inteiro, sem recorte, até 800 x 500 px e 200 KB. */
export const logoBlob = (bmp) => scaledBlob(bmp, { maxW: 800, maxH: 500, maxBytes: AVATAR_MAX_BYTES, alpha: true });
