-- All2 fase 1: tabelas, regras de acesso (RLS), limite de 5 links, usuário único e imutável, bucket de fotos.
-- Rode inteiro no SQL Editor do Supabase. É seguro rodar de novo (idempotente).

-- ---------- Tabelas ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null,
  name        text not null default '',
  bio         text not null default '',
  avatar_url  text,
  bg_color    text not null default '#0b131c',
  btn_color   text not null default '#d9bd8a',
  created_at  timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  constraint profiles_name_len  check (char_length(name) <= 80),
  constraint profiles_bio_len   check (char_length(bio) <= 160),
  constraint profiles_bg_color  check (bg_color  ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'),
  constraint profiles_btn_color check (btn_color ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$')
);
-- A foto só pode vir do nosso bucket e da pasta do próprio perfil (sem rastreadores nem imagens de terceiros).
alter table public.profiles drop constraint if exists profiles_avatar_https;
alter table public.profiles drop constraint if exists profiles_avatar_url;
alter table public.profiles add constraint profiles_avatar_url check (
  avatar_url is null or avatar_url ~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/' || id::text || '/')
);
create unique index if not exists profiles_username_key on public.profiles (lower(username));

create table if not exists public.links (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  type        text not null,
  url         text not null,
  label       text,
  position    int  not null default 0,
  constraint links_type_format check (type ~ '^[a-z]{2,20}$'),
  constraint links_url_scheme  check (url ~ '^(https://|tel:|mailto:)' and char_length(url) <= 500),
  constraint links_label_len   check (label is null or char_length(label) <= 40),
  constraint links_position    check (position between 0 and 99)
);
create index if not exists links_profile_idx on public.links (profile_id, position);

create table if not exists public.reserved_usernames (name text primary key);

-- ---------- Nomes reservados (gerado por scripts/gen-reserved.mjs; não edite à mão) ----------
-- RESERVED:BEGIN
insert into public.reserved_usernames (name) values
  ('admin'),
  ('antonio-menchon'),
  ('antonio_menchon'),
  ('antoniomenchon'),
  ('api'),
  ('app'),
  ('ayuda'),
  ('bakery'),
  ('calzadosjudith'),
  ('celopman-elejido'),
  ('celopman_elejido'),
  ('celopmanelejido'),
  ('cementoymas'),
  ('criar'),
  ('delevel-adra'),
  ('delevel-ropa'),
  ('delevel-zapatos'),
  ('delevel_adra'),
  ('delevel_ropa'),
  ('delevel_zapatos'),
  ('deleveladra'),
  ('delevelropa'),
  ('delevelzapatos'),
  ('el-cotillon'),
  ('el-gato-goloso'),
  ('el_cotillon'),
  ('el_gato_goloso'),
  ('elcotillon'),
  ('elgatogoloso'),
  ('elixea'),
  ('entrar'),
  ('fulleria'),
  ('fusion-callejera'),
  ('fusion_callejera'),
  ('fusioncallejera'),
  ('gades-abdera'),
  ('gades-adra'),
  ('gades_abdera'),
  ('gades_adra'),
  ('gadesabdera'),
  ('gadesadra'),
  ('gadesbianco'),
  ('gemadaza'),
  ('graneropesca'),
  ('hierros-y-aluminios'),
  ('hierros_y_aluminios'),
  ('hierrosyaluminios'),
  ('jeonsa'),
  ('joyeria-aguadulce'),
  ('joyeria_aguadulce'),
  ('joyeriaaguadulce'),
  ('le-coquette'),
  ('le_coquette'),
  ('lecoquette'),
  ('login'),
  ('loluca'),
  ('maddox-centro-optico'),
  ('maddox_centro_optico'),
  ('maddoxcentrooptico'),
  ('mariquilla-lamoderna'),
  ('mariquilla_lamoderna'),
  ('mariquillalamoderna'),
  ('mariustattoo'),
  ('mia-bella'),
  ('mia_bella'),
  ('miabella'),
  ('michelle-serb'),
  ('michelle_serb'),
  ('michelleserb'),
  ('miri-love-nails'),
  ('miri_love_nails'),
  ('mirilovenails'),
  ('nube'),
  ('ophiel'),
  ('optica-jose-luis'),
  ('optica-orbera'),
  ('optica_jose_luis'),
  ('optica_orbera'),
  ('opticajoseluis'),
  ('opticaorbera'),
  ('painel'),
  ('palladium-salsa-aguadulce'),
  ('palladium-salsa-elejido'),
  ('palladium-salsa-roquetas'),
  ('palladium_salsa_aguadulce'),
  ('palladium_salsa_elejido'),
  ('palladium_salsa_roquetas'),
  ('palladiumsalsaaguadulce'),
  ('palladiumsalsaelejido'),
  ('palladiumsalsaroquetas'),
  ('placa'),
  ('planes'),
  ('polichinela'),
  ('precios'),
  ('quantum-reequilibrio'),
  ('quantum_reequilibrio'),
  ('quantumreequilibrio'),
  ('raullindefotografia'),
  ('roraima'),
  ('soporte'),
  ('studio-hair-27'),
  ('studio1314'),
  ('studio_hair_27'),
  ('studiohair27'),
  ('www')
on conflict do nothing;
-- RESERVED:END

-- ---------- Gatilhos ----------
-- Usuário: não pode ser reservado e nunca muda depois de criado (placas NFC impressas dependem dele).
-- security definer: quem chama não enxerga reserved_usernames (RLS sem políticas), mas o gatilho precisa ler.
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.reserved_usernames r where r.name = lower(new.username)) then
      raise exception 'username_reservado' using errcode = 'P0001';
    end if;
  elsif new.username is distinct from old.username then
    raise exception 'username_imutavel' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- Máximo de 5 links por perfil. A fase 3 troca este limite fixo pelo plano (grátis x personalizado).
-- O lock evita que duas inserções simultâneas passem juntas do limite.
create or replace function public.links_limit() returns trigger
language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.profile_id::text));
  if (select count(*) from public.links where profile_id = new.profile_id) >= 5 then
    raise exception 'limite_de_links' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists links_limit on public.links;
create trigger links_limit before insert on public.links
  for each row execute function public.links_limit();

-- ---------- Disponibilidade do usuário (usada pelo assistente) ----------
create or replace function public.username_available(u text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles p where lower(p.username) = lower(u))
     and not exists (select 1 from public.reserved_usernames r where r.name = lower(u));
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------- Leitura pública: só pela função (ninguém lista clientes com a chave pública) ----------
create or replace function public.get_page(p_username text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', jsonb_build_object('username', p.username, 'name', p.name, 'bio', p.bio, 'avatar_url', p.avatar_url,
                                  'bg_color', p.bg_color, 'btn_color', p.btn_color),
    'links', coalesce((select jsonb_agg(jsonb_build_object('type', l.type, 'url', l.url, 'label', l.label, 'position', l.position) order by l.position)
                       from public.links l where l.profile_id = p.id), '[]'::jsonb))
  from public.profiles p where lower(p.username) = lower(p_username);
$$;
revoke all on function public.get_page(text) from public, anon, authenticated;
grant execute on function public.get_page(text) to anon, authenticated;

-- ---------- Crear la página de una vez (perfil + links en una sola transacción) ----------
-- security invoker: las reglas de acceso (RLS) y los triggers siguen valiendo. Si algo falla, no queda un perfil a medias.
create or replace function public.create_page(p_profile jsonb, p_links jsonb) returns text
language plpgsql security invoker set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'sin_sesion' using errcode = '28000'; end if;
  insert into public.profiles (id, username, name, bio, avatar_url, bg_color, btn_color)
  values (uid, p_profile->>'username', coalesce(p_profile->>'name', ''), coalesce(p_profile->>'bio', ''),
          nullif(p_profile->>'avatar_url', ''), coalesce(p_profile->>'bg_color', '#0b131c'), coalesce(p_profile->>'btn_color', '#d9bd8a'));
  insert into public.links (profile_id, type, url, label, position)
  select uid, l.type, l.url, l.label, coalesce(l.position, 0)
  from jsonb_to_recordset(coalesce(p_links, '[]'::jsonb)) as l(type text, url text, label text, position int);
  return p_profile->>'username';
end $$;
revoke all on function public.create_page(jsonb, jsonb) from public;
grant execute on function public.create_page(jsonb, jsonb) to authenticated;

-- ---------- RLS ----------
alter table public.profiles          enable row level security;
alter table public.links             enable row level security;
alter table public.reserved_usernames enable row level security;  -- sem políticas: ninguém lê direto

revoke all on public.profiles, public.links from anon;

drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read   on public.profiles for select to authenticated using (auth.uid() = id);
create policy profiles_insert on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy profiles_update on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists links_read   on public.links;
drop policy if exists links_insert on public.links;
drop policy if exists links_update on public.links;
drop policy if exists links_delete on public.links;
create policy links_read   on public.links for select to authenticated using (profile_id = auth.uid());
create policy links_insert on public.links for insert to authenticated with check (profile_id = auth.uid());
create policy links_update on public.links for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy links_delete on public.links for delete to authenticated using (profile_id = auth.uid());

-- ---------- Storage: fotos (pasta <uid>/ de cada pessoa) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 204800, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = 204800,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

drop policy if exists avatars_read   on storage.objects;
drop policy if exists avatars_insert on storage.objects;
drop policy if exists avatars_update on storage.objects;
drop policy if exists avatars_delete on storage.objects;
-- O bucket é público (as URLs funcionam sem política); esta política só deixa cada pessoa ver a própria pasta (necessário para trocar a foto).
create policy avatars_read   on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
