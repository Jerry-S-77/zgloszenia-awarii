-- Słownik kategorii przyczyn awarii (analiza Pareto). Kategoria jest wymagana przy każdym zamknięciu,
-- tak jak przyczyna i czas przestoju; zamkniętym awariom bez kategorii (import, dane sprzed zmiany) obsługa
-- może ją uzupełnić później.

create type public.kategoria_przyczyny as enum (
  'mechaniczna', 'elektryczna', 'automatyka', 'media', 'obsluga', 'inna'
);

alter table public.awarie add column kategoria_przyczyny public.kategoria_przyczyny;

-- Nowa awaria nie może mieć danych zamknięcia, także kategorii.
drop policy awarie_insert on public.awarie;
create policy awarie_insert on public.awarie for insert to authenticated
  with check (
    public.moja_rola() is not null
    and status = 'zgloszona'
    and data_zamkniecia is null
    and przyczyna is null
    and czas_przestoju_h is null
    and kategoria_przyczyny is null
  );

-- Maszyna stanów bez zmian, z dodatkowym wymogiem kategorii przy zamknięciu.
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
  if new.status = 'zamknieta' and new.kategoria_przyczyny is null then
    raise exception 'Zamknięcie awarii wymaga kategorii przyczyny';
  end if;
  return new;
end
$$;
