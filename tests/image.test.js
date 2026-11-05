import { describe, it, expect } from "vitest";
import { fitWithin } from "../lib/image.js";

describe("fitWithin", () => {
  it("reduz paisagem mantendo proporção", () => expect(fitWithin(2000, 1000, 512)).toEqual({ w: 512, h: 256 }));
  it("reduz retrato", () => expect(fitWithin(1000, 2000, 512)).toEqual({ w: 256, h: 512 }));
  it("não amplia", () => expect(fitWithin(300, 200, 512)).toEqual({ w: 300, h: 200 }));
  it("nunca devolve lado zero", () => expect(fitWithin(10000, 1, 512)).toEqual({ w: 512, h: 1 }));
});

import { clampOffset, cropSource } from "../lib/image.js";

describe("enquadramento da foto (viewport quadrado V, imagem cobrindo-o)", () => {
  // 2000x1000, V=240: escala base 0,24 => imagem exibida 480x240
  it("zoom 1 centralizado recorta o quadrado do meio", () => {
    expect(cropSource(2000, 1000, 240, 1, 0, 0)).toEqual({ sx: 500, sy: 0, sw: 1000 });
  });
  it("arrastar a imagem para a direita mostra a parte esquerda", () => {
    expect(cropSource(2000, 1000, 240, 1, 120, 0)).toEqual({ sx: 0, sy: 0, sw: 1000 });
  });
  it("zoom 2 mostra metade da área", () => {
    expect(cropSource(2000, 1000, 240, 2, 0, 0)).toEqual({ sx: 750, sy: 250, sw: 500 });
  });
  it("clampOffset impede mostrar fora da imagem", () => {
    expect(clampOffset(2000, 1000, 240, 1, 500, 80)).toEqual({ ox: 120, oy: 0 });
    expect(clampOffset(2000, 1000, 240, 2, -999, 999)).toEqual({ ox: -360, oy: 120 });
  });
  it("cropSource nunca sai dos limites da imagem, mesmo com deslocamento absurdo", () => {
    const r = cropSource(1000, 3000, 240, 1.5, 9999, -9999);
    expect(r.sx).toBeGreaterThanOrEqual(0);
    expect(r.sy).toBeGreaterThanOrEqual(0);
    expect(r.sx + r.sw).toBeLessThanOrEqual(1000);
    expect(r.sy + r.sw).toBeLessThanOrEqual(3000);
  });
  it("imagem quadrada pequena com zoom 1 usa a imagem toda", () => {
    expect(cropSource(300, 300, 240, 1, 0, 0)).toEqual({ sx: 0, sy: 0, sw: 300 });
  });
});

import { fitCover } from "../lib/image.js";

describe("fitCover (imagem de fundo: largura máx. 1080, altura máx. 1920, nunca amplia)", () => {
  it("reduz mantendo a proporção", () => expect(fitCover(4000, 3000)).toEqual({ w: 1080, h: 810 }));
  it("não amplia", () => expect(fitCover(500, 500)).toEqual({ w: 500, h: 500 }));
  it("retrato muito alto é limitado pela altura", () => expect(fitCover(1000, 10000)).toEqual({ w: 192, h: 1920 }));
  it("aceita limites próprios", () => expect(fitCover(4000, 3000, 800, 800)).toEqual({ w: 800, h: 600 }));
  it.each([[0, 10], [10, 0], [-1, 5], [NaN, 5], [5, Infinity]])("tamanho inválido (%s, %s) lança", (w, h) => {
    expect(() => fitCover(w, h)).toThrow(RangeError);
  });
});
