import { createClient } from "@supabase/supabase-js";
import { makeGetProfile } from "./get-page.js";
import { formEncode } from "./billing.js";

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

// ---------- Cobrança (fase 3) ----------
// Variáveis do Vercel: STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY (e opcionais SITE_URL, STRIPE_AUTOMATIC_TAX=1).
const STRIPE_API = "https://api.stripe.com";

async function stripeCall(method, path, params) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("falta STRIPE_SECRET_KEY");
  const res = await fetch(STRIPE_API + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: method === "POST" ? formEncode(params) : undefined,
    signal: AbortSignal.timeout(9000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`stripe ${res.status}: ${json?.error?.message || "erro"}`);
  return json;
}

/** Só o servidor: a chave de serviço ignora o RLS (é a única que grava em subscriptions). */
function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("falta SUPABASE_SERVICE_ROLE_KEY");
  return createClient(process.env.SUPABASE_URL || PUBLIC_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const billingDeps = {
  getUser: async (token) => {
    const { data, error } = await client().auth.getUser(token);
    return error || !data?.user ? null : { id: data.user.id, email: data.user.email };
  },
  getSubscription: async (profileId) => {
    const { data, error } = await adminClient().from("subscriptions")
      .select("status,current_period_end,cancel_at_period_end,stripe_customer_id").eq("profile_id", profileId).maybeSingle();
    if (error) throw error;
    return data;
  },
  stripe: (path, params) => stripeCall("POST", path, params),
  get config() {
    return {
      priceId: process.env.STRIPE_PRICE_ID || "",
      siteUrl: (process.env.SITE_URL || "https://www.ophiel.es").replace(/\/+$/, ""),
      automaticTax: process.env.STRIPE_AUTOMATIC_TAX === "1",
    };
  },
};

export const webhookDeps = {
  get webhookSecret() { return process.env.STRIPE_WEBHOOK_SECRET || ""; },
  retrieveSubscription: (id) => stripeCall("GET", `/v1/subscriptions/${encodeURIComponent(id)}`),
  findProfileByCustomer: async (customerId) => {
    const { data, error } = await adminClient().from("subscriptions").select("profile_id").eq("stripe_customer_id", customerId).maybeSingle();
    if (error) throw error;
    return data?.profile_id ?? null;
  },
  upsert: async (row) => {
    const { error } = await adminClient().from("subscriptions").upsert(row, { onConflict: "profile_id" });
    if (error) throw error;
  },
};
