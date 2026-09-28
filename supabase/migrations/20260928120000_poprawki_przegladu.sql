-- Poprawki po niezależnym przeglądzie kodu (Codex, 2026-09-28).

-- 1. Zamknięcie wymaga czasu przestoju (dotąd trigger sprawdzał tylko przyczynę i datę), przestój nie może być
--    ujemny (inaczej MTTR, przestoje i progi alarmowe są fałszywe).
alter table public.awarie
  add constraint awarie_czas_przestoju_nieujemny check (czas_przestoju_h is null or czas_przestoju_h >= 0);

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
  if new.status = 'zamknieta'
     and (new.przyczyna is null or new.data_zamkniecia is null or new.czas_przestoju_h is null) then
    raise exception 'Zamknięcie awarii wymaga przyczyny i czasu przestoju';
  end if;
  if new.status = 'zamknieta' and new.kategoria_przyczyny is null then
    raise exception 'Zamknięcie awarii wymaga kategorii przyczyny';
  end if;
  return new;
end
$$;

-- 2. Dane zgłoszenia są zamrożone po zapisaniu (ślad audytowy: dotąd obsługa mogła przez API zmienić urządzenie,
--    datę, opis czy krytyczność bez wpisu w historii). Dane zamknięcia zmieniają się tylko razem z zamknięciem;
--    jedyny wyjątek to uzupełnienie brakującej kategorii przyczyny w zamkniętej awarii. Zapis kluczem
--    serwisowym (import, skrypty) jest wyłączony z tej reguły, jak pozostałe triggery awarii.
create or replace function public.awarie_zamroz_pola()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_zamykanie boolean := new.status = 'zamknieta' and old.status <> 'zamknieta';
  v_uzupelnienie_kategorii boolean :=
    old.status = 'zamknieta' and new.status = 'zamknieta'
    and old.kategoria_przyczyny is null and new.kategoria_przyczyny is not null;
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.nr_technologiczny is distinct from old.nr_technologiczny
     or new.nazwa_urzadzenia is distinct from old.nazwa_urzadzenia
     or new.data_awarii is distinct from old.data_awarii
     or new.opis_awarii is distinct from old.opis_awarii
     or new.krytycznosc_skutku is distinct from old.krytycznosc_skutku then
    raise exception 'Danych zgłoszenia (urządzenie, data, opis, krytyczność) nie można zmieniać';
  end if;
  if not v_zamykanie and (
       new.przyczyna is distinct from old.przyczyna
       or new.czas_przestoju_h is distinct from old.czas_przestoju_h
       or new.data_zamkniecia is distinct from old.data_zamkniecia
       or (new.kategoria_przyczyny is distinct from old.kategoria_przyczyny and not v_uzupelnienie_kategorii)
     ) then
    raise exception 'Dane zamknięcia zmieniają się tylko przy zamykaniu awarii';
  end if;
  return new;
end
$$;
revoke all on function public.awarie_zamroz_pola() from public, anon, authenticated;

create trigger awarie_zamroz_pola
  before update on public.awarie
  for each row execute function public.awarie_zamroz_pola();

-- 3. Korekta magazynu liczy różnicę pod blokadą wiersza (dotąd równoległe przyjęcie między odczytem a zapisem
--    dawało zły stan końcowy, np. 20 zamiast 10).
create or replace function public.magazyn_korekta(p_czesc uuid, p_nowy_stan numeric, p_uwagi text)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_stan numeric;
begin
  if not public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]) then
    raise exception 'Korekta stanu wymaga roli kierownika lub administratora';
  end if;
  if p_nowy_stan is null or p_nowy_stan < 0 or p_nowy_stan > 1000000 then
    raise exception 'Nieprawidłowy stan po korekcie';
  end if;
  if nullif(btrim(coalesce(p_uwagi, '')), '') is null then
    raise exception 'Podaj powód korekty';
  end if;
  select stan into v_stan from public.magazyn_czesci where id = p_czesc for update;
  if not found then
    raise exception 'Nie ma takiej części w magazynie';
  end if;
  if v_stan = p_nowy_stan then
    return v_stan;
  end if;
  return public.magazyn_zmien_stan(p_czesc, 'korekta', p_nowy_stan - v_stan, null, p_uwagi);
end
$$;
revoke all on function public.magazyn_korekta(uuid, numeric, text) from public, anon;
grant execute on function public.magazyn_korekta(uuid, numeric, text) to authenticated;

-- 4. Nowa awaria zawsze zaczyna od wersji 1 (wartość od klienta jest ignorowana).
create or replace function public.awarie_wersja_poczatkowa()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.wersja := 1;
  end if;
  return new;
end
$$;
revoke all on function public.awarie_wersja_poczatkowa() from public, anon, authenticated;

create trigger awarie_wersja_poczatkowa
  before insert on public.awarie
  for each row execute function public.awarie_wersja_poczatkowa();

-- 8. Usunięcie subskrypcji push po adresie tej przeglądarki, także cudzej (np. poprzedniej osoby na wspólnym
--    telefonie, gdy wylogowanie odbyło się bez sieci). Adres subskrypcji zna tylko to urządzenie.
create or replace function public.push_usun_subskrypcje(p_endpoint text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Brak sesji';
  end if;
  delete from public.push_subskrypcje where endpoint = p_endpoint;
end
$$;
revoke all on function public.push_usun_subskrypcje(text) from public, anon;
grant execute on function public.push_usun_subskrypcje(text) to authenticated;
