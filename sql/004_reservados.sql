-- Fase 2.6: nombres que ya no se pueden elegir como usuario (rutas nuevas). Se puede ejecutar más de una vez.
insert into public.reserved_usernames (name) values ('all2'), ('cadastro'), ('registro'), ('signup')
on conflict (name) do nothing;
select name from public.reserved_usernames where name in ('all2','cadastro','registro','signup') order by name;
