-- Importy z plików (CSV/XLSX według wzorów w public/wzory/): rejestr urządzeń, harmonogram przeglądów,
-- inwentaryzacja i zbiorcza dostawa do magazynu. Każdy import to jedna funkcja = jedna transakcja: błąd
-- w dowolnym wierszu cofa cały plik. Klient waliduje wcześniej dla czytelnego podglądu; tutaj wszystko
-- jest sprawdzane jeszcze raz, bo tylko baza decyduje o uprawnieniach i poprawności.

-- 1. Urządzenia (admin). Nowy numer = nowe urządzenie (domyślnie „proponowane”), istniejący = aktualizacja
--    danych (numer technologiczny jest niezmienny). Właściciel wskazywany e-mailem konta; puste pola przy
--    aktualizacji zostawiają dotychczasową wartość. Aktywacja uruchamia zwykły trigger tworzący przegląd.
create or replace function public.urzadzenia_import(p_wiersze jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_w jsonb;
  i integer := 0;
  v_nr text;
  v_nazwa text;
  v_kryt text;
  v_email text;
  v_wlasciciel uuid;
  v_status public.status_urzadzenia;
  v_nowe integer := 0;
  v_zmienione integer := 0;
  v_widziane text[] := '{}';
begin
  if not public.mam_role(array['admin']::public.rola_uzytkownika[]) then
    raise exception 'Import urządzeń wymaga roli administratora';
  end if;
  if jsonb_typeof(p_wiersze) <> 'array' or jsonb_array_length(p_wiersze) > 2000 then
    raise exception 'Plik importu: najwyżej 2000 wierszy';
  end if;
  for v_w in select * from jsonb_array_elements(p_wiersze) loop
    i := i + 1;
    v_nr := btrim(coalesce(v_w ->> 'nr_technologiczny', ''));
    v_nazwa := btrim(coalesce(v_w ->> 'nazwa_urzadzenia', ''));
    if v_nr !~ '^[A-Za-z0-9._-]{1,40}$' then
      raise exception 'Wiersz %: nieprawidłowy numer technologiczny', i;
    end if;
    if v_nr = any (v_widziane) then
      raise exception 'Wiersz %: numer % powtarza się w pliku', i, v_nr;
    end if;
    v_widziane := v_widziane || v_nr;
    if char_length(v_nazwa) not between 2 and 300 then
      raise exception 'Wiersz %: nazwa urządzenia jest wymagana (2–300 znaków)', i;
    end if;
    v_kryt := nullif(btrim(coalesce(v_w ->> 'krytycznosc', '')), '');
    if v_kryt is not null and v_kryt not in ('Niska', 'Srednia', 'Wysoka') then
      raise exception 'Wiersz %: krytyczność to Niska, Srednia albo Wysoka', i;
    end if;
    if char_length(coalesce(v_w ->> 'kategoria', '')) > 200
       or char_length(coalesce(v_w ->> 'lokalizacja', '')) > 300
       or char_length(coalesce(v_w ->> 'uwagi', '')) > 2000 then
      raise exception 'Wiersz %: za długa kategoria, lokalizacja lub uwagi', i;
    end if;
    v_email := nullif(lower(btrim(coalesce(v_w ->> 'wlasciciel_email', ''))), '');
    v_wlasciciel := null;
    if v_email is not null then
      select id into v_wlasciciel from public.profiles where lower(email) = v_email;
      if v_wlasciciel is null then
        raise exception 'Wiersz %: nie ma konta %', i, v_email;
      end if;
    end if;
    v_status := null;
    if nullif(btrim(coalesce(v_w ->> 'status', '')), '') is not null then
      if btrim(v_w ->> 'status') not in ('proponowane', 'aktywne', 'wycofane') then
        raise exception 'Wiersz %: status to proponowane, aktywne albo wycofane', i;
      end if;
      v_status := btrim(v_w ->> 'status')::public.status_urzadzenia;
    end if;

    if exists (select 1 from public.urzadzenia where nr_technologiczny = v_nr) then
      update public.urzadzenia set
        nazwa_urzadzenia = v_nazwa,
        kategoria = coalesce(nullif(btrim(coalesce(v_w ->> 'kategoria', '')), ''), kategoria),
        lokalizacja = coalesce(nullif(btrim(coalesce(v_w ->> 'lokalizacja', '')), ''), lokalizacja),
        krytycznosc = coalesce(v_kryt, krytycznosc),
        wlasciciel_id = coalesce(v_wlasciciel, wlasciciel_id),
        status = coalesce(v_status, status),
        uwagi = coalesce(nullif(btrim(coalesce(v_w ->> 'uwagi', '')), ''), uwagi)
      where nr_technologiczny = v_nr;
      v_zmienione := v_zmienione + 1;
    else
      if v_kryt is null then
        raise exception 'Wiersz %: nowe urządzenie wymaga krytyczności', i;
      end if;
      insert into public.urzadzenia
        (nr_technologiczny, nazwa_urzadzenia, kategoria, lokalizacja, krytycznosc, wlasciciel_id, status, uwagi)
      values (v_nr, v_nazwa,
              nullif(btrim(coalesce(v_w ->> 'kategoria', '')), ''),
              nullif(btrim(coalesce(v_w ->> 'lokalizacja', '')), ''),
              v_kryt, v_wlasciciel, coalesce(v_status, 'proponowane'),
              nullif(btrim(coalesce(v_w ->> 'uwagi', '')), ''));
      v_nowe := v_nowe + 1;
    end if;
  end loop;
  return jsonb_build_object('nowe', v_nowe, 'zmienione', v_zmienione);
end
$$;
revoke all on function public.urzadzenia_import(jsonb) from public, anon;
grant execute on function public.urzadzenia_import(jsonb) to authenticated;

-- Klucz porównania typu czynności: bez wielkości liter, polskich znaków i nadmiarowych spacji (arkusze
-- z n8n miały typy bez diakrytyków, np. „Przeglad okresowy”, a wpisywane ręcznie — z nimi).
create or replace function public.klucz_tekstu(p text)
returns text
language sql immutable set search_path = public as $$
  select regexp_replace(translate(lower(btrim(coalesce(p, ''))), 'ąćęłńóśźż', 'acelnoszz'), '\s+', ' ', 'g')
$$;
revoke all on function public.klucz_tekstu(text) from public, anon;

-- 2. Harmonogram przeglądów (kierownik, admin). Przegląd rozpoznawany po urządzeniu i typie czynności
--    (bez wielkości liter i polskich znaków). Nowy typ wypełnia najpierw pusty przegląd utworzony przy
--    aktywacji urządzenia, dopiero potem dodaje kolejny. Brak daty najbliższego = data ostatniego + częstotliwość (przy aktualizacji
--    także z wartości już zapisanych, gdy plik zmienia tylko jedną z nich).
--    Lista kontrolna: tablica punktów; brak klucza albo pusta tablica przy aktualizacji = bez zmian.
create or replace function public.przeglady_import(p_wiersze jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_w jsonb;
  i integer := 0;
  v_nr text;
  v_typ text;
  v_czest integer;
  v_ostatni date;
  v_najblizszy date;
  v_lista text[];
  v_id uuid;
  v_klucz text;
  v_pusty boolean;
  v_widziane text[] := '{}';
  v_nowe integer := 0;
  v_zmienione integer := 0;
begin
  if not public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]) then
    raise exception 'Import harmonogramu wymaga roli kierownika lub administratora';
  end if;
  if jsonb_typeof(p_wiersze) <> 'array' or jsonb_array_length(p_wiersze) > 2000 then
    raise exception 'Plik importu: najwyżej 2000 wierszy';
  end if;
  for v_w in select * from jsonb_array_elements(p_wiersze) loop
    i := i + 1;
    v_nr := btrim(coalesce(v_w ->> 'nr_technologiczny', ''));
    v_typ := btrim(coalesce(v_w ->> 'typ_czynnosci', ''));
    if not exists (select 1 from public.urzadzenia where nr_technologiczny = v_nr) then
      raise exception 'Wiersz %: nie ma urządzenia %', i, v_nr;
    end if;
    if char_length(v_typ) not between 1 and 200 then
      raise exception 'Wiersz %: typ czynności jest wymagany (do 200 znaków)', i;
    end if;
    v_klucz := v_nr || '|' || public.klucz_tekstu(v_typ);
    if v_klucz = any (v_widziane) then
      raise exception 'Wiersz %: przegląd % („%”) powtarza się w pliku', i, v_nr, v_typ;
    end if;
    v_widziane := v_widziane || v_klucz;
    begin
      v_czest := nullif(btrim(coalesce(v_w ->> 'czestotliwosc_dni', '')), '')::integer;
      v_ostatni := nullif(btrim(coalesce(v_w ->> 'data_ostatniego', '')), '')::date;
      v_najblizszy := nullif(btrim(coalesce(v_w ->> 'data_najblizszego', '')), '')::date;
    exception when others then
      raise exception 'Wiersz %: nieprawidłowa częstotliwość lub data', i;
    end;
    if v_czest is not null and v_czest not between 1 and 3650 then
      raise exception 'Wiersz %: częstotliwość to 1–3650 dni', i;
    end if;
    if v_ostatni is not null and v_ostatni > public.dzis_pl() then
      raise exception 'Wiersz %: data ostatniego przeglądu nie może być z przyszłości', i;
    end if;
    if v_najblizszy is null and v_ostatni is not null and v_czest is not null then
      v_najblizszy := v_ostatni + v_czest;
    end if;
    if char_length(coalesce(v_w ->> 'wykonawca', '')) > 200
       or char_length(coalesce(v_w ->> 'uwagi', '')) > 4000 then
      raise exception 'Wiersz %: za długi wykonawca lub uwagi', i;
    end if;
    v_lista := null;
    if jsonb_typeof(v_w -> 'lista_kontrolna') = 'array' and jsonb_array_length(v_w -> 'lista_kontrolna') > 0 then
      select array_agg(btrim(e)) into v_lista from jsonb_array_elements_text(v_w -> 'lista_kontrolna') e;
      if not public.lista_kontrolna_poprawna(v_lista) then
        raise exception 'Wiersz %: lista kontrolna — najwyżej 30 punktów po 1–200 znaków', i;
      end if;
    end if;

    select id into v_id from public.przeglady
      where nr_technologiczny = v_nr and public.klucz_tekstu(typ_czynnosci) = public.klucz_tekstu(v_typ)
      order by created_at limit 1;
    v_pusty := false;
    if v_id is null then
      select id into v_id from public.przeglady
        where nr_technologiczny = v_nr and typ_czynnosci is null
        order by created_at limit 1;
      v_pusty := v_id is not null;
    end if;

    if v_id is null then
      insert into public.przeglady (nr_technologiczny, typ_czynnosci, czestotliwosc_dni, data_ostatniego,
                                    data_najblizszego, wykonawca, uwagi, lista_kontrolna)
      values (v_nr, v_typ, v_czest, v_ostatni, v_najblizszy,
              nullif(btrim(coalesce(v_w ->> 'wykonawca', '')), ''),
              nullif(btrim(coalesce(v_w ->> 'uwagi', '')), ''),
              coalesce(v_lista, '{}'));
      v_nowe := v_nowe + 1;
    else
      update public.przeglady set
        typ_czynnosci = v_typ,
        czestotliwosc_dni = coalesce(v_czest, czestotliwosc_dni),
        data_ostatniego = coalesce(v_ostatni, data_ostatniego),
        -- Nowa data ostatniego albo nowa częstotliwość bez daty najbliższego: termin liczony z wartości
        -- po zmianie (w SET kolumny to jeszcze stare wartości wiersza).
        data_najblizszego = coalesce(
          v_najblizszy,
          case when (v_ostatni is not null or v_czest is not null)
                    and coalesce(v_ostatni, data_ostatniego) is not null
                    and coalesce(v_czest, czestotliwosc_dni) is not null
               then coalesce(v_ostatni, data_ostatniego) + coalesce(v_czest, czestotliwosc_dni) end,
          data_najblizszego),
        wykonawca = coalesce(nullif(btrim(coalesce(v_w ->> 'wykonawca', '')), ''), wykonawca),
        uwagi = coalesce(nullif(btrim(coalesce(v_w ->> 'uwagi', '')), ''), uwagi),
        lista_kontrolna = coalesce(v_lista, lista_kontrolna)
      where id = v_id;
      -- Wypełnienie pustego przeglądu z aktywacji to dla użytkownika nowa pozycja harmonogramu.
      if v_pusty then
        v_nowe := v_nowe + 1;
      else
        v_zmienione := v_zmienione + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('nowe', v_nowe, 'zmienione', v_zmienione);
end
$$;
revoke all on function public.przeglady_import(jsonb) from public, anon;
grant execute on function public.przeglady_import(jsonb) to authenticated;

-- Wspólne: numer katalogowy → id części (błąd z numerem wiersza, gdy nie ma takiej części).
create or replace function public.magazyn_id_czesci(p_numer text, p_wiersz integer)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from public.magazyn_czesci where numer_katalogowy = btrim(coalesce(p_numer, ''));
  if v_id is null then
    raise exception 'Wiersz %: nie ma w magazynie części %', p_wiersz, coalesce(p_numer, '(pusty numer)');
  end if;
  return v_id;
end
$$;
revoke all on function public.magazyn_id_czesci(text, integer) from public, anon, authenticated;

-- 3. Inwentaryzacja (kierownik, admin): stan faktyczny z pliku; każda różnica to korekta z powodem
--    „Inwentaryzacja” (ślad w ruchach, alarm niskiego stanu jak przy zwykłej korekcie).
create or replace function public.magazyn_inwentaryzacja(p_wiersze jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_w jsonb;
  i integer := 0;
  v_id uuid;
  v_stan numeric;
  v_przed numeric;
  v_uwagi text;
  v_widziane uuid[] := '{}';
  v_zmienione integer := 0;
  v_bez_zmian integer := 0;
begin
  if not public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]) then
    raise exception 'Inwentaryzacja wymaga roli kierownika lub administratora';
  end if;
  if jsonb_typeof(p_wiersze) <> 'array' or jsonb_array_length(p_wiersze) > 2000 then
    raise exception 'Plik importu: najwyżej 2000 wierszy';
  end if;
  for v_w in select * from jsonb_array_elements(p_wiersze) loop
    i := i + 1;
    v_id := public.magazyn_id_czesci(v_w ->> 'numer_katalogowy', i);
    if v_id = any (v_widziane) then
      raise exception 'Wiersz %: część % powtarza się w pliku', i, v_w ->> 'numer_katalogowy';
    end if;
    v_widziane := v_widziane || v_id;
    begin
      v_stan := (v_w ->> 'stan_faktyczny')::numeric;
    exception when others then
      raise exception 'Wiersz %: nieprawidłowy stan faktyczny', i;
    end;
    if v_stan is null or v_stan < 0 or v_stan > 1000000 then
      raise exception 'Wiersz %: stan faktyczny to liczba 0–1000000', i;
    end if;
    v_uwagi := left('Inwentaryzacja' || coalesce(': ' || nullif(btrim(v_w ->> 'uwagi'), ''), ''), 500);
    select stan into v_przed from public.magazyn_czesci where id = v_id;
    perform public.magazyn_korekta(v_id, v_stan, v_uwagi);
    if v_przed = v_stan then
      v_bez_zmian := v_bez_zmian + 1;
    else
      v_zmienione := v_zmienione + 1;
    end if;
  end loop;
  return jsonb_build_object('zmienione', v_zmienione, 'bez_zmian', v_bez_zmian);
end
$$;
revoke all on function public.magazyn_inwentaryzacja(jsonb) from public, anon;
grant execute on function public.magazyn_inwentaryzacja(jsonb) to authenticated;

-- 4. Dostawa zbiorcza (kierownik, admin): każdy wiersz to przyjęcie z numerem dokumentu w uwagach.
--    Ta sama część może wystąpić kilka razy (np. kilka pozycji na fakturze).
create or replace function public.magazyn_dostawa(p_wiersze jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_w jsonb;
  i integer := 0;
  v_id uuid;
  v_ilosc numeric;
  v_dokument text;
begin
  if not public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]) then
    raise exception 'Przyjęcie dostawy wymaga roli kierownika lub administratora';
  end if;
  if jsonb_typeof(p_wiersze) <> 'array' or jsonb_array_length(p_wiersze) > 2000 then
    raise exception 'Plik importu: najwyżej 2000 wierszy';
  end if;
  for v_w in select * from jsonb_array_elements(p_wiersze) loop
    i := i + 1;
    v_id := public.magazyn_id_czesci(v_w ->> 'numer_katalogowy', i);
    begin
      v_ilosc := (v_w ->> 'ilosc')::numeric;
    exception when others then
      raise exception 'Wiersz %: nieprawidłowa ilość', i;
    end;
    if v_ilosc is null or v_ilosc <= 0 or v_ilosc > 100000 then
      raise exception 'Wiersz %: ilość musi być większa od zera (do 100000)', i;
    end if;
    v_dokument := nullif(btrim(coalesce(v_w ->> 'dokument', '')), '');
    if char_length(coalesce(v_dokument, '')) > 100 then
      raise exception 'Wiersz %: numer dokumentu do 100 znaków', i;
    end if;
    perform public.magazyn_przyjecie(v_id, v_ilosc, 'Dostawa' || coalesce(' ' || v_dokument, ''));
  end loop;
  return jsonb_build_object('pozycje', i);
end
$$;
revoke all on function public.magazyn_dostawa(jsonb) from public, anon;
grant execute on function public.magazyn_dostawa(jsonb) to authenticated;
