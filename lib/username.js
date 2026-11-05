import { RESERVED } from "./reserved.js";

/**
 * Valida o nome de usuário (vira ophiel.es/all2/<usuario>).
 * Não converte maiúsculas: recusa. Só apara espaços das pontas.
 */
export function validateUsername(input, reserved = RESERVED) {
  const value = typeof input === "string" ? input.trim() : "";
  if (!/^[a-z0-9-]*$/.test(value)) return { ok: false, reason: "caracteres" };
  if (value.length < 3) return { ok: false, reason: "curto" };
  if (value.length > 30) return { ok: false, reason: "largo" };
  if (value.startsWith("-") || value.endsWith("-")) return { ok: false, reason: "borde" };
  if (reserved.includes(value)) return { ok: false, reason: "reservado" };
  return { ok: true, value };
}
