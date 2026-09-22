-- Etap 2: maszyna stanów statusu, numeracja, wersja i przypisanie technika.

-- Statusy po polsku, bez diakrytyków. Mapowanie ze starych wartości tekstowych.
create type public.status_awarii as enum ('zgloszona', 'przyjeta', 'w_naprawie', 'oczekuje_na_czesc', 'zamknieta');

alter table public.awarie drop constraint awarie_status_check;
-- Polityka awarie_insert (etap 1) sprawdza status w WITH CHECK, więc Postgres nie pozwoli zmienić
-- typu kolumny, dopóki polityka na niej wisi. Usuwamy ją tu, odtwarzamy na końcu migracji z nową
-- wartością enuma.
drop policy awarie_insert on public.awarie;
-- Domyślnej wartości starej kolumny ('Otwarta', text) Postgres nie potrafi automatycznie
-- rzutować na nowy enum przy jednoczesnej zmianie typu — najpierw usuwamy DEFAULT, potem
-- zmieniamy typ (z USING dla istniejących wierszy), na końcu ustawiamy nowy DEFAULT.
alter table public.awarie alter column status drop default;
alter table public.awarie
  alter column status type public.status_awarii
  using (case status when 'Otwarta' then 'zgloszona' when 'Zamknieta' then 'zamknieta' end)::public.status_awarii;
alter table public.awarie alter column status set default 'zgloszona';

alter table public.awarie
  add column wersja integer not null default 1,
  add column przypisany_technik_id uuid references public.profiles (id) on delete set null,
  add column numer text;

create unique index awarie_numer_key on public.awarie (numer) where numer is not null;

-- Numeracja roczna: jeden licznik na rok, blokada wiersza serializuje wstawienia tego samego roku.
create table public.numeracja_awarii (
  rok integer primary key,
  ostatni integer not null default 0
);
alter table public.numeracja_awarii enable row level security;
revoke all on public.numeracja_awarii from anon, authenticated;
grant all on public.numeracja_awarii to service_role;

create or replace function public.awarie_nadaj_numer()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rok integer := extract(year from new.data_awarii)::integer;
  v_nastepny integer;
begin
  insert into public.numeracja_awarii (rok, ostatni) values (v_rok, 0)
    on conflict (rok) do nothing;
  update public.numeracja_awarii set ostatni = ostatni + 1
    where rok = v_rok
    returning ostatni into v_nastepny;
  new.numer := format('AWR-%s-%s', v_rok, lpad(v_nastepny::text, 3, '0'));
  return new;
end
$$;

create trigger awarie_numeracja
  before insert on public.awarie
  for each row execute function public.awarie_nadaj_numer();

-- Wersja: każdy UPDATE ją zwiększa; klient porównuje oczekiwaną wersję w WHERE (optymistyczna blokada).
create or replace function public.awarie_zwieksz_wersje()
returns trigger
language plpgsql as $$
begin
  new.wersja := old.wersja + 1;
  return new;
end
$$;

create trigger awarie_wersja
  before update on public.awarie
  for each row execute function public.awarie_zwieksz_wersje();

-- Maszyna stanów. Zapis z kluczem service-role (auth.uid() is null) pomija walidację,
-- tak jak istniejący trigger awarie_pilnuj_zglaszajacego z etapu 1 (testy, skrypty).
create or replace function public.awarie_waliduj_przejscie()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  dozwolone boolean;
begin
  if new.status = old.status then
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if not public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[]) then
    raise exception 'Brak uprawnień do zmiany statusu awarii';
  end if;
  if old.status = 'zamknieta' and new.status = 'w_naprawie'
     and not public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]) then
    raise exception 'Ponowne otwarcie zamkniętej awarii wymaga roli kierownika lub administratora';
  end if;
  dozwolone := case
    when old.status = 'zgloszona' and new.status in ('przyjeta', 'zamknieta') then true
    when old.status = 'przyjeta' and new.status in ('w_naprawie', 'zamknieta') then true
    when old.status = 'w_naprawie' and new.status in ('oczekuje_na_czesc', 'zamknieta') then true
    when old.status = 'oczekuje_na_czesc' and new.status in ('w_naprawie', 'zamknieta') then true
    when old.status = 'zamknieta' and new.status = 'w_naprawie' then true
    else false
  end;
  if not dozwolone then
    raise exception 'Niedozwolone przejście statusu: % -> %', old.status, new.status;
  end if;
  if new.status = 'zamknieta' and (new.przyczyna is null or new.data_zamkniecia is null) then
    raise exception 'Zamknięcie awarii wymaga przyczyny i czasu przestoju';
  end if;
  return new;
end
$$;

create trigger awarie_przejscie_statusu
  before update on public.awarie
  for each row execute function public.awarie_waliduj_przejscie();

-- Nowa awaria musi startować jako 'zgloszona', bez danych zamknięcia i bez przypisania z góry
-- (polityka usunięta na początku tej migracji, żeby dało się zmienić typ kolumny status).
create policy awarie_insert on public.awarie for insert to authenticated
  with check (
    public.moja_rola() is not null
    and status = 'zgloszona'
    and data_zamkniecia is null
    and przyczyna is null
    and czas_przestoju_h is null
    and przypisany_technik_id is null
  );
