// Cartão de contacto (vCard 3.0) a partir de get_page. Valores escapados e linhas dobradas (RFC 2426).
const esc = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");

/** Dobra em linhas de no máximo 75 octetos (continuação começa com um espaço), sem partir caracteres. */
function fold(line) {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;
  const out = [];
  let cur = "", bytes = 0, limit = 75;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    if (bytes + b > limit) { out.push(cur); cur = " "; bytes = 1; limit = 75; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n");
}

function phoneOf(links) {
  for (const l of links) {
    if (l.type === "phone") {
      const m = /^tel:\+?(\d{8,15})$/.exec(String(l.url || ""));
      if (m) return "+" + m[1];
    } else if (l.type === "whatsapp") {
      const m = /^https:\/\/wa\.me\/(\d{8,15})$/.exec(String(l.url || ""));
      if (m) return "+" + m[1];
    }
  }
  return null;
}

function siteOf(links) {
  for (const l of links) {
    if (l.type !== "website") continue;
    try {
      const u = new URL(String(l.url || ""));
      if (u.protocol === "https:") return u.href;
    } catch { /* ignora */ }
  }
  return null;
}

export function buildVcard({ profile, links }) {
  const sorted = [...(links || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const name = String(profile.name || "").trim() || String(profile.username || "");
  const address = String(profile.address || "").trim();
  const tel = phoneOf(sorted);
  const site = siteOf(sorted);
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${esc(name)}`, `N:;${esc(name)};;;`, `ORG:${esc(name)}`];
  if (tel) lines.push(`TEL;TYPE=CELL:${tel}`);
  if (site) lines.push(`URL:${esc(site).replace(/\\,/g, ",").replace(/\;/g, ";")}`);
  if (address) lines.push(`ADR;TYPE=WORK:;;${esc(address)};;;;`);
  lines.push("END:VCARD");
  return lines.map(fold).join("\r\n") + "\r\n";
}
