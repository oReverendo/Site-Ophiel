-- Verificação da migração 001. Rode DEPOIS de 001_base.sql, no SQL Editor do Supabase.
-- Cria 4 usuários de teste, simula cada papel (A, B, anônimo), imprime OK/FALHOU e apaga tudo no fim.
create or replace function pg_temp.verify_001() returns table (resultado text)
language plpgsql as $f$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  res text := ''; n int; st text; i int; ok boolean;
begin
  insert into auth.users (id, email) values
    (a, 'verify-a@example.invalid'), (b, 'verify-b@example.invalid'),
    (c, 'verify-c@example.invalid'), (d, 'verify-d@example.invalid');

  -- 1. A cria o próprio perfil
  begin
    execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    insert into public.profiles (id, username, name) values (a, 'verif-a', 'A');
    res := res || chr(10) || 'OK     A cria o próprio perfil';
  exception when others then res := res || chr(10) || ('FALHOU A cria o próprio perfil: ' || sqlerrm);
  end;

  -- 2. B cria o próprio perfil e um link
  begin
    execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    insert into public.profiles (id, username, name) values (b, 'verif-b', 'B');
    insert into public.links (profile_id, type, url, position) values (b, 'website', 'https://b.example/', 0);
    res := res || chr(10) || 'OK     B cria perfil e link';
  exception when others then res := res || chr(10) || ('FALHOU B cria perfil e link: ' || sqlerrm);
  end;

  -- 3. A não cria perfil com o id de outra pessoa
  begin
    execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    insert into public.profiles (id, username, name) values (c, 'verif-c', 'C');
    res := res || chr(10) || 'FALHOU A conseguiu criar perfil com id de outra pessoa';
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    res := res || chr(10) || case when st = '42501' then 'OK     A não cria perfil com id de outra pessoa' else 'FALHOU A não cria perfil com id alheio, mas por outro motivo: ' || sqlerrm end;
  end;

  -- 4. A não altera nem apaga links de B
  begin
    execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    update public.links set url = 'https://hack.example/' where profile_id = b; get diagnostics n = row_count;
    res := res || chr(10) || case when n = 0 then 'OK     A não altera links de B' else 'FALHOU A alterou links de B' end;
    delete from public.links where profile_id = b; get diagnostics n = row_count;
    res := res || chr(10) || case when n = 0 then 'OK     A não apaga links de B' else 'FALHOU A apagou links de B' end;
    insert into public.links (profile_id, type, url, position) values (b, 'website', 'https://hack.example/', 1);
    res := res || chr(10) || 'FALHOU A inseriu link no perfil de B';
  exception when others then
    get stacked diagnostics st = returned_sqlstate;
    res := res || chr(10) || case when st = '42501' then 'OK     A não insere link no perfil de B' else 'FALHOU inserção em perfil alheio recusada por outro motivo: ' || sqlerrm end;
  end;

  -- 5. Anônimo: não lista tabelas, só lê páginas pela função get_page; não escreve
  begin
    execute 'reset role'; perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
    begin
      select count(*) into n from public.profiles;
      res := res || chr(10) || 'FALHOU anônimo consegue listar perfis';
    exception when insufficient_privilege then res := res || chr(10) || 'OK     anônimo não lista perfis direto';
    end;
    begin
      select count(*) into n from public.links;
      res := res || chr(10) || 'FALHOU anônimo consegue listar links';
    exception when insufficient_privilege then res := res || chr(10) || 'OK     anônimo não lista links direto';
    end;
    res := res || chr(10) || case when (public.get_page('verif-a')->'profile'->>'name') = 'A' then 'OK     get_page devolve o perfil' else 'FALHOU get_page não devolveu o perfil de verif-a' end;
    res := res || chr(10) || case when jsonb_array_length(public.get_page('verif-b')->'links') = 1 then 'OK     get_page devolve os links' else 'FALHOU get_page não devolveu os links de verif-b' end;
    res := res || chr(10) || case when public.get_page('nao-existe-xx') is null then 'OK     get_page de usuário inexistente = null' else 'FALHOU get_page inventou uma página' end;
    res := res || chr(10) || case when public.get_page('verif-a')->'profile' ? 'id' then 'FALHOU get_page vaza o id' else 'OK     get_page não vaza o id do usuário' end;
    begin
      update public.profiles set name = 'hack' where id = a; get diagnostics n = row_count;
      res := res || chr(10) || case when n = 0 then 'OK     anônimo não altera perfil' else 'FALHOU anônimo alterou perfil' end;
    exception when others then res := res || chr(10) || 'OK     anônimo não altera perfil (recusado)';
    end;
    begin
      insert into public.profiles (id, username, name) values (c, 'verif-c', 'C');
      res := res || chr(10) || 'FALHOU anônimo criou perfil';
    exception when others then res := res || chr(10) || 'OK     anônimo não cria perfil';
    end;
  exception when others then res := res || chr(10) || ('FALHOU bloco do anônimo: ' || sqlerrm);
  end;

  -- 5b. Usuário logado só lê o próprio perfil direto; a foto só pode vir do nosso bucket
  begin
    execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    select count(*) into n from public.profiles where id = b;
    res := res || chr(10) || case when n = 0 then 'OK     A não lê o perfil de B direto' else 'FALHOU A leu o perfil de B direto' end;
    select count(*) into n from public.profiles where id = a;
    res := res || chr(10) || case when n = 1 then 'OK     A lê o próprio perfil' else 'FALHOU A não lê o próprio perfil' end;
    begin
      update public.profiles set avatar_url = 'https://tracker.example/p.gif' where id = a;
      res := res || chr(10) || 'FALHOU foto de outro site aceita';
    exception when check_violation then res := res || chr(10) || 'OK     foto de outro site é recusada';
    end;
    begin
      update public.profiles set avatar_url = 'https://abc.supabase.co/storage/v1/object/public/avatars/' || b || '/avatar.webp' where id = a;
      res := res || chr(10) || 'FALHOU foto da pasta de outra pessoa aceita';
    exception when check_violation then res := res || chr(10) || 'OK     foto da pasta de outra pessoa é recusada';
    end;
    update public.profiles set avatar_url = 'https://abc.supabase.co/storage/v1/object/public/avatars/' || a || '/avatar.webp?v=1' where id = a; get diagnostics n = row_count;
    res := res || chr(10) || case when n = 1 then 'OK     foto do próprio bucket/pasta é aceita' else 'FALHOU foto legítima recusada' end;
  exception when others then res := res || chr(10) || ('FALHOU bloco 5b: ' || sqlerrm);
  end;

  -- 6. A insere 5 links e o 6º falha
  begin
    execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    for i in 0..4 loop
      insert into public.links (profile_id, type, url, position) values (a, 'website', 'https://a' || i || '.example/', i);
    end loop;
    res := res || chr(10) || 'OK     A insere 5 links';
    begin
      insert into public.links (profile_id, type, url, position) values (a, 'website', 'https://a5.example/', 5);
      res := res || chr(10) || 'FALHOU o 6º link foi aceito';
    exception when others then
      res := res || chr(10) || case when sqlerrm = 'limite_de_links' then 'OK     o 6º link é recusado' else 'FALHOU 6º link recusado por outro motivo: ' || sqlerrm end;
    end;
  exception when others then res := res || chr(10) || ('FALHOU A insere 5 links: ' || sqlerrm);
  end;

  -- 7. Links inválidos (javascript:, http:) são recusados pelo banco
  begin
    execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    ok := true;
    begin insert into public.links (profile_id, type, url, position) values (b, 'website', 'javascript:alert(1)', 2); ok := false; exception when check_violation then null; end;
    begin insert into public.links (profile_id, type, url, position) values (b, 'website', 'http://inseguro.example/', 2); ok := false; exception when check_violation then null; end;
    res := res || chr(10) || case when ok then 'OK     banco recusa javascript: e http:' else 'FALHOU banco aceitou url insegura' end;
  exception when others then res := res || chr(10) || ('FALHOU bloco de urls: ' || sqlerrm);
  end;

  -- 8. Formato do usuário (C e D ainda não têm perfil)
  begin
    execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    begin insert into public.profiles (id, username) values (c, 'Maria'); res := res || chr(10) || 'FALHOU maiúscula aceita';
    exception when check_violation then res := res || chr(10) || 'OK     usuário "Maria" (maiúscula) recusado'; end;
    begin insert into public.profiles (id, username) values (c, 'ma'); res := res || chr(10) || 'FALHOU usuário curto aceito';
    exception when check_violation then res := res || chr(10) || 'OK     usuário "ma" (curto) recusado'; end;
    begin insert into public.profiles (id, username) values (c, '-maria'); res := res || chr(10) || 'FALHOU hífen na borda aceito';
    exception when check_violation then res := res || chr(10) || 'OK     usuário "-maria" recusado'; end;
    begin insert into public.profiles (id, username) values (c, 'Verif-A'); res := res || chr(10) || 'FALHOU duplicado (maiúscula) aceito';
    exception when check_violation then res := res || chr(10) || 'OK     "Verif-A" recusado pelo formato'; end;
    begin insert into public.profiles (id, username) values (c, 'verif-a'); res := res || chr(10) || 'FALHOU duplicado aceito';
    exception when unique_violation then res := res || chr(10) || 'OK     usuário duplicado recusado'; end;
    begin insert into public.profiles (id, username) values (c, 'admin'); res := res || chr(10) || 'FALHOU reservado "admin" aceito';
    exception when others then res := res || chr(10) || case when sqlerrm = 'username_reservado' then 'OK     reservado "admin" recusado' else 'FALHOU "admin" recusado por outro motivo: ' || sqlerrm end; end;
    begin insert into public.profiles (id, username) values (c, 'cementoymas'); res := res || chr(10) || 'FALHOU nome de all2 existente aceito';
    exception when others then res := res || chr(10) || case when sqlerrm = 'username_reservado' then 'OK     nome de all2 existente recusado' else 'FALHOU all2 recusado por outro motivo: ' || sqlerrm end; end;
  exception when others then res := res || chr(10) || ('FALHOU bloco de usuário: ' || sqlerrm);
  end;

  -- 9. A não muda o próprio usuário, mas muda o nome
  begin
    execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    begin update public.profiles set username = 'verif-novo' where id = a; res := res || chr(10) || 'FALHOU A mudou o usuário';
    exception when others then res := res || chr(10) || case when sqlerrm = 'username_imutavel' then 'OK     A não muda o próprio usuário' else 'FALHOU mudança de usuário recusada por outro motivo: ' || sqlerrm end; end;
    update public.profiles set name = 'A novo' where id = a; get diagnostics n = row_count;
    res := res || chr(10) || case when n = 1 then 'OK     A muda o próprio nome' else 'FALHOU A não conseguiu mudar o nome' end;
  exception when others then res := res || chr(10) || ('FALHOU bloco de edição: ' || sqlerrm);
  end;

  -- 10. username_available
  begin
    execute 'reset role'; perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
    res := res || chr(10) || case when public.username_available('cementoymas') = false then 'OK     username_available(cementoymas) = false' else 'FALHOU cementoymas aparece livre' end;
    res := res || chr(10) || case when public.username_available('verif-a') = false then 'OK     username_available(verif-a) = false' else 'FALHOU verif-a aparece livre' end;
    res := res || chr(10) || case when public.username_available('livre-123') = true then 'OK     username_available(livre-123) = true' else 'FALHOU livre-123 aparece ocupado' end;
  exception when others then res := res || chr(10) || ('FALHOU username_available: ' || sqlerrm);
  end;

  -- 11. create_page é atômica: seis links falham e não deixam perfil a medias; com dois links funciona
  begin
    execute 'reset role'; perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true); execute 'set local role authenticated';
    begin
      perform public.create_page('{"username":"verif-c"}'::jsonb,
        '[{"type":"website","url":"https://1.example/","position":0},{"type":"website","url":"https://2.example/","position":1},{"type":"website","url":"https://3.example/","position":2},{"type":"website","url":"https://4.example/","position":3},{"type":"website","url":"https://5.example/","position":4},{"type":"website","url":"https://6.example/","position":5}]'::jsonb);
      res := res || chr(10) || 'FALHOU create_page aceitou 6 links';
    exception when others then
      select count(*) into n from public.profiles where id = c;
      res := res || chr(10) || case when n = 0 then 'OK     create_page com 6 links falha e não deixa perfil' else 'FALHOU create_page deixou perfil a medias' end;
    end;
    begin
      perform public.create_page('{"username":"verif-c","name":"C"}'::jsonb, '[{"type":"instagram","url":"https://www.instagram.com/c","position":0},{"type":"website","url":"https://c.example/","position":1}]'::jsonb);
      select count(*) into n from public.links where profile_id = c;
      res := res || chr(10) || case when n = 2 then 'OK     create_page cria perfil e 2 links' else 'FALHOU create_page criou ' || n || ' links' end;
    exception when others then res := res || chr(10) || ('FALHOU create_page: ' || sqlerrm);
    end;
    execute 'reset role'; perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
    begin
      perform public.create_page('{"username":"verif-anon"}'::jsonb, '[]'::jsonb);
      res := res || chr(10) || 'FALHOU anônimo executou create_page';
    exception when others then res := res || chr(10) || 'OK     anônimo não executa create_page';
    end;
  exception when others then res := res || chr(10) || ('FALHOU bloco create_page: ' || sqlerrm);
  end;

  -- limpeza
  execute 'reset role';
  delete from auth.users where id in (a, b, c, d);
  return query select regexp_split_to_table(ltrim(res, chr(10)), chr(10));
end $f$;

select * from pg_temp.verify_001();
