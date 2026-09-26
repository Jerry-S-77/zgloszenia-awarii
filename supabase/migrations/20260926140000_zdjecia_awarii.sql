-- Zdjęcia do zgłoszeń awarii: do 3 na awarię, prywatny kubełek Storage, ścieżka <awaria_id>/<id>.jpg.
-- Id zdjęcia nadaje klient (kolejka offline musi móc bezpiecznie ponowić wysyłkę).

create table public.awarie_zdjecia (
  id uuid primary key,
  awaria_id uuid not null references public.awarie (id) on delete cascade,
  autor_id uuid references public.profiles (id) on delete set null,
  autor_nazwa text,
  created_at timestamptz not null default now()
);
alter table public.awarie_zdjecia enable row level security;
revoke all on public.awarie_zdjecia from anon, authenticated;
grant select, insert, delete on public.awarie_zdjecia to authenticated;
grant all on public.awarie_zdjecia to service_role;
create index awarie_zdjecia_awaria_id_idx on public.awarie_zdjecia (awaria_id, created_at);

create policy awarie_zdjecia_select on public.awarie_zdjecia for select to authenticated
  using (public.widzi_awarie(awaria_id));
create policy awarie_zdjecia_insert on public.awarie_zdjecia for insert to authenticated
  with check (public.widzi_awarie(awaria_id));
create policy awarie_zdjecia_delete on public.awarie_zdjecia for delete to authenticated
  using (
    public.widzi_awarie(awaria_id)
    and (autor_id = auth.uid() or public.mam_role(array['admin']::public.rola_uzytkownika[]))
  );

-- Autor z konta (nigdy z klienta) i limit 3 zdjęć na awarię. Blokada doradcza serializuje równoległe
-- dodawanie do tej samej awarii, więc dwa jednoczesne zapisy nie przekroczą limitu.
create or replace function public.zdjecia_przed_dodaniem()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.autor_id := auth.uid();
  end if;
  new.autor_nazwa := (select p.imie_nazwisko from public.profiles p where p.id = new.autor_id);
  new.created_at := now();
  perform pg_advisory_xact_lock(hashtext('awarie_zdjecia:' || new.awaria_id::text));
  if (select count(*) from public.awarie_zdjecia z where z.awaria_id = new.awaria_id) >= 3 then
    raise exception 'Do jednej awarii można dodać najwyżej 3 zdjęcia.' using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke all on function public.zdjecia_przed_dodaniem() from public, anon, authenticated;

create trigger awarie_zdjecia_przed_dodaniem
  before insert on public.awarie_zdjecia
  for each row execute function public.zdjecia_przed_dodaniem();

-- Dodanie i usunięcie zdjęcia widać w historii awarii.
create or replace function public.zdjecia_zapisz_historie()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.awarie_historia (awaria_id, autor_id, typ, dane)
      values (new.awaria_id, auth.uid(), 'edycja',
              jsonb_build_object('akcja', 'zdjecie_dodane', 'nazwa', new.autor_nazwa));
    return new;
  end if;
  insert into public.awarie_historia (awaria_id, autor_id, typ, dane)
    values (old.awaria_id, auth.uid(), 'edycja',
            jsonb_build_object('akcja', 'zdjecie_usuniete',
                               'nazwa', (select p.imie_nazwisko from public.profiles p where p.id = auth.uid())));
  return old;
end
$$;
revoke all on function public.zdjecia_zapisz_historie() from public, anon, authenticated;

create trigger awarie_zdjecia_historia
  after insert or delete on public.awarie_zdjecia
  for each row execute function public.zdjecia_zapisz_historie();

-- Kubełek: prywatny, tylko JPEG do 2 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('zdjecia-awarii', 'zdjecia-awarii', false, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Id awarii ze ścieżki pliku; NULL, gdy ścieżka nie ma kształtu <uuid>/<uuid>.jpg (taki plik nie przejdzie polityk).
create or replace function public.zdjecie_awaria_id(p_nazwa text)
returns uuid
language sql immutable set search_path = public as $$
  select case
    when p_nazwa ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    then split_part(p_nazwa, '/', 1)::uuid
  end
$$;
revoke all on function public.zdjecie_awaria_id(text) from public, anon;
grant execute on function public.zdjecie_awaria_id(text) to authenticated, service_role;

-- Liczba innych plików tej awarii (bez pliku o tej samej nazwie: ponowna wysyłka po zerwanym połączeniu
-- ma dostać „już istnieje”, a nie odmowę z powodu limitu).
create or replace function public.zdjecia_inne_pliki(p_nazwa text)
returns integer
language sql stable security definer set search_path = public, storage as $$
  select count(*)::integer from storage.objects o
  where o.bucket_id = 'zdjecia-awarii'
    and o.name like split_part(p_nazwa, '/', 1) || '/%'
    and o.name <> p_nazwa
$$;
revoke all on function public.zdjecia_inne_pliki(text) from public, anon;
grant execute on function public.zdjecia_inne_pliki(text) to authenticated, service_role;

create policy zdjecia_awarii_select on storage.objects for select to authenticated
  using (bucket_id = 'zdjecia-awarii' and public.widzi_awarie(public.zdjecie_awaria_id(name)));

create policy zdjecia_awarii_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'zdjecia-awarii'
    and public.widzi_awarie(public.zdjecie_awaria_id(name))
    and public.zdjecia_inne_pliki(name) < 3
  );

create policy zdjecia_awarii_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'zdjecia-awarii'
    and public.widzi_awarie(public.zdjecie_awaria_id(name))
    and (owner_id = auth.uid()::text or public.mam_role(array['admin']::public.rola_uzytkownika[]))
  );
