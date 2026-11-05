-- Verificação da migração 002. Rode DEPOIS de 001_base.sql e 002_painel.sql, no SQL Editor do Supabase.
-- Simula dono grátis, dono pago, outro dono e anônimo; imprime OK/FALHOU e apaga tudo no fim.

-- entra como o usuário u (null = anônimo)
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  end if;
end $f$;

-- executa um comando; devolve '' se passou, ou "SQLSTATE mensagem" se falhou
create or replace function pg_temp.err(stmt text) returns text language plpgsql as $f$
begin execute stmt; return ''; exception when others then return sqlstate || ' ' || sqlerrm; end $f$;

create or replace function pg_temp.verify_002() returns table (resultado text)
language plpgsql as $f$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  la uuid; lb uuid; res text := ''; cnt int; e text; j jsonb; i int;
  bgurl text;
begin
  insert into auth.users (id, email) values (a, 'v2-a@example.invalid'), (b, 'v2-b@example.invalid');

  -- A (grátis) cria perfil e 1 link
  perform pg_temp.as_user(a);
  insert into public.profiles (id, username, name) values (a, 'verif2-a', 'A');
  insert into public.links (profile_id, type, url, position) values (a, 'website', 'https://a.example/', 0) returning id into la;
  perform pg_temp.as_user(b);
  insert into public.profiles (id, username, name) values (b, 'verif2-b', 'B');
  insert into public.links (profile_id, type, url, position) values (b, 'website', 'https://b.example/', 0) returning id into lb;
  bgurl := 'https://x.supabase.co/storage/v1/object/public/backgrounds/' || a::text || '/bg.jpg';

  -- 1. grátis não grava campos pagos (PATCH direto na API)
  perform pg_temp.as_user(a);
  e := pg_temp.err(format('update public.profiles set bg_blur = 50 where id = %L', a));
  res := res || chr(10) || case when e like '%plano_pago%' then 'OK     grátis não grava bg_blur' else 'FALHOU grátis gravou bg_blur: ' || e end;
  e := pg_temp.err(format('update public.profiles set hours = %L::jsonb where id = %L', '{"mon":[["09:00","14:00"]]}', a));
  res := res || chr(10) || case when e like '%plano_pago%' then 'OK     grátis não grava horário' else 'FALHOU grátis gravou horário: ' || e end;
  e := pg_temp.err(format('update public.profiles set address = %L where id = %L', 'Calle 1', a));
  res := res || chr(10) || case when e like '%plano_pago%' then 'OK     grátis não grava endereço' else 'FALHOU grátis gravou endereço: ' || e end;
  e := pg_temp.err(format('update public.profiles set show_vcard = true where id = %L', a));
  res := res || chr(10) || case when e like '%plano_pago%' then 'OK     grátis não liga vcard' else 'FALHOU grátis ligou vcard: ' || e end;
  e := pg_temp.err(format('update public.profiles set bg_image_url = %L where id = %L', bgurl, a));
  res := res || chr(10) || case when e like '%plano_pago%' then 'OK     grátis não grava imagem de fundo' else 'FALHOU grátis gravou imagem de fundo: ' || e end;
  e := pg_temp.err(format('update public.links set style = %L::jsonb where id = %L', '{"glow":true}', la));
  res := res || chr(10) || case when e like '%plano_pago%' then 'OK     grátis não grava estilo de botão' else 'FALHOU grátis gravou estilo: ' || e end;
  e := pg_temp.err(format('update public.profiles set name = %L, bg_color = %L where id = %L', 'A2', '#112233', a));
  res := res || chr(10) || case when e = '' then 'OK     grátis ainda edita nome e cor' else 'FALHOU grátis não edita nome/cor: ' || e end;

  -- 2. grátis: 6º link recusado
  for i in 1..4 loop
    insert into public.links (profile_id, type, url, position) values (a, 'website', 'https://a.example/' || i, i);
  end loop;
  e := pg_temp.err(format('insert into public.links (profile_id,type,url,position) values (%L,%L,%L,5)', a, 'website', 'https://a.example/6'));
  res := res || chr(10) || case when e like '%limite_de_links%' then 'OK     grátis: 6º link recusado' else 'FALHOU grátis aceitou 6º link: ' || e end;

  -- 3. sem assinatura nem leitura: nem dono nem anônimo escrevem em subscriptions
  e := pg_temp.err(format('insert into public.subscriptions (profile_id,status,current_period_end) values (%L,%L,now()+interval ''30 days'')', a, 'active'));
  res := res || chr(10) || case when e <> '' then 'OK     dono não se dá o plano pago' else 'FALHOU dono criou a própria assinatura' end;
  perform pg_temp.as_user(null);
  e := pg_temp.err('select count(*) from public.subscriptions');
  res := res || chr(10) || case when e <> '' then 'OK     anônimo não lê subscriptions' else 'FALHOU anônimo leu subscriptions' end;
  e := pg_temp.err('select count(*) from public.clicks_daily');
  res := res || chr(10) || case when e <> '' then 'OK     anônimo não lê clicks_daily' else 'FALHOU anônimo leu clicks_daily' end;

  -- 4. o webhook (sem sessão) ativa o plano de A
  execute 'reset role';
  insert into public.subscriptions (profile_id, status, current_period_end) values (a, 'active', now() + interval '30 days');
  res := res || chr(10) || case when public.is_paid(a) and not public.is_paid(b) then 'OK     is_paid: A pago, B grátis' else 'FALHOU is_paid' end;

  -- 5. pago grava tudo e passa de 5 links
  perform pg_temp.as_user(a);
  e := pg_temp.err(format('update public.profiles set bg_blur = 50, address = %L, hours = %L::jsonb, show_vcard = true, bg_image_url = %L where id = %L',
        'Calle Mayor 1', '{"mon":[["09:00","14:00"]]}', bgurl, a));
  res := res || chr(10) || case when e = '' then 'OK     pago grava campos pagos' else 'FALHOU pago não grava: ' || e end;
  e := pg_temp.err(format('update public.links set style = %L::jsonb where id = %L', '{"color":"#ff0000","glow":true}', la));
  res := res || chr(10) || case when e = '' then 'OK     pago grava estilo do botão' else 'FALHOU pago estilo: ' || e end;
  insert into public.links (profile_id, type, url, position) values (a, 'website', 'https://a.example/6', 5), (a, 'website', 'https://a.example/7', 6);
  select count(*) into cnt from public.links where profile_id = a;
  res := res || chr(10) || case when cnt = 7 then 'OK     pago passa de 5 links' else 'FALHOU pago tem ' || cnt || ' links' end;

  -- 6. restrições de formato (mesmo pago)
  e := pg_temp.err(format('update public.profiles set bg_blur = 101 where id = %L', a));
  res := res || chr(10) || case when e like '23514%' then 'OK     bg_blur 101 recusado' else 'FALHOU bg_blur 101: ' || e end;
  e := pg_temp.err(format('update public.profiles set bg_blur = -1 where id = %L', a));
  res := res || chr(10) || case when e like '23514%' then 'OK     bg_blur -1 recusado' else 'FALHOU bg_blur -1: ' || e end;
  e := pg_temp.err(format('update public.profiles set hours = %L::jsonb where id = %L', '[1,2]', a));
  res := res || chr(10) || case when e like '23514%' then 'OK     horário que não é objeto recusado' else 'FALHOU horário array: ' || e end;
  e := pg_temp.err(format('update public.profiles set bg_image_url = %L where id = %L', 'https://evil.example/x.jpg', a));
  res := res || chr(10) || case when e like '23514%' then 'OK     imagem de fundo de outro site recusada' else 'FALHOU imagem externa: ' || e end;
  e := pg_temp.err(format('update public.profiles set bg_image_url = %L where id = %L', replace(bgurl, a::text, b::text), a));
  res := res || chr(10) || case when e like '23514%' then 'OK     imagem de fundo da pasta de outra pessoa recusada' else 'FALHOU imagem de outra pasta: ' || e end;
  e := pg_temp.err(format('update public.profiles set address = %L where id = %L', repeat('x', 201), a));
  res := res || chr(10) || case when e like '23514%' then 'OK     endereço longo demais recusado' else 'FALHOU endereço longo: ' || e end;
  e := pg_temp.err(format('update public.links set style = %L::jsonb where id = %L', '"texto"', la));
  res := res || chr(10) || case when e like '23514%' then 'OK     estilo que não é objeto recusado' else 'FALHOU estilo texto: ' || e end;

  -- 7. get_page pago traz extras e plano
  perform pg_temp.as_user(null);
  j := public.get_page('verif2-a');
  res := res || chr(10) || case when j->>'plan' = 'personalizado' and j#>>'{profile,hours,mon,0,0}' = '09:00' and (j#>>'{profile,bg_blur}')::int = 50
                                 and j#>>'{profile,address}' = 'Calle Mayor 1' and (j#>>'{profile,show_vcard}')::boolean
                                 and j#>>'{links,0,style,color}' = '#ff0000' and j#>>'{links,0,id}' is not null
                           then 'OK     get_page pago traz plano e extras' else 'FALHOU get_page pago: ' || coalesce(j::text, 'null') end;
  j := public.get_page('verif2-b');
  res := res || chr(10) || case when j->>'plan' = 'free' and j->'profile' ? 'hours' = false and j->'profile' ? 'bg_blur' = false and j->'profile' ? 'address' = false
                                 and j->'links'->0 ? 'style' = false and j->'profile' ? 'id' = false
                           then 'OK     get_page grátis sem campos pagos' else 'FALHOU get_page grátis: ' || coalesce(j::text, 'null') end;

  -- 8. cliques: pago conta, grátis e inexistente não
  perform pg_temp.as_user(null);
  e := pg_temp.err(format('select public.track_click(%L)', la)); perform public.track_click(la);
  perform public.track_click(lb);
  e := pg_temp.err(format('select public.track_click(%L)', gen_random_uuid()));
  res := res || chr(10) || case when e = '' then 'OK     track_click de link inexistente não falha' else 'FALHOU track_click inexistente: ' || e end;
  execute 'reset role';
  select coalesce(sum(n), 0) into cnt from public.clicks_daily where link_id = la;
  res := res || chr(10) || case when cnt = 2 then 'OK     track_click soma em perfil pago' else 'FALHOU cliques pago = ' || cnt end;
  select coalesce(sum(n), 0) into cnt from public.clicks_daily where link_id = lb;
  res := res || chr(10) || case when cnt = 0 then 'OK     track_click ignora perfil grátis' else 'FALHOU cliques grátis = ' || cnt end;

  -- 9. my_stats: só do dono, só se pago, com clamp
  perform pg_temp.as_user(a);
  select count(*) into cnt from public.my_stats(30) where link_id = la and n = 2;
  res := res || chr(10) || case when cnt = 1 then 'OK     my_stats mostra os cliques do dono' else 'FALHOU my_stats do dono' end;
  select count(*) into cnt from public.my_stats(100000);
  res := res || chr(10) || case when cnt = 7 then 'OK     my_stats(100000) lista os 7 links (clamp)' else 'FALHOU my_stats clamp: ' || cnt end;
  perform pg_temp.as_user(b);
  select count(*) into cnt from public.my_stats(30);
  res := res || chr(10) || case when cnt = 0 then 'OK     grátis não vê estatísticas' else 'FALHOU grátis viu estatísticas' end;
  perform pg_temp.as_user(null);
  e := pg_temp.err('select * from public.my_stats(30)');
  res := res || chr(10) || case when e <> '' then 'OK     anônimo não executa my_stats' else 'FALHOU anônimo executou my_stats' end;

  -- 10. assinatura vencida: volta ao grátis, nada é apagado
  execute 'reset role';
  update public.subscriptions set current_period_end = now() - interval '1 second' where profile_id = a;
  perform pg_temp.as_user(a);
  e := pg_temp.err(format('update public.profiles set bg_blur = 70 where id = %L', a));
  res := res || chr(10) || case when e like '%plano_pago%' then 'OK     vencido: volta a recusar campos pagos' else 'FALHOU vencido gravou: ' || e end;
  e := pg_temp.err(format('insert into public.links (profile_id,type,url,position) values (%L,%L,%L,8)', a, 'website', 'https://a.example/8'));
  res := res || chr(10) || case when e like '%limite_de_links%' then 'OK     vencido: não adiciona link (já tem 7)' else 'FALHOU vencido adicionou link: ' || e end;
  e := pg_temp.err(format('update public.profiles set name = %L where id = %L', 'A3', a));
  res := res || chr(10) || case when e = '' then 'OK     vencido: ainda edita o nome' else 'FALHOU vencido não edita nome: ' || e end;
  perform pg_temp.as_user(null);
  j := public.get_page('verif2-a');
  res := res || chr(10) || case when j->>'plan' = 'free' and j->'profile' ? 'hours' = false and j->'profile' ? 'bg_image_url' = false
                           then 'OK     vencido: página esconde os dados pagos' else 'FALHOU vencido get_page: ' || j::text end;
  execute 'reset role';
  select count(*) into cnt from public.profiles where id = a and bg_blur = 50 and hours is not null and address = 'Calle Mayor 1';
  res := res || chr(10) || case when cnt = 1 then 'OK     vencido: dados pagos continuam guardados' else 'FALHOU vencido apagou dados' end;
  perform public.track_click(la);
  select coalesce(sum(n), 0) into cnt from public.clicks_daily where link_id = la;
  res := res || chr(10) || case when cnt = 2 then 'OK     vencido: cliques deixam de contar' else 'FALHOU cliques vencido = ' || cnt end;
  -- reativar
  update public.subscriptions set current_period_end = now() + interval '30 days' where profile_id = a;
  perform pg_temp.as_user(null);
  j := public.get_page('verif2-a');
  res := res || chr(10) || case when j->>'plan' = 'personalizado' and (j#>>'{profile,bg_blur}')::int = 50 then 'OK     reativado: tudo reaparece' else 'FALHOU reativação: ' || j::text end;

  -- 11. status que não dá plano
  execute 'reset role';
  update public.subscriptions set status = 'canceled' where profile_id = a;
  res := res || chr(10) || case when not public.is_paid(a) then 'OK     status canceled não dá plano' else 'FALHOU canceled deu plano' end;
  update public.subscriptions set status = 'past_due' where profile_id = a;
  res := res || chr(10) || case when public.is_paid(a) then 'OK     past_due dentro do período segue pago' else 'FALHOU past_due' end;

  -- 12. storage: backgrounds só para pago, na própria pasta
  insert into storage.buckets (id, name, public) values ('backgrounds', 'backgrounds', true) on conflict do nothing;
  perform pg_temp.as_user(a);
  e := pg_temp.err(format('insert into storage.objects (bucket_id,name) values (%L,%L)', 'backgrounds', a::text || '/bg.jpg'));
  res := res || chr(10) || case when e = '' then 'OK     pago envia fundo para a própria pasta' else 'FALHOU pago upload: ' || e end;
  e := pg_temp.err(format('insert into storage.objects (bucket_id,name) values (%L,%L)', 'backgrounds', b::text || '/bg.jpg'));
  res := res || chr(10) || case when e <> '' then 'OK     não envia fundo para pasta alheia' else 'FALHOU upload em pasta alheia' end;
  perform pg_temp.as_user(b);
  e := pg_temp.err(format('insert into storage.objects (bucket_id,name) values (%L,%L)', 'backgrounds', b::text || '/bg.jpg'));
  res := res || chr(10) || case when e <> '' then 'OK     grátis não envia fundo' else 'FALHOU grátis enviou fundo' end;

  -- 13. cor única dos botões e logo sem recorte (campos pagos novos) + posição até 999
  execute 'reset role';
  update public.subscriptions set status = 'active' where profile_id = a;
  perform pg_temp.as_user(b);
  e := pg_temp.err(format('update public.profiles set btn_style = %L where id = %L', 'color', b));
  res := res || chr(10) || case when e like '%plano_pago%' then 'OK     grátis não muda btn_style' else 'FALHOU grátis mudou btn_style: ' || e end;
  e := pg_temp.err(format('update public.profiles set avatar_shape = %L where id = %L', 'logo', b));
  res := res || chr(10) || case when e like '%plano_pago%' then 'OK     grátis não muda avatar_shape' else 'FALHOU grátis mudou avatar_shape: ' || e end;
  perform pg_temp.as_user(a);
  e := pg_temp.err(format('update public.profiles set btn_style = %L, avatar_shape = %L where id = %L', 'color', 'logo_only', a));
  res := res || chr(10) || case when e = '' then 'OK     pago muda btn_style e avatar_shape' else 'FALHOU pago btn_style/avatar_shape: ' || e end;
  e := pg_temp.err(format('update public.profiles set btn_style = %L where id = %L', 'neon', a));
  res := res || chr(10) || case when e like '23514%' then 'OK     btn_style inválido recusado' else 'FALHOU btn_style neon: ' || e end;
  e := pg_temp.err(format('update public.profiles set avatar_shape = %L where id = %L', 'quadrado', a));
  res := res || chr(10) || case when e like '23514%' then 'OK     avatar_shape inválido recusado' else 'FALHOU avatar_shape quadrado: ' || e end;
  perform pg_temp.as_user(null);
  j := public.get_page('verif2-a');
  res := res || chr(10) || case when j#>>'{profile,btn_style}' = 'color' and j#>>'{profile,avatar_shape}' = 'logo_only' then 'OK     get_page pago traz btn_style e avatar_shape' else 'FALHOU get_page btn_style: ' || j::text end;
  j := public.get_page('verif2-b');
  res := res || chr(10) || case when j->'profile' ? 'btn_style' = false and j->'profile' ? 'avatar_shape' = false then 'OK     get_page grátis sem btn_style/avatar_shape' else 'FALHOU get_page grátis expõe btn_style' end;
  perform pg_temp.as_user(a);
  e := pg_temp.err(format('update public.links set position = 500 where id = %L', la));
  res := res || chr(10) || case when e = '' then 'OK     position 500 aceita (pago passa de 100 links)' else 'FALHOU position 500: ' || e end;
  e := pg_temp.err(format('update public.links set position = 1000 where id = %L', la));
  res := res || chr(10) || case when e like '23514%' then 'OK     position 1000 recusada' else 'FALHOU position 1000: ' || e end;

  -- limpeza
  execute 'reset role';
  -- o Supabase proíbe apagar direto em storage.objects; este ajuste vale só nesta transação e libera a limpeza do teste
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'backgrounds' and name like a::text || '/%';
  delete from public.subscriptions where profile_id in (a, b);
  delete from auth.users where id in (a, b);
  return query select regexp_split_to_table(ltrim(res, chr(10)), chr(10));
end $f$;

select * from pg_temp.verify_002();
