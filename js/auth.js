import { createClient } from "./vendor/supabase.js";

let client;

/** Cliente único de Supabase para el navegador (sesión guardada y renovada automáticamente). */
export function getClient() {
  if (!client) {
    const cfg = window.OPHIEL_CONFIG;
    if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey) throw new Error("Falta public-config.js");
    client = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

/** Registro con correo y contraseña. El enlace del correo vuelve a /criar para elegir la dirección. */
export async function signUp(email, password) {
  const { data, error } = await getClient().auth.signUp({
    email: email.trim(), password, options: { emailRedirectTo: location.origin + "/criar" },
  });
  if (error) throw error;
  return data; // data.session = ya dentro (si el proyecto no pide confirmar correo); si no, hay que confirmar
}

export async function resendConfirmation(email) {
  const { error } = await getClient().auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: location.origin + "/criar" } });
  if (error) throw error;
}

/** Google: sale a Google y vuelve a `next` (por defecto /criar; quien ya tiene página pasa de ahí a /painel). */
export async function signInWithGoogle(next = "/criar") {
  const { error } = await getClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + next } });
  if (error) throw error;
}

export async function signIn(email, password) {
  const { data, error } = await getClient().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data.session;
}

/** Envía el correo de recuperación; el enlace vuelve a /entrar para elegir contraseña nueva. */
export async function resetPassword(email) {
  const { error } = await getClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + "/entrar" });
  if (error) throw error;
}

export async function updatePassword(password) {
  const { error } = await getClient().auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  await getClient().auth.signOut();
}

/** Devuelve la sesión o manda a /entrar (y no resuelve nunca, para que la página no siga pintándose). */
export async function requireSession(redirectTo = "/entrar") {
  const { data } = await getClient().auth.getSession();
  if (!data.session) {
    location.replace(redirectTo);
    return new Promise(() => {});
  }
  return data.session;
}

/** Mensaje en español para el error de Supabase (sin filtrar detalles técnicos). */
export function friendlyError(err) {
  const m = String(err?.message || "").toLowerCase();
  if (m.includes("invalid login")) return "Correo o contraseña incorrectos.";
  if (m.includes("not confirmed")) return "Confirma tu correo antes de entrar: te enviamos un enlace.";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
  if (m.includes("password") && m.includes("characters")) return "La contraseña es demasiado corta (mínimo 8 caracteres).";
  if (m.includes("same password")) return "La contraseña nueva debe ser distinta de la anterior.";
  if (m.includes("failed to fetch") || m.includes("network")) return "No hay conexión. Revisa tu internet e inténtalo de nuevo.";
  return "Algo salió mal. Inténtalo de nuevo en un momento.";
}
