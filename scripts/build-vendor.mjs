// Empacota @supabase/supabase-js em js/vendor/supabase.js (hospedado no próprio site). Rode: npm run vendor
import { build } from "esbuild";
await build({
  stdin: { contents: 'export { createClient } from "@supabase/supabase-js";', resolveDir: process.cwd() },
  bundle: true, format: "esm", minify: true, target: "es2020", platform: "browser",
  outfile: "js/vendor/supabase.js", legalComments: "none",
});
console.log("js/vendor/supabase.js gerado");
