ALL2 — FASE 3: COBRANÇA COM STRIPE (Personalizado 9,90 €/mês, IVA incluído)

O QUE MUDOU
- Botão "Pasar a Personalizado" (e todos os cadeados) agora abre o pagamento seguro do Stripe.
- Quem já é Personalizado vê "Gestionar suscripción" (portal do Stripe: cartão, faturas, cancelar).
- Ao voltar do pagamento o painel espera o plano ativar sozinho (alguns segundos).
- Cancelou ou falhou o cartão: continua com os extras até o fim do período já pago (regra que já existia no banco).
- Só o servidor grava em "subscriptions" (webhook com assinatura verificada). Ninguém consegue se dar o plano pelo navegador.

ARQUIVOS (suba por "Add files via upload", mantendo as pastas)
 NOVOS:   api/billing.js  api/stripe-webhook.js  lib/billing.js  lib/wait-plan.js
          tests/billing.test.js  tests/billing-api.test.js  tests/wait-plan.test.js  README-fase3.txt
 MUDADOS: lib/server.js  js/painel.js  painel.html  assets/cuenta.css
 Nenhum SQL novo: a tabela subscriptions já existe desde a fase 2.

PASSO A PASSO NO STRIPE (dashboard.stripe.com, modo real)
1. Catálogo de produtos > Adicionar produto: nome "All2 Personalizado", preço 9,90 EUR, recorrente, mensal.
   Em "Comportamento fiscal" escolha "Incluído" (o 9,90 já tem IVA). Salve e copie o ID do preço (price_...).
2. Desenvolvedores > Webhooks > Adicionar endpoint:
   URL: https://www.ophiel.es/api/stripe-webhook
   Eventos: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted
   Copie o "Segredo de assinatura" (whsec_...).
3. Configurações > Faturamento > Portal do cliente: ativar; permitir atualizar cartão, ver faturas e cancelar assinatura (cancelar ao fim do período).
4. Chave secreta: Desenvolvedores > Chaves de API > Criar chave restrita ("All2"), com permissão de ESCRITA em
   Checkout Sessions e Customer portal, e LEITURA em Subscriptions. Copie (rk_live_...). Pode usar a sk_live_ se preferir, mas a restrita é mais segura.

VARIÁVEIS NO VERCEL (projeto site-ophiel-pnk6 > Settings > Environment Variables; marque Production)
 STRIPE_SECRET_KEY          = a chave do passo 4
 STRIPE_PRICE_ID            = o price_... do passo 1
 STRIPE_WEBHOOK_SECRET      = o whsec_... do passo 2
 SUPABASE_SERVICE_ROLE_KEY  = Supabase > Project Settings > API Keys > "service_role" (secreta! nunca no navegador nem no GitHub)
 (opcional) STRIPE_AUTOMATIC_TAX = 1   só se ativar o Stripe Tax; SITE_URL só se o domínio mudar (padrão https://www.ophiel.es)
 Depois de salvar as variáveis: Deployments > ... > Redeploy (variáveis novas só valem em deploy novo).

COMO TESTAR
1. Entre no /painel com uma conta grátis e clique "Pasar a Personalizado · 9,90 €/mes".
2. Pague (pode ser o seu próprio cartão e cancelar/reembolsar depois; ou use um código promocional 100% criado no Stripe).
3. Você volta ao painel: "Estamos activando tu plan…" e em segundos vira "Plan Personalizado · renueva el …", com as abas liberadas.
4. "Gestionar suscripción" abre o portal. Cancelar ali: o painel passa a mostrar "termina el …" e o plano segue até essa data.
5. Se algo falhar: Stripe > Webhooks > seu endpoint mostra cada envio e a resposta (400 = segredo errado; 500 = falta variável no Vercel).

FALTA ANTES DE DIVULGAR (fase 4): termos de uso, política de privacidade, aviso do direito de desistimento (serviço digital, UE) e
os dados fiscais no Stripe (nome/NIF). O checkout já funciona sem isso, mas é o que a lei espanhola espera de quem cobra.
