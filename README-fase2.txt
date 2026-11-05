ALL2 - FASE 2: PAINEL DE EDICIÓN + PLAN PERSONALIZADO
=====================================================

O que entra nesta fase
- /painel vira um editor com vista previa en vivo (pestañas: Tema, Botones, Fondo, Horario, Ubicación, Contacto, Estadísticas).
- Plan Gratis: foto redonda, nombre, descripción, color de fondo y de botones, hasta 5 botones.
- Plan Personalizado: botones ilimitados, botones "candy" (cada red en su color oficial O un solo color RGB a elección),
  estilo por botón (color, brillo, destacado), logo PNG sin recorte (con o sin nombre), imagen de fondo con desenfoque 0-100 %
  (con vidrio esmerilado detrás del contenido), horario "Abierto ahora / Cerrado", dirección + "Cómo llegar" (Google Maps),
  "Guardar contacto" (vCard) y contador de clics con estadísticas.
- El banco (Postgres) recusa todo lo pago para quien no paga: no es solo la pantalla.

PASSO A PASSO
1) Supabase > SQL Editor. Rode, nesta ordem, cada arquivo inteiro:
     sql/001_base.sql       (só se ainda não rodou na fase 1)
     sql/001_verify.sql     (todas as linhas OK)
     sql/002_painel.sql
     sql/002_verify.sql     (todas as linhas OK; deve dar 52)
   ATENÇÃO: nunca rode o 001_base.sql DE NOVO depois do 002 (ele redefine get_page e links_limit e desfaz a fase 2).
   Se rodar sem querer, rode o 002_painel.sql logo em seguida.
2) GitHub: suba os arquivos do ZIP por cima dos existentes (mesmas pastas). O Vercel publica sozinho.
3) Variáveis do Vercel: as mesmas da fase 1 (SUPABASE_URL e SUPABASE_ANON_KEY). Nada novo.
4) Conferir:
   - /painel carrega, mostra "Plan Gratis" e as pestañas Fondo/Horario/Ubicación/Contacto/Estadísticas com cadeado.
   - /all2/cementoymas (página antiga) continua igual.

COMO TESTAR O PLANO PERSONALIZADO ANTES DO STRIPE (fase 3)
No SQL Editor, pegue seu id e ative um mês de teste:
     select id, email from auth.users;
     insert into public.subscriptions (profile_id, status, current_period_end)
     values ('COLE-O-ID-AQUI', 'active', now() + interval '30 days')
     on conflict (profile_id) do update set status = 'active', current_period_end = now() + interval '30 days';
Para voltar ao grátis:
     update public.subscriptions set current_period_end = now() - interval '1 second' where profile_id = 'COLE-O-ID-AQUI';
(os dados pagos continuam guardados e escondidos; ao reativar, reaparecem.)

NOTAS
- O botão "Pasar a Personalizado" ainda não cobra: mostra um aviso. A cobrança (Stripe) é a fase 3.
- O plano que o painel mostra usa o relógio do navegador; o banco usa o relógio do servidor (é ele quem decide de verdade).
- A imagem de fundo e a foto/logo sobem ao escolher o arquivo (substituem o arquivo anterior); só aparecem na página pública
  depois de apertar Guardar.
- O contador de clics é público (qualquer um pode chamar /api/click); serve como indicador, não é à prova de fraude.
- Ainda não entram (se quiser, é a próxima rodada): mapa do Google incorporado na página, anel de luz animado na borda,
  lista semanal que abre ao tocar no horário, animações de entrada.
