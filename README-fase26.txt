FASE 2.6 - Registro, Google, landing /all2 (ES/EN) y "All2" en el menú
======================================================================

1) SUBIR A GITHUB (Add files via upload, respetando carpetas)
   Nuevos:      all2.html, registro.html, js/registro.js, js/entrar.js, js/i18n-dom.js, js/i18n-dict.js, js/all2.js,
                lib/i18n.js, lib/signup.js, assets/all2.css, assets/img/all2-*.webp (6), tests/i18n.test.js
   Modificados: entrar.html, criar.html, js/criar.js, js/auth.js, lib/reserved.js, scripts/gen-reserved.mjs,
                assets/cuenta.css, sitemap.xml
                + TODAS las páginas con menú (se añadió "All2"): index, agencia, contacto, servicios, zonas, placa,
                  placa-enviada, privacidad, cookies, aviso-legal, 404, servicios/*.html, zonas/*.html
   NO tocar: all2/*.html, c/, o/ (placas y clientes).

2) GOOGLE LOGIN - configuración (una sola vez, sin código)
   a) console.cloud.google.com -> crear/elegir proyecto -> "APIs y servicios" -> "Pantalla de consentimiento OAuth"
      (Externa; nombre Ophiel; correo de soporte; dominio ophiel.es) -> Publicar la app.
   b) "Credenciales" -> Crear credenciales -> ID de cliente OAuth -> Aplicación web.
      URI de redirección autorizado (EXACTO):
        https://cwkoiurstvhupneizfss.supabase.co/auth/v1/callback
      Origen JavaScript autorizado: https://www.ophiel.es
      Copia el Client ID y el Client Secret.
   c) Supabase -> Authentication -> Providers -> Google -> Enable -> pegar Client ID y Secret -> Save.
   d) Supabase -> Authentication -> URL Configuration:
        Site URL: https://www.ophiel.es
        Redirect URLs: https://www.ophiel.es/**   y   https://ophiel.es/**
   e) Supabase -> Authentication -> Providers -> Email: "Confirm email" activado (el registro ya lo contempla).
   Hasta hacer b-d, el botón de Google muestra un aviso ("Entrar con Google todavía no está disponible") y el registro con correo funciona igual.

3) FLUJO
   /all2 (landing) -> elige nombre -> /registro?u=nombre -> correo+contraseña o Google -> /criar (nombre ya rellenado) -> /painel.
   /entrar: correo o Google -> /painel. Idiomas ES/EN con botón y recordado (?lang=en también sirve).

4) NOTAS
   - Apple login: pendiente (exige cuenta Apple Developer de pago).
   - El asistente (/criar) y el panel (/painel) siguen en español por ahora.
   - La vitrina de la landing usa páginas reales de clientes (Maddox, Loluca, Le Coquette, Elixea, Jeonsa, El Gato Goloso):
     confirma que están de acuerdo.
   - Tests: npx vitest run (358 OK).
