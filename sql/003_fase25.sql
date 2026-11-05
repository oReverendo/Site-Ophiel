-- All2 fase 2.5: logo ajustável (tamanho e posição), anel de luz e mapa embutido.
-- Rode DEPOIS de 001_base.sql e 002_painel.sql, inteiro, no SQL Editor do Supabase. É seguro rodar de novo (idempotente).
-- ATENÇÃO: depois deste arquivo, NÃO rode o 002_painel.sql de novo (ele recriaria as funções antigas). Se rodar, rode o 003 em seguida.

alter table public.profiles add column if not exists logo_size smallint not null default 70;   -- % da largura do cartão
alter table public.profiles add column if not exists logo_x    smallint not null default 0;    -- posição horizontal: -100 (esquerda) .. 100 (direita), sempre dentro do cartão
alter table public.profiles add column if not exists logo_y    smallint not null default 0;    -- deslocamento vertical, em px (negativo = sobe)
alter table public.profiles add column if not exists show_ring boolean  not null default true;  -- anel de luz girando
alter table public.profiles add column if not exists show_map  boolean  not null default true;  -- mapa dentro da página

alter table public.profiles drop constraint if exists profiles_logo_size;
alter table public.profiles add constraint profiles_logo_size check (logo_size between 30 and 100);
alter table public.profiles drop constraint if exists profiles_logo_x;
alter table public.profiles add constraint profiles_logo_x check (logo_x between -100 and 100);
alter table public.profiles drop constraint if exists profiles_logo_y;
alter table public.profiles add constraint profiles_logo_y check (logo_y between -30 and 60);

-- Campos pagos: o banco recusa quando não há plano (mesma regra da fase 2 + os campos novos).
create or replace function public.profiles_paid_guard() returns trigger
language plpgsql set search_path = public as $$
declare changed boolean;
begin
  if auth.uid() is null or public.is_paid(new.id) then return new; end if;
  if tg_op = 'INSERT' then
    changed := new.bg_image_url is not null or new.bg_blur <> 0 or new.address is not null
            or new.hours is not null or new.show_vcard or new.timezone <> 'Europe/Madrid'
            or new.btn_style <> 'brand' or new.avatar_shape <> 'circle'
            or new.logo_size <> 70 or new.logo_x <> 0 or new.logo_y <> 0 or not new.show_ring or not new.show_map;
  else
    changed := new.bg_image_url is distinct from old.bg_image_url or new.bg_blur is distinct from old.bg_blur
            or new.address is distinct from old.address or new.hours is distinct from old.hours
            or new.show_vcard is distinct from old.show_vcard or new.timezone is distinct from old.timezone
            or new.btn_style is distinct from old.btn_style or new.avatar_shape is distinct from old.avatar_shape
            or new.logo_size is distinct from old.logo_size or new.logo_x is distinct from old.logo_x
            or new.logo_y is distinct from old.logo_y or new.show_ring is distinct from old.show_ring
            or new.show_map is distinct from old.show_map;
  end if;
  if changed then raise exception 'plano_pago' using errcode = 'P0001'; end if;
  return new;
end $$;

-- Página pública: os campos novos só saem para quem tem plano pago.
create or replace function public.get_page(p_username text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', case when x.pd then 'personalizado' else 'free' end,
    'profile', jsonb_build_object('username', p.username, 'name', p.name, 'bio', p.bio, 'avatar_url', p.avatar_url,
                                  'bg_color', p.bg_color, 'btn_color', p.btn_color)
      || case when x.pd then jsonb_build_object('bg_image_url', p.bg_image_url, 'bg_blur', p.bg_blur, 'address', p.address,
                                                'hours', p.hours, 'timezone', p.timezone, 'show_vcard', p.show_vcard,
                                                'btn_style', p.btn_style, 'avatar_shape', p.avatar_shape,
                                                'logo_size', p.logo_size, 'logo_x', p.logo_x, 'logo_y', p.logo_y,
                                                'show_ring', p.show_ring, 'show_map', p.show_map)
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

-- Fundos maiores: o bucket continua com 400 KB, mas a imagem agora chega com até 1920 px (nítida no computador).
