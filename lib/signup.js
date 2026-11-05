import { validateUsername } from "./username.js";

export const PASSWORD_MIN = 8;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Correo y contraseña del registro. errors: lista de códigos ("email", "password"). */
export function validateSignup({ email, password } = {}) {
  const errors = [];
  if (typeof email !== "string" || email.trim().length > 254 || !EMAIL.test(email.trim())) errors.push("email");
  if (typeof password !== "string" || password.length < PASSWORD_MIN || password.length > 72) errors.push("password");
  return { ok: errors.length === 0, errors };
}

/** El nombre que alguien escribió en la landing (?u=): minúsculas y limpio, o null si no sirve. */
export function wantedUsername(raw) {
  if (typeof raw !== "string") return null;
  const v = validateUsername(raw.trim().toLowerCase());
  return v.ok ? v.value : null;
}

/** Código estable del error de Supabase Auth (el texto lo pone cada pantalla, en su idioma). */
export function authErrorCode(err) {
  const m = String(err?.message || "").toLowerCase();
  if (m.includes("invalid login")) return "invalid";
  if (m.includes("not confirmed")) return "not_confirmed";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) return "rate";
  if (m.includes("already registered") || m.includes("already been registered")) return "exists";
  if (m.includes("password") && (m.includes("characters") || m.includes("weak"))) return "short";
  if (m.includes("same password")) return "same";
  if (m.includes("failed to fetch") || m.includes("network")) return "network";
  if (m.includes("provider") && m.includes("not enabled")) return "provider";
  return "other";
}

/** Supabase no avisa si el correo ya existe: devuelve un usuario falso con identities vacío. */
export function isExistingAccount(data) {
  const ids = data?.user?.identities;
  return Array.isArray(ids) && ids.length === 0;
}
