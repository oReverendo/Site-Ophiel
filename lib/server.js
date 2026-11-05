import { createClient } from "@supabase/supabase-js";
import { makeGetProfile } from "./get-page.js";

// Dependências reais das funções do Vercel (as funções recebem isto; os testes injetam falsos).
// SUPABASE_URL e SUPABASE_ANON_KEY (chave publicável) vêm das variáveis de ambiente do Vercel.
function client() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
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
