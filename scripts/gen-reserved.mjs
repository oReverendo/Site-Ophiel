// Gera lib/reserved.js e o bloco RESERVED de sql/001_base.sql (all2/*.html + lista fixa).
// Rode: npm run reserved
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const path = (p) => fileURLToPath(new URL(p, root));
const FIXED = ["admin", "login", "entrar", "criar", "painel", "api", "placa", "ophiel", "www", "app", "ayuda", "soporte", "planes", "precios"];

const fromAll2 = readdirSync(path("all2/"))
  .filter((f) => f.endsWith(".html"))
  .map((f) => f.slice(0, -5).toLowerCase());
// Cada nome de all2 também reserva as variantes que um novo usuário poderia digitar: "_" vira "-" e sem separador
// (le_coquette -> le-coquette, lecoquette). Evita endereços quase iguais aos das placas NFC já impressas.
const variants = fromAll2.flatMap((n) => [n.replaceAll("_", "-"), n.replaceAll("_", "")]);
const all = [...new Set([...fromAll2, ...variants, ...FIXED])].sort();

writeFileSync(path("lib/reserved.js"), `// GERADO por scripts/gen-reserved.mjs — não edite à mão.\nexport const RESERVED = ${JSON.stringify(all, null, 2)};\n`);

const sqlPath = path("sql/001_base.sql");
const insert = `insert into public.reserved_usernames (name) values\n${all.map((n) => `  ('${n}')`).join(",\n")}\non conflict do nothing;`;
const sql = readFileSync(sqlPath, "utf8").replace(
  /-- RESERVED:BEGIN[\s\S]*?-- RESERVED:END/,
  `-- RESERVED:BEGIN\n${insert}\n-- RESERVED:END`
);
writeFileSync(sqlPath, sql);
console.log(`${all.length} nomes reservados`);
