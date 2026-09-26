-- Etap 3b: zespół przy awarii (kilka osób obsługi zamiast jednego przypisanego technika).

-- Czy konto może być w zespole: aktywna osoba obsługi (technik, kierownik, admin) bez wymuszonej zmiany hasła.
create or replace function public.osoba_obslugi(p_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_id and p.status = 'aktywny' and not p.must_change_password
      and p.rola in ('technik', 'kierownik', 'admin')
  )
$$;
revoke all on function public.osoba_obslugi(uuid) from public, anon;
grant execute on function public.osoba_obslugi(uuid) to authenticated, service_role;

create or replace function public.awaria_otwarta(p_awaria_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.awarie a where a.id = p_awaria_id and a.status <> 'zamknieta')
$$;
revoke all on function public.awaria_otwarta(uuid) from public, anon;
grant execute on function public.awaria_otwarta(uuid) to authenticated, service_role;

create table public.awarie_zespol (
  awaria_id uuid not null references public.awarie (id) on delete cascade,
  uzytkownik_id uuid not null references public.profiles (id) on delete cascade,
  nazwa text not null,
  dodal_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (awaria_id, uzytkownik_id)
);
create index awarie_zespol_uzytkownik_idx on public.awarie_zespol (uzytkownik_id);

alter table public.awarie_zespol enable row level security;
revoke all on public.awarie_zespol from anon, authenticated;
grant select, delete on public.awarie_zespol to authenticated;
grant insert (awaria_id, uzytkownik_id) on public.awarie_zespol to authenticated;
grant all on public.awarie_zespol to service_role;

create policy awarie_zespol_select on public.awarie_zespol for select to authenticated
  using (public.widzi_awarie(awaria_id));

-- Technik dodaje tylko siebie; kierownik i admin dowolną aktywną osobę obsługi. Tylko do niezamkniętej awarii.
create policy awarie_zespol_insert on public.awarie_zespol for insert to authenticated
  with check (
    public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[])
    and public.awaria_otwarta(awaria_id)
    and public.osoba_obslugi(uzytkownik_id)
    and (uzytkownik_id = auth.uid()
         or public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]))
  );

-- Usunąć siebie może każda osoba obsługi; kogokolwiek — kierownik i admin. Tylko z niezamkniętej awarii.
create policy awarie_zespol_delete on public.awarie_zespol for delete to authenticated
  using (
    public.awaria_otwarta(awaria_id)
    and (
      (uzytkownik_id = auth.uid()
       and public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[]))
      or public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[])
    )
  );

-- Nazwisko i dodającego ustawia baza (kierownik nie czyta profiles; wartości od klienta są ignorowane).
create or replace function public.awarie_zespol_przed()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select imie_nazwisko into new.nazwa from public.profiles where id = new.uzytkownik_id;
  if auth.uid() is not null then
    new.dodal_id := auth.uid();
  end if;
  return new;
end
$$;

create trigger awarie_zespol_nazwa
  before insert on public.awarie_zespol
  for each row execute function public.awarie_zespol_przed();

-- Historia: kto dołączył / odszedł i kto to zrobił (autor_id).
create or replace function public.awarie_zespol_historia()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.awarie_historia (awaria_id, autor_id, typ, dane)
      values (new.awaria_id, auth.uid(), 'przypisanie',
              jsonb_build_object('akcja', 'dolaczenie', 'uzytkownik_id', new.uzytkownik_id,
                                 'nazwa', new.nazwa));
    return new;
  end if;
  -- Kaskadowe usunięcie całej awarii nie potrzebuje wpisu historii (historia znika razem z nią).
  if exists (select 1 from public.awarie where id = old.awaria_id) then
    insert into public.awarie_historia (awaria_id, autor_id, typ, dane)
      values (old.awaria_id, auth.uid(), 'przypisanie',
              jsonb_build_object('akcja', 'odejscie', 'uzytkownik_id', old.uzytkownik_id,
                                 'nazwa', old.nazwa));
  end if;
  return old;
end
$$;

create trigger awarie_zespol_historia
  after insert or delete on public.awarie_zespol
  for each row execute function public.awarie_zespol_historia();

-- Przeniesienie dotychczasowych przypisań (bez wpisów historii: to nie są nowe zdarzenia).
alter table public.awarie_zespol disable trigger awarie_zespol_historia;
insert into public.awarie_zespol (awaria_id, uzytkownik_id, nazwa)
  select a.id, a.przypisany_technik_id, p.imie_nazwisko
  from public.awarie a join public.profiles p on p.id = a.przypisany_technik_id
  where a.przypisany_technik_id is not null;
alter table public.awarie_zespol enable trigger awarie_zespol_historia;

-- Kolumna pojedynczego przypisania znika: najpierw zależna polityka i trigger historii.
drop policy awarie_insert on public.awarie;
create policy awarie_insert on public.awarie for insert to authenticated
  with check (
    public.moja_rola() is not null
    and status = 'zgloszona'
    and data_zamkniecia is null
    and przyczyna is null
    and czas_przestoju_h is null
  );

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
  return new;
end
$$;

alter table public.awarie drop column przypisany_technik_id;

-- Lista osób obsługi do wyboru w zespole (kierownik nie czyta profiles, więc dostaje tylko to, co potrzebne).
create or replace function public.osoby_obslugi()
returns table (id uuid, imie_nazwisko text, rola public.rola_uzytkownika)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]) then
    raise exception 'Lista osób obsługi jest dostępna dla kierownika i administratora'
      using errcode = '42501';
  end if;
  return query
    select p.id, p.imie_nazwisko, p.rola from public.profiles p
    where p.status = 'aktywny' and not p.must_change_password
      and p.rola in ('technik', 'kierownik', 'admin')
    order by p.imie_nazwisko;
end
$$;
revoke all on function public.osoby_obslugi() from public, anon;
grant execute on function public.osoby_obslugi() to authenticated;
