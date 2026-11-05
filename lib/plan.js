// Limites e travas por plano. O banco repete estas regras (triggers/RLS); aqui servem para a tela e a página pública.
export const FREE_LINK_LIMIT = 5;

// Recursos que só o plano personalizado libera (a tela mostra cadeado e "Pasar a Personalizado").
export const PAID_FEATURES = ["bgImage", "linkStyle", "hours", "address", "vcard", "stats", "moreLinks", "btnStyle", "logo", "ring", "map"];

const isPaidPlan = (plan) => plan === "personalizado";

/** Ordena por position e devolve só os links que o plano mostra. Plano desconhecido conta como grátis. */
export function visibleLinks(links, plan) {
  const sorted = [...links].sort((a, b) => a.position - b.position);
  return isPaidPlan(plan) ? sorted : sorted.slice(0, FREE_LINK_LIMIT);
}

/** true se ainda cabe mais um link com `count` já existentes. */
export function canAddLink(count, plan) {
  return isPaidPlan(plan) ? true : count < FREE_LINK_LIMIT;
}

export function isLocked(feature, plan) {
  return PAID_FEATURES.includes(feature) && !isPaidPlan(plan);
}

/** Mesma regra de public.is_paid(): estado vivo e período ainda não terminado. */
export function planFromSubscription(sub, now = new Date()) {
  if (!sub || !["active", "trialing", "past_due"].includes(sub.status)) return "free";
  const end = typeof sub.current_period_end === "string" ? Date.parse(sub.current_period_end) : Number.NaN;
  return Number.isFinite(end) && end > now.getTime() ? "personalizado" : "free";
}
