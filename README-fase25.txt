ALL2 - FASE 2.5: PERSONALIZADO IGUAL AOS NOSSOS (Maddox, Loluca, Le Coquette...)
==============================================================================

O que entra
- Logo ajustável: tamanho (30-100 %), esquerda/direita (-100 a 100, o logo nunca sai do cartão) e para cima/baixo (-30 a 60 px),
  com botão "Volver al tamaño y posición originales". A prévia mostra tudo ao vivo.
- Anel de luz que gira em volta da página (liga/desliga em Tema). No celular acompanha a borda da tela; no computador, o cartão.
- Mapa do Google dentro da página (a partir da dirección). Ao tocar, abre o Google Maps. Liga/desliga em Ubicación;
  desligado, volta o botão "Cómo llegar".
- Horario que abre: tocar em "Abierto ahora" mostra a semana toda, com o dia de hoje em negrito.
- Animação de entrada (logo, descrição, botões em cascata, mapa). Quem pediu "menos movimento" no aparelho não vê animação.
- Navegadores dentro de apps (Instagram, Facebook), que dizem ter mouse, agora abrem em tela cheia como no celular.
- Imagem de fundo: agora sobe com até 1920 px no lado maior (nítida no computador) e cobre a tela em PC e celular
  (centralizada, "cover"). O desfoque 0-100 % e o vidro do cartão seguem como na fase 2.
- Tudo isso é só do plano Personalizado: o banco recusa mudança de quem não paga, e a página grátis não mostra nada disso.

PASSO A PASSO
1) Supabase > SQL Editor, nesta ordem, cada arquivo inteiro (001 e 002 só se ainda não rodou):
     sql/003_fase25.sql
     sql/003_verify.sql     (todas as linhas OK; deve dar 21)
     sql/002_verify.sql     (continua 52 OK)
   ATENÇÃO: depois do 003, NÃO rode o 002_painel.sql nem o 001_base.sql de novo (redefinem funções e desfazem a 2.5).
   Se rodar sem querer, rode o 003_fase25.sql logo em seguida.
2) GitHub: suba os arquivos do ZIP por cima dos existentes. O Vercel publica sozinho.
3) Variáveis do Vercel: nada novo.
4) Conferir (com a assinatura de teste da fase 2 ativa):
   - /painel > Tema > "Logo completo": aparecem os 3 deslizadores. Ajuste, Guardar, abra /all2/SEU-USUARIO.
   - Em Ubicación, ponha a dirección: o mapa aparece na página. Em Horario, toque em "Abierto ahora".
   - /all2/cementoymas (página antiga) continua igual.

NÃO ENTROU (de propósito)
- Ícone de estatísticas dentro da própria página (as estatísticas ficam no painel).
- Foco da imagem de fundo escolhido pelo cliente (ela sempre centraliza). Fácil de somar depois se for preciso.
- Enquadramento por foto como nas placas feitas à mão (ex.: "auto 136 %" da Maddox): lá é ajuste manual por imagem.
- O script de "aparelho que mente" só está na página Personalizada; a grátis continua sem nenhum JavaScript.
