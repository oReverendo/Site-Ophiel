-- All2 fase 2: plano (subscriptions), campos do plano Personalizado, cliques, bucket de fundos.
-- Rode DEPOIS de 001_base.sql, inteiro, no SQL Editor do Supabase. É seguro rodar de novo (idempotente).

-- ---------- Assinaturas (a fase 3 escreve aqui, só com a chave de serviço; ninguém escreve pelo navegador) ----------
create table if not exists public.subscriptions (
  profile_id             uuid primary key references public.profiles(id) on delete cascade,
  status                 text not null,
  current_period_end     timestamptz not null,
  cancel_at_period_end   boolean not null default false,
  stripe_customer_id     text,
  stripe_subscription_id text,
  updated_at             timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
drop policy if exists subscriptions_read on public.subscriptions;
create policy subscriptions_read on public.subscriptions for select to authenticated using (profile_id = auth.uid());

-- Pago = assinatura em estado vivo E período ainda não terminado (cancelou ou falhou cartão: vale até o fim do período).
create or replace function public.is_paid(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.subscriptions s
                 where s.profile_id = uid and s.status in ('active', 'trialing', 'past_due') and s.current_period_end > now());
$$;
revoke all on function public.is_paid(uuid) from public, anon;
grant execute on function public.is_paid(uuid) to authenticated;

-- ---------- Colunas do plano Personalizado ----------
alter table public.profiles add column if not exists bg_image_url text;
alter table public.profiles add column if not exists bg_blur      int  not null default 0;
alter table public.profiles add column if not exists address      text;
alter table public.profiles add column if not exists hours        jsonb;
alter table public.profiles add column if not exists timezone     text not null default 'Europe/Madrid';
alter table public.profiles add column if not exists show_vcard   boolean not null default false;
-- btn_style: 'brand' = cada rede na cor oficial; 'color' = todos os botões na cor escolhida (btn_color), sempre no acabamento "candy".
alter table public.profiles add column if not exists btn_style    text not null default 'brand';
-- avatar_shape: 'circle' = foto redonda; 'logo' = logo PNG inteiro, sem recorte, com o nome; 'logo_only' = só o logo (ele já traz o nome).
alter table public.profiles add column if not exists avatar_shape text not null default 'circle';
alter table public.links    add column if not exists style        jsonb not null default '{}'::jsonb;

alter table public.profiles drop constraint if exists profiles_btn_style;
alter table public.profiles add constraint profiles_btn_style check (btn_style in ('brand', 'color'));
alter table public.profiles drop constraint if exists profiles_avatar_shape;
alter table public.profiles add constraint profiles_avatar_shape check (avatar_shape in ('circle', 'logo', 'logo_only'));
-- "ilimitado" no plano pago: a posição passa do limite de 99 da fase 1.
alter table public.links drop constraint if exists links_position;
alter table public.links add constraint links_position check (position between 0 and 999);
alter table public.profiles drop constraint if exists profiles_bg_blur;
alter table public.profiles add constraint profiles_bg_blur check (bg_blur between 0 and 100);
alter table public.profiles drop constraint if exists profiles_address_len;
alter table public.profiles add constraint profiles_address_len check (address is null or char_length(address) <= 200);
alter table public.profiles drop constraint if exists profiles_hours_shape;
alter table public.profiles add constraint profiles_hours_shape check (hours is null or (jsonb_typeof(hours) = 'object' and octet_length(hours::text) <= 2000));
alter table public.profiles drop constraint if exists profiles_timezone_fmt;
alter table public.profiles add constraint profiles_timezone_fmt check (timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$' and char_length(timezone) <= 64);
alter table public.profiles drop constraint if exists profiles_bg_image_url;
alter table public.profiles add constraint profiles_bg_image_url check (
  bg_image_url is null or bg_image_url ~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/backgrounds/' || id::text || '/')
);
alter table public.links drop constraint if exists links_style_shape;
alter table public.links add constraint links_style_shape check (jsonb_typeof(style) = 'object' and octet_length(style::text) <= 200);

-- ---------- Campos pagos: o banco recusa quando não há plano ----------
-- Sem sessão (auth.uid() nulo = chave de serviço / SQL Editor) passa. Quem voltou ao grátis mantém o que já tem guardado,
-- mas não consegue mudar nem apagar os campos pagos (ficam escondidos na página, não perdidos).
create or replace function public.profiles_paid_guard() returns trigger
language plpgsql set search_path = public as $$
declare changed boolean;
begin
  if auth.uid() is null or public.is_paid(new.id) then return new; end if;
  if tg_op = 'INSERT' then
    changed := new.bg_image_url is not null or new.bg_blur <> 0 or new.address is not null
            or new.hours is not null or new.show_vcard or new.timezone <> 'Europe/Madrid'
            or new.btn_style <> 'brand' or new.avatar_shape <> 'circle';
  else
    changed := new.bg_image_url is distinct from old.bg_image_url or new.bg_blur is distinct from old.bg_blur
            or new.address is distinct from old.address or new.hours is distinct from old.hours
            or new.show_vcard is distinct from old.show_vcard or new.timezone is distinct from old.timezone
            or new.btn_style is distinct from old.btn_style or new.avatar_shape is distinct from old.avatar_shape;
  end if;
  if changed then raise exception 'plano_pago' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists profiles_paid_guard on public.profiles;
create trigger profiles_paid_guard before insert or update on public.profiles
  for each row execute function public.profiles_paid_guard();

create or replace function public.links_paid_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_paid(new.profile_id) then return new; end if;
  if (tg_op = 'INSERT' and new.style <> '{}'::jsonb) or (tg_op = 'UPDATE' and new.style is distinct from old.style) then
    raise exception 'plano_pago' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists links_paid_guard on public.links;
create trigger links_paid_guard before insert or update on public.links
  for each row execute function public.links_paid_guard();

-- Limite de links: 5 no grátis, sem limite no pago.
create or replace function public.links_limit() returns trigger
language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.profile_id::text));
  if not public.is_paid(new.profile_id)
     and (select count(*) from public.links where profile_id = new.profile_id) >= 5 then
    raise exception 'limite_de_links' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ---------- Página pública: devolve o plano e esconde dados pagos de quem não paga ----------
create or replace function public.get_page(p_username text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', case when x.pd then 'personalizado' else 'free' end,
    'profile', jsonb_build_object('username', p.username, 'name', p.name, 'bio', p.bio, 'avatar_url', p.avatar_url,
                                  'bg_color', p.bg_color, 'btn_color', p.btn_color)
      || case when x.pd then jsonb_build_object('bg_image_url', p.bg_image_url, 'bg_blur', p.bg_blur, 'address', p.address,
                                                'hours', p.hours, 'timezone', p.timezone, 'show_vcard', p.show_vcard,
                                                'btn_style', p.btn_style, 'avatar_shape', p.avatar_shape)
              else '{}'::jsonb end,
    'links', coalesce((select jsonb_agg(
                 jsonb_build_object('id', l.id, 'type', l.type, 'url', l.url, 'label', l.label, 'position', l.position)
                   || case when x.pd then jsonb_build_object('style', l.style) else '{}'::jsonb end
                 order by l.position)
               from public.links l where l.profile_id = p.id), '[]'::jsonb))
  from public.profiles p
  cross join lateral (select public.is_paid(p.id) as pd) x
  where lower(p.username) = lower(p_username);
$$;
revoke all on function public.get_page(text) from public, anon, authenticated;
grant execute on function public.get_page(text) to anon, authenticated;

-- ---------- Cliques (só contagem por link e dia; sem IP, sem dados pessoais) ----------
create table if not exists public.clicks_daily (
  link_id uuid not null references public.links(id) on delete cascade,
  day     date not null,
  n       int  not null default 0,
  primary key (link_id, day)
);
alter table public.clicks_daily enable row level security;   -- sem políticas: ninguém lê direto
revoke all on public.clicks_daily from anon, authenticated;

create or replace function public.track_click(p_link uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.clicks_daily (link_id, day, n)
  select l.id, current_date, 1 from public.links l
  where l.id = p_link and public.is_paid(l.profile_id)
  on conflict (link_id, day) do update set n = public.clicks_daily.n + 1;
$$;
revoke all on function public.track_click(uuid) from public, anon, authenticated;
grant execute on function public.track_click(uuid) to anon, authenticated;

-- Estatísticas do dono (só plano pago): uma linha por link (day nulo = sem cliques no período) ou por link e dia.
create or replace function public.my_stats(p_days int default 30)
returns table (link_id uuid, label text, type text, day date, n int)
language sql stable security definer set search_path = public as $$
  select l.id, l.label, l.type, c.day, coalesce(c.n, 0)
  from public.links l
  left join public.clicks_daily c on c.link_id = l.id and c.day > current_date - greatest(1, least(coalesce(p_days, 30), 365))
  where l.profile_id = auth.uid() and public.is_paid(auth.uid())
  order by l.position, c.day;
$$;
revoke all on function public.my_stats(int) from public, anon, authenticated;
grant execute on function public.my_stats(int) to authenticated;

-- ---------- Storage: fundos (pasta <uid>/; só quem tem plano pode enviar) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backgrounds', 'backgrounds', true, 409600, array['image/webp', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 409600, allowed_mime_types = array['image/webp', 'image/jpeg'];

drop policy if exists backgrounds_read   on storage.objects;
drop policy if exists backgrounds_insert on storage.objects;
drop policy if exists backgrounds_update on storage.objects;
drop policy if exists backgrounds_delete on storage.objects;
create policy backgrounds_read   on storage.objects for select to authenticated
  using (bucket_id = 'backgrounds' and (storage.foldername(name))[1] = auth.uid()::text);
create policy backgrounds_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'backgrounds' and (storage.foldername(name))[1] = auth.uid()::text and public.is_paid(auth.uid()));
create policy backgrounds_update on storage.objects for update to authenticated
  using (bucket_id = 'backgrounds' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'backgrounds' and (storage.foldername(name))[1] = auth.uid()::text and public.is_paid(auth.uid()));
create policy backgrounds_delete on storage.objects for delete to authenticated
  using (bucket_id = 'backgrounds' and (storage.foldername(name))[1] = auth.uid()::text);
