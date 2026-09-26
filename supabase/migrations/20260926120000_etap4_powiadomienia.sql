-- Etap 4: powiadomienia w aplikacji (dzwonek, Realtime) i codzienne przypomnienia o przeglądach (pg_cron).

create type public.typ_powiadomienia as enum (
  'nowa_awaria', 'przydzielenie', 'zmiana_statusu', 'propozycja_przegladu',
  'przeglad_wkrotce', 'przeglad_opozniony'
);

create table public.powiadomienia (
  id uuid primary key default gen_random_uuid(),
  uzytkownik_id uuid not null references public.profiles (id) on delete cascade,
  typ public.typ_powiadomienia not null,
  tresc text not null check (char_length(tresc) between 1 and 500),
  link text,
  krytyczne boolean not null default false,
  przeczytane boolean not null default false,
  klucz text,
  awaria_id uuid references public.awarie (id) on delete cascade,
  przeglad_id uuid references public.przeglady (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index powiadomienia_odbiorca_idx on public.powiadomienia (uzytkownik_id, created_at desc);
create unique index powiadomienia_klucz_key on public.powiadomienia (uzytkownik_id, klucz)
  where klucz is not null;

alter table public.powiadomienia enable row level security;
revoke all on public.powiadomienia from anon, authenticated;
grant select on public.powiadomienia to authenticated;
grant update (przeczytane) on public.powiadomienia to authenticated;
grant all on public.powiadomienia to service_role;

-- Każdy czyta i oznacza jako przeczytane tylko własne (konto zablokowane lub z wymuszoną zmianą hasła — nic).
create policy powiadomienia_select on public.powiadomienia for select to authenticated
  using (uzytkownik_id = auth.uid() and public.moja_rola() is not null);
create policy powiadomienia_update on public.powiadomienia for update to authenticated
  using (uzytkownik_id = auth.uid() and public.moja_rola() is not null)
  with check (uzytkownik_id = auth.uid() and public.moja_rola() is not null);

-- Realtime: dzwonek dostaje nowe wiersze na żywo (RLS obowiązuje także w Realtime).
alter publication supabase_realtime add table public.powiadomienia;

-- Aktywne konta o podanych rolach (adresaci powiadomień).
create or replace function public.odbiorcy_rol(p_role public.rola_uzytkownika[])
returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p
  where p.status = 'aktywny' and not p.must_change_password and p.rola = any (p_role)
$$;

-- Jedno miejsce zapisu powiadomienia: pomija nieaktywnych adresatów, klucz zapewnia idempotencję.
create or replace function public.powiadom(
  p_uzytkownik uuid,
  p_typ public.typ_powiadomienia,
  p_tresc text,
  p_link text,
  p_krytyczne boolean default false,
  p_klucz text default null,
  p_awaria uuid default null,
  p_przeglad uuid default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_uzytkownik is null or not exists (
    select 1 from public.profiles p
    where p.id = p_uzytkownik and p.status = 'aktywny' and not p.must_change_password
  ) then
    return;
  end if;
  insert into public.powiadomienia
    (uzytkownik_id, typ, tresc, link, krytyczne, klucz, awaria_id, przeglad_id)
  values
    (p_uzytkownik, p_typ, left(p_tresc, 500), p_link, p_krytyczne, p_klucz, p_awaria, p_przeglad)
  on conflict (uzytkownik_id, klucz) where klucz is not null do nothing;
end
$$;

revoke all on function public.odbiorcy_rol(public.rola_uzytkownika[]) from public, anon, authenticated;
revoke all on function public.powiadom(uuid, public.typ_powiadomienia, text, text, boolean, text, uuid, uuid)
  from public, anon, authenticated;

-- Nowa awaria → technicy, kierownicy i właściciel urządzenia (bez autora). Zapis service-role (import) nie
-- powiadamia — jak pozostałe reguły, które pomijają operacje bez zalogowanego użytkownika.
create or replace function public.awarie_powiadom_nowa()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_odbiorca uuid;
  v_wlasciciel uuid;
  v_krytyczna boolean := new.krytycznosc_skutku = 'Wysoka';
  v_tresc text;
begin
  if auth.uid() is null then
    return null;
  end if;
  select u.wlasciciel_id into v_wlasciciel from public.urzadzenia u
    where u.nr_technologiczny = new.nr_technologiczny;
  v_tresc := format('%s %s · %s — %s',
    case when v_krytyczna then 'Krytyczna awaria' else 'Nowa awaria' end,
    coalesce(new.numer, ''), new.nr_technologiczny, left(new.opis_awarii, 120));
  for v_odbiorca in
    select * from public.odbiorcy_rol(array['technik', 'kierownik']::public.rola_uzytkownika[])
    union
    select v_wlasciciel where v_wlasciciel is not null
  loop
    if v_odbiorca <> auth.uid() then
      perform public.powiadom(v_odbiorca, 'nowa_awaria', v_tresc, '/awarie/' || new.id,
                              v_krytyczna, null, new.id, null);
    end if;
  end loop;
  return null;
end
$$;

create trigger awarie_powiadomienie_nowa
  after insert on public.awarie
  for each row execute function public.awarie_powiadom_nowa();

-- Przyjęcie albo zamknięcie → zgłaszający (chyba że sam zmienił status).
create or replace function public.awarie_powiadom_status()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or new.status = old.status
     or new.status not in ('przyjeta', 'zamknieta')
     or new.zglaszajacy_id is null or new.zglaszajacy_id = auth.uid() then
    return null;
  end if;
  perform public.powiadom(
    new.zglaszajacy_id, 'zmiana_statusu',
    format('Twoje zgłoszenie %s (%s) zostało %s', coalesce(new.numer, ''), new.nr_technologiczny,
           case when new.status = 'przyjeta' then 'przyjęte do realizacji' else 'zamknięte' end),
    '/awarie/' || new.id, false, null, new.id, null);
  return null;
end
$$;

create trigger awarie_powiadomienie_status
  after update of status on public.awarie
  for each row execute function public.awarie_powiadom_status();

-- Dodanie do zespołu przez inną osobę → dodana osoba.
create or replace function public.awarie_zespol_powiadom()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_awaria record;
begin
  if new.dodal_id is null or new.dodal_id = new.uzytkownik_id then
    return null;
  end if;
  select a.numer, a.nr_technologiczny into v_awaria from public.awarie a where a.id = new.awaria_id;
  perform public.powiadom(
    new.uzytkownik_id, 'przydzielenie',
    format('Dodano Cię do zespołu awarii %s (%s)', coalesce(v_awaria.numer, ''), v_awaria.nr_technologiczny),
    '/awarie/' || new.awaria_id, false, null, new.awaria_id, null);
  return null;
end
$$;

create trigger awarie_zespol_powiadomienie
  after insert on public.awarie_zespol
  for each row execute function public.awarie_zespol_powiadom();

-- Właściciel urządzenia + kierownicy danego przeglądu.
create or replace function public.odbiorcy_przegladu(p_przeglad uuid)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select u.wlasciciel_id from public.przeglady p
    join public.urzadzenia u on u.nr_technologiczny = p.nr_technologiczny
    where p.id = p_przeglad and u.wlasciciel_id is not null
  union
  select * from public.odbiorcy_rol(array['kierownik']::public.rola_uzytkownika[])
$$;
revoke all on function public.odbiorcy_przegladu(uuid) from public, anon, authenticated;

-- Propozycja przyspieszenia → właściciel urządzenia i kierownicy (klucz: jedna na propozycję).
create or replace function public.propozycje_powiadom()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_odbiorca uuid;
  v_nr text;
begin
  select p.nr_technologiczny into v_nr from public.przeglady p where p.id = new.przeglad_id;
  for v_odbiorca in select * from public.odbiorcy_przegladu(new.przeglad_id) loop
    perform public.powiadom(
      v_odbiorca, 'propozycja_przegladu',
      format('Zalecane przyspieszenie przeglądu %s — przekroczony próg awaryjności', v_nr),
      '/przeglady/' || new.przeglad_id, false, 'propozycja:' || new.id, null, new.przeglad_id);
  end loop;
  return null;
end
$$;

create trigger przeglady_propozycje_powiadomienie
  after insert on public.przeglady_propozycje
  for each row execute function public.propozycje_powiadom();

-- Codziennie: przeglądy za ≤ 14 dni i opóźnione → właściciel i kierownicy. Jedno powiadomienie danego typu
-- na przegląd i termin (klucz), więc ponowne uruchomienie tego samego dnia niczego nie dubluje.
create or replace function public.powiadomienia_przegladow()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_p record;
  v_odbiorca uuid;
  v_typ public.typ_powiadomienia;
  v_dzis date := public.dzis_pl();
begin
  for v_p in
    select p.id, p.nr_technologiczny, p.data_najblizszego
    from public.przeglady p
    join public.urzadzenia u on u.nr_technologiczny = p.nr_technologiczny
    where u.status = 'aktywne' and p.data_najblizszego is not null
      and p.data_najblizszego <= v_dzis + 14
  loop
    v_typ := case when v_p.data_najblizszego < v_dzis then 'przeglad_opozniony' else 'przeglad_wkrotce' end;
    for v_odbiorca in select * from public.odbiorcy_przegladu(v_p.id) loop
      perform public.powiadom(
        v_odbiorca, v_typ,
        case when v_typ = 'przeglad_opozniony'
          then format('Przegląd opóźniony: %s (termin %s)', v_p.nr_technologiczny,
                      to_char(v_p.data_najblizszego, 'DD.MM.YYYY'))
          else format('Zbliża się przegląd %s (termin %s)', v_p.nr_technologiczny,
                      to_char(v_p.data_najblizszego, 'DD.MM.YYYY'))
        end,
        '/przeglady/' || v_p.id, false,
        v_typ || ':' || v_p.id || ':' || v_p.data_najblizszego, null, v_p.id);
    end loop;
  end loop;
end
$$;

revoke all on function public.powiadomienia_przegladow() from public, anon, authenticated;
grant execute on function public.powiadomienia_przegladow() to service_role;

-- Harmonogram: codziennie o 04:00 UTC (06:00 czasu letniego / 05:00 zimowego w Polsce).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule('powiadomienia-przegladow', '0 4 * * *', 'select public.powiadomienia_przegladow()');
