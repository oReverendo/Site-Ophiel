import { buildHref } from "./linktypes.js";
import { FREE_LINK_LIMIT } from "./plan.js";

// Estado puro do assistente de criação (nada de DOM aqui, tudo testável).
// State = { username, name, bio, avatarUrl, bgColor, btnColor, selected: string[], values: Record<string,string>, extras: string[], notice: "limite"|null }

const BIO_MAX = 160;
const total = (s) => s.selected.length + s.extras.length;

export function initialState() {
  return { username: "", name: "", bio: "", avatarUrl: null, bgColor: "#0b131c", btnColor: "#d9bd8a", selected: [], values: {}, extras: [], notice: null };
}

/** Liga/desliga uma rede. O 6º botão é recusado sem erro: devolve o mesmo estado com notice "limite". */
export function toggleNetwork(state, type) {
  if (state.selected.includes(type)) {
    const { [type]: _gone, ...values } = state.values;
    return { ...state, selected: state.selected.filter((t) => t !== type), values, notice: null };
  }
  if (total(state) >= FREE_LINK_LIMIT) return { ...state, notice: "limite" };
  return { ...state, selected: [...state.selected, type], notice: null };
}

export function setValue(state, type, value) {
  return { ...state, values: { ...state.values, [type]: value } };
}

/** Link extra (guardado como "website"). Conta no mesmo limite de 5. */
export function addExtra(state, url) {
  if (total(state) >= FREE_LINK_LIMIT) return { ...state, notice: "limite" };
  return { ...state, extras: [...state.extras, url], notice: null };
}

export function removeExtra(state, index) {
  return { ...state, extras: state.extras.filter((_, i) => i !== index), notice: null };
}

/** Campos simples do perfil (username, name, bio, avatarUrl, bgColor, btnColor). A bio é cortada em 160. */
export function setField(state, key, value) {
  return { ...state, [key]: key === "bio" ? String(value).slice(0, BIO_MAX) : value };
}

/** Converte o estado em linhas para gravar: descarta redes sem valor válido, posições na ordem escolhida, máximo 5. */
export function toPayload(state, userId) {
  const wanted = [
    ...state.selected.map((type) => ({ type, url: buildHref(type, state.values[type]) })),
    ...state.extras.map((raw) => ({ type: "website", url: buildHref("website", raw) })),
  ].filter((l) => l.url);
  const links = wanted.slice(0, FREE_LINK_LIMIT).map((l, position) => ({ profile_id: userId, type: l.type, url: l.url, position }));
  const profile = {
    id: userId,
    username: state.username,
    name: state.name.trim(),
    bio: state.bio.trim(),
    avatar_url: state.avatarUrl,
    bg_color: state.bgColor,
    btn_color: state.btnColor,
  };
  return { profile, links };
}
