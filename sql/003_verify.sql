-- Verificação da migração 003 (fase 2.5). Rode DEPOIS de 001, 002 e 003, no SQL Editor do Supabase.
-- Simula dono grátis e dono pago; imprime OK/FALHOU e apaga tudo no fim.

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  execute 'reset role';
  if u is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
  end if;
end $f$;

create or replace function pg_temp.err(stmt text) returns text language plpgsql as $f$
begin execute stmt; return ''; exception when others then return sqlstate || ' ' || sqlerrm; end $f$;

create or replace function pg_temp.verify_003() returns table (resultado text)
language plpgsql as $f$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  res text := ''; e text; j jsonb; col text;
begin
  insert into auth.users (id, email) values (a, 'v3-a@example.invalid'), (b, 'v3-b@example.invalid');
  perform pg_temp.as_user(a);
  insert into public.profiles (id, username, name) values (a, 'verif3-a', 'A');
  perform pg_temp.as_user(b);
  insert into public.profiles (id, username, name) values (b, 'verif3-b', 'B');

  -- 1. valores de fábrica
  perform pg_temp.as_user(null);
  j := public.get_page('verif3-a');
  res := res || chr(10) || case when not (j->'profile' ? 'logo_size') then 'OK     get_page grátis não traz logo_size' else 'FALHOU get_page grátis traz logo_size' end;
  res := res || chr(10) || case when not (j->'profile' ? 'show_ring') and not (j->'profile' ? 'show_map') then 'OK     get_page grátis não traz show_ring/show_map' else 'FALHOU get_page grátis expõe anel/mapa' end;

  -- 2. grátis não grava nenhum campo novo
  perform pg_temp.as_user(b);
  foreach col in array array['logo_size = 50', 'logo_x = 10', 'logo_y = 10', 'show_ring = false', 'show_map = false'] loop
    e := pg_temp.err(format('update public.profiles set %s where id = %L', col, b));
    res := res || chr(10) || case when e like '%plano_pago%' then 'OK     grátis não muda ' || col else 'FALHOU grátis mudou ' || col || ': ' || e end;
  end loop;
  e := pg_temp.err(format('update public.profiles set name = %L where id = %L', 'B2', b));
  res := res || chr(10) || case when e = '' then 'OK     grátis ainda edita o nome' else 'FALHOU grátis nome: ' || e end;

  -- 3. pago: grava, valida faixas
  execute 'reset role';
  insert into public.subscriptions (profile_id, status, current_period_end) values (a, 'active', now() + interval '30 days');
  perform pg_temp.as_user(a);
  e := pg_temp.err(format('update public.profiles set logo_size = 55, logo_x = -12, logo_y = 30, show_ring = false, show_map = false where id = %L', a));
  res := res || chr(10) || case when e = '' then 'OK     pago grava logo e anel/mapa' else 'FALHOU pago grava: ' || e end;
  foreach col in array array['logo_size = 29', 'logo_size = 101', 'logo_x = -101', 'logo_x = 101', 'logo_y = -31', 'logo_y = 61'] loop
    e := pg_temp.err(format('update public.profiles set %s where id = %L', col, a));
    res := res || chr(10) || case when e like '23514%' then 'OK     fora da faixa recusado: ' || col else 'FALHOU aceitou ' || col || ': ' || e end;
  end loop;
  e := pg_temp.err(format('update public.profiles set logo_size = 30, logo_x = 100, logo_y = -30 where id = %L', a));
  res := res || chr(10) || case when e = '' then 'OK     limites exatos aceitos' else 'FALHOU limites: ' || e end;
  e := pg_temp.err(format('update public.profiles set logo_size = 60, logo_x = -12, logo_y = 30 where id = %L', a));

  perform pg_temp.as_user(null);
  j := public.get_page('verif3-a');
  res := res || chr(10) || case when (j#>>'{profile,logo_size}')::int = 60 and (j#>>'{profile,logo_x}')::int = -12 and (j#>>'{profile,logo_y}')::int = 30
    and (j#>>'{profile,show_ring}')::boolean = false and (j#>>'{profile,show_map}')::boolean = false then 'OK     get_page pago traz os campos novos' else 'FALHOU get_page pago: ' || j::text end;

  -- 4. assinatura vencida: some da página, fica guardado, não dá para mudar
  execute 'reset role';
  update public.subscriptions set current_period_end = now() - interval '1 second' where profile_id = a;
  perform pg_temp.as_user(null);
  j := public.get_page('verif3-a');
  res := res || chr(10) || case when not (j->'profile' ? 'logo_size') and not (j->'profile' ? 'show_ring') then 'OK     vencido: campos novos escondidos' else 'FALHOU vencido expõe campos' end;
  perform pg_temp.as_user(a);
  e := pg_temp.err(format('update public.profiles set logo_size = 80 where id = %L', a));
  res := res || chr(10) || case when e like '%plano_pago%' then 'OK     vencido: não muda logo_size' else 'FALHOU vencido mudou logo_size: ' || e end;
  execute 'reset role';
  update public.subscriptions set current_period_end = now() + interval '30 days' where profile_id = a;
  perform pg_temp.as_user(null);
  j := public.get_page('verif3-a');
  res := res || chr(10) || case when (j#>>'{profile,logo_size}')::int = 60 then 'OK     reassinou: os valores guardados voltam' else 'FALHOU reassinar: ' || j::text end;

  -- 5. serviço (sem sessão) escreve sem travar
  execute 'reset role';
  e := pg_temp.err(format('update public.profiles set logo_size = 70 where id = %L', b));
  res := res || chr(10) || case when e = '' then 'OK     chave de serviço grava campo novo' else 'FALHOU serviço: ' || e end;

  execute 'reset role';
  delete from public.subscriptions where profile_id in (a, b);
  delete from auth.users where id in (a, b);
  return query select regexp_split_to_table(ltrim(res, chr(10)), chr(10));
end $f$;

select * from pg_temp.verify_003();
