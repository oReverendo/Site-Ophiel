ALL2 FASE 1: contas + página grátis (passo a passo)
====================================================
Nada aqui altera as páginas em all2/*.html (as das placas NFC). Só entram arquivos novos e o vercel.json.

1) SUPABASE (projeto "oReverendo's Project")
   a. SQL Editor > New query > cole TODO o conteúdo de sql/001_base.sql > Run. Deve terminar sem erro.
   b. Nova query > cole sql/001_verify.sql > Run. A tabela de resultado deve ter só linhas "OK" (nenhuma "FALHOU").
   c. Authentication > URL Configuration > Redirect URLs > Add URL: https://www.ophiel.es/**
   d. Authentication > Sign In / Providers: "Allow new users to sign up" DESLIGADO (cadastro público só na fase 3).
   e. Authentication > Users > Add user > Create new user: um e-mail seu de teste + senha, marcando "Auto Confirm User".

2) VERCEL (antes de subir os arquivos)
   Project > Settings > Environment Variables (Production e Preview):
     SUPABASE_URL      = https://cwkoiurstvhupneizfss.supabase.co
     SUPABASE_ANON_KEY = a chave "Publishable" (sb_publishable_...)
   NUNCA coloque a "Secret key" aqui nesta fase.

3) GITHUB
   Suba o conteúdo deste ZIP mantendo as pastas (api/, lib/, js/, sql/, scripts/, tests/, assets/...).
   O Vercel faz o deploy sozinho. Espere terminar.

4) CONFERIR (em produção)
   - https://www.ophiel.es/all2/cementoymas   -> a página ANTIGA, igual a antes.
   - https://www.ophiel.es/entrar             -> entre com o usuário de teste -> cai em /painel -> manda para /criar.
   - Crie a página "teste-ana" (5 botões, foto, cores) -> abre https://www.ophiel.es/all2/teste-ana
   - Botão direito > "Ver código-fonte" em /all2/teste-ana: o nome do negócio aparece no HTML.
   - https://www.ophiel.es/all2/nao-existe-123 -> "Esta página no existe" (404).
   - Compartilhe /all2/teste-ana no WhatsApp: a prévia mostra nome e descrição.
   - Na foto, depois de escolher o arquivo, arraste para enquadrar e use o zoom antes de "Usar esta foto".
   - No plano grátis, todos os botões e ícones ficam na cor de botão escolhida (mudam juntos ao trocar a cor).
   Se /all2/cementoymas mostrar "Esta página no existe", AVISE: o rewrite precisa de ajuste.

Testes automáticos (opcional, no computador com Node): npm install && npm test
