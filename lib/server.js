import { createClient } from "@supabase/supabase-js";
import { makeGetProfile } from "./get-page.js";

// Dependências reais das funções do Vercel (as funções recebem isto; os testes injetam falsos).
// SUPABASE_URL e SUPABASE_ANON_KEY (chave publicável) vêm das variáveis de ambiente do Vercel.
// Si las variables no están en Vercel se usan estos dos valores, que son PÚBLICOS por diseño
// (los mismos de public-config.js): lo que protege los datos son las reglas RLS, no estas claves.
const PUBLIC_URL = "https://cwkoiurstvhupneizfss.supabase.co";
const PUBLIC_KEY = "sb_publishable_P3JZShqGCx7rj_IPreMrRg_iwD4fk5D";

function client() {
  return createClient(process.env.SUPABASE_URL || PUBLIC_URL, process.env.SUPABASE_ANON_KEY || PUBLIC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const supabaseDeps = {
  getProfile: (username) => makeGetProfile(client())(username),
  track: async (linkId) => {
    const { error } = await client().rpc("track_click", { p_link: linkId });
    if (error) throw error;
  },
};
