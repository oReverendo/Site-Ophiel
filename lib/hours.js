// Horário de abertura. Formato: { mon: [["09:00","14:00"], ...], ... } (máx. 3 intervalos por dia).
// Fim exclusivo; fim <= início = cruza a meia-noite (vale também até esse horário no dia seguinte).
export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** Normaliza e valida. null/{} = sem horário. Dias desconhecidos e dias vazios são descartados. */
export function validateHours(h) {
  if (h === null || h === undefined) return { ok: true, value: null };
  if (typeof h !== "object" || Array.isArray(h)) return { ok: false, reason: "formato" };
  const value = {};
  for (const d of DAYS) {
    const list = h[d];
    if (list === undefined) continue;
    if (!Array.isArray(list)) return { ok: false, reason: "formato" };
    if (list.length > 3) return { ok: false, reason: "intervalos" };
    const clean = [];
    for (const p of list) {
      if (!Array.isArray(p) || p.length !== 2) return { ok: false, reason: "formato" };
      const [a, b] = p;
      const fimOk = b === "24:00" || (typeof b === "string" && HHMM.test(b));
      if (typeof a !== "string" || !HHMM.test(a) || !fimOk) return { ok: false, reason: "hora" };
      if (a === b) return { ok: false, reason: "hora" };
      clean.push([a, b]);
    }
    if (clean.length) value[d] = clean;
  }
  return { ok: true, value: Object.keys(value).length ? value : null };
}

/**
 * Estado agora no fuso do negócio. state: "open" | "closed" | "none" (sem dados confiáveis → não mostrar).
 * AUTO-CONTIDA de propósito: a página embute o código com openStatus.toString().
 */
export function openStatus(hours, tz, now) {
  var none = { state: "none", text: "" };
  try {
    if (!hours || typeof hours !== "object" || Array.isArray(hours) || typeof tz !== "string" || !tz) return none;
    var re = /^(\d\d):(\d\d)$/;
    var order = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    var parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now || new Date());
    var wd = "", hh = 0, mm = 0;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === "weekday") wd = parts[i].value.slice(0, 3).toLowerCase();
      if (parts[i].type === "hour") hh = parseInt(parts[i].value, 10) % 24;
      if (parts[i].type === "minute") mm = parseInt(parts[i].value, 10);
    }
    var today = order.indexOf(wd);
    if (today < 0) return none;
    var mins = hh * 60 + mm;
    var any = false, open = false;
    var toMin = function (s) { var m = re.exec(s); return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1; };
    // para cada dia da semana, usa só os intervalos válidos
    for (var k = 0; k < 7; k++) {
      var list = hours[order[k]];
      if (!Array.isArray(list)) continue;
      for (var j = 0; j < list.length; j++) {
        var p = list[j];
        if (!Array.isArray(p) || p.length !== 2) continue;
        var s = toMin(p[0]), e = p[1] === "24:00" ? 1440 : toMin(p[1]);
        if (s < 0 || e < 0 || s === e) continue;
        any = true;
        if (k === today) {
          if (e > s ? (mins >= s && mins < e) : mins >= s) open = true;
        }
        if (e < s && (k + 1) % 7 === today && mins < e) open = true; // sobra do dia anterior
      }
    }
    if (!any) return none;
    return open ? { state: "open", text: "Abierto ahora" } : { state: "closed", text: "Cerrado" };
  } catch (err) {
    return none;
  }
}
