-- Etap 2: historia zmian (tylko dopisywanie) i komentarze awarii.

create type public.typ_historii_awarii as enum ('utworzenie', 'zmiana_statusu', 'przypisanie', 'edycja');

create table public.awarie_historia (
  id uuid primary key default gen_random_uuid(),
  awaria_id uuid not null references public.awarie (id) on delete cascade,
  autor_id uuid references public.profiles (id) on delete set null,
  typ public.typ_historii_awarii not null,
  dane jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.awarie_historia enable row level security;
revoke all on public.awarie_historia from anon, authenticated;
grant select on public.awarie_historia to authenticated;
grant all on public.awarie_historia to service_role;
create index awarie_historia_awaria_id_idx on public.awarie_historia (awaria_id, created_at);

create table public.awarie_komentarze (
  id uuid primary key default gen_random_uuid(),
  awaria_id uuid not null references public.awarie (id) on delete cascade,
  autor_id uuid references public.profiles (id) on delete set null,
  tresc text not null check (char_length(btrim(tresc)) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.awarie_komentarze enable row level security;
revoke all on public.awarie_komentarze from anon, authenticated;
grant select, insert on public.awarie_komentarze to authenticated;
grant all on public.awarie_komentarze to service_role;
create index awarie_komentarze_awaria_id_idx on public.awarie_komentarze (awaria_id, created_at);

-- Widoczność awarii, współdzielona przez historię i komentarze: taka sama reguła jak w awarie_select.
create or replace function public.widzi_awarie(p_awaria_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.awarie a where a.id = p_awaria_id and (
      public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[])
      or (public.moja_rola() is not null and a.zglaszajacy_id = auth.uid())
    )
  )
$$;
revoke all on function public.widzi_awarie(uuid) from public, anon;
grant execute on function public.widzi_awarie(uuid) to authenticated, service_role;

create policy awarie_historia_select on public.awarie_historia for select to authenticated
  using (public.widzi_awarie(awaria_id));

create policy awarie_komentarze_select on public.awarie_komentarze for select to authenticated
  using (public.widzi_awarie(awaria_id));
create policy awarie_komentarze_insert on public.awarie_komentarze for insert to authenticated
  with check (public.widzi_awarie(awaria_id));

-- Autor komentarza zawsze z konta, nigdy z klienta.
create or replace function public.komentarze_pilnuj_autora()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.autor_id := auth.uid();
  end if;
  return new;
end
$$;

create trigger awarie_komentarze_autor
  before insert on public.awarie_komentarze
  for each row execute function public.komentarze_pilnuj_autora();

-- Historia: utworzenie, zmiana statusu, zmiana przypisania. Trigger AFTER widzi już finalny wiersz
-- (numer, wersja i przejście statusu są już zweryfikowane przez trigery BEFORE z poprzedniej migracji).
create or replace function public.awarie_zapisz_historie()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.awarie_historia (awaria_id, autor_id, typ, dane)
      values (new.id, auth.uid(), 'utworzenie', jsonb_build_object('status', new.status));
    return new;
  end if;
  if new.status <> old.status then
    insert into public.awarie_historia (awaria_id, autor_id, typ, dane)
      values (new.id, auth.uid(), 'zmiana_statusu', jsonb_build_object('z', old.status, 'na', new.status));
  end if;
  if new.przypisany_technik_id is distinct from old.przypisany_technik_id then
    insert into public.awarie_historia (awaria_id, autor_id, typ, dane)
      values (new.id, auth.uid(), 'przypisanie', jsonb_build_object('technik_id', new.przypisany_technik_id));
  end if;
  return new;
end
$$;

create trigger awarie_historia_zapis
  after insert or update on public.awarie
  for each row execute function public.awarie_zapisz_historie();
