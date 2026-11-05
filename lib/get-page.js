// Leitura da página pública pelo banco. Só código de servidor (api/*) usa; o client do Supabase é injetado.
// Lê SEMPRE pela função get_page (nunca direto das tabelas): ela devolve só o necessário e esconde dados pagos de quem é grátis.
export function makeGetProfile(supabase) {
  return async function getProfile(username) {
    const { data, error } = await supabase.rpc("get_page", { p_username: username });
    if (error) throw error;
    if (!data) return null;
    return { plan: data.plan === "personalizado" ? "personalizado" : "free", profile: data.profile, links: data.links ?? [] };
  };
}
