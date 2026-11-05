// Ajudantes do painel para a volta do Stripe (rodam no navegador).

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/** Depois de pagar, o aviso do Stripe (webhook) pode demorar uns segundos: relê até o plano virar personalizado. */
export async function waitForPlan(load, { tries = 8, delay = 2000, sleep = sleepMs } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const data = await load();
      if (data?.plan === "personalizado") return data;
    } catch { /* tenta de novo */ }
    if (i < tries - 1) await sleep(delay);
  }
  return null;
}

export function billingErrorText(code) {
  if (code === "ya_activo") return "Ya tienes el plan Personalizado. Usa «Gestionar suscripción».";
  if (code === "sin_cliente") return "Todavía no tienes una suscripción que gestionar.";
  if (code === "auth") return "Tu sesión ha caducado. Vuelve a entrar.";
  return "No pudimos abrir el pago. Inténtalo de nuevo en un momento.";
}
