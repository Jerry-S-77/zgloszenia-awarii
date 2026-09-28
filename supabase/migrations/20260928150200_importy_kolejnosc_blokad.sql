-- Druga weryfikacja (Codex, 2026-09-28): blokady wierszy brane w pętli, w kolejności z pliku, mogły zakleszczyć
-- dwa równoległe importy z tymi samymi urządzeniami lub częściami w odwrotnej kolejności. Teraz każdy import
-- blokuje wszystkie swoje wiersze na początku, w stałej kolejności (urządzenia po numerze, części po id).

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
  -- Blokada urządzeń z pliku przed zmianami, w stałej kolejności numerów: dwa równoległe importy tego samego
  -- nowego typu nie założą dwóch przeglądów, a importy z urządzeniami w odwrotnej kolejności nie zakleszczą się.
  perform 1 from public.urzadzenia
    where nr_technologiczny in (
      select btrim(coalesce(e ->> 'nr_technologiczny', '')) from jsonb_array_elements(p_wiersze) e)
    order by nr_technologiczny
    for update;
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
  -- Blokada części z pliku przed zmianami, w stałej kolejności (bez zakleszczeń między równoległymi importami).
  perform 1 from public.magazyn_czesci
    where numer_katalogowy in (
      select btrim(coalesce(e ->> 'numer_katalogowy', '')) from jsonb_array_elements(p_wiersze) e)
    order by id
    for update;
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
    -- Stany mają 2 miejsca po przecinku (numeric(12,2)); więcej zaokrągliłoby się po cichu.
    if v_stan is null or v_stan < 0 or v_stan > 1000000 or v_stan <> trunc(v_stan, 2) then
      raise exception 'Wiersz %: stan faktyczny to liczba 0–1000000 (najwyżej 2 miejsca po przecinku)', i;
    end if;
    if char_length(btrim(coalesce(v_w ->> 'uwagi', ''))) > 480 then
      raise exception 'Wiersz %: uwagi do 480 znaków', i;
    end if;
    v_uwagi := 'Inwentaryzacja' || coalesce(': ' || nullif(btrim(v_w ->> 'uwagi'), ''), '');
    -- Część jest już zablokowana (początek funkcji): równoległa dostawa lub pobranie nie przekłamie liczników.
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
  -- Blokada części z pliku przed zmianami, w stałej kolejności (bez zakleszczeń między równoległymi importami).
  perform 1 from public.magazyn_czesci
    where numer_katalogowy in (
      select btrim(coalesce(e ->> 'numer_katalogowy', '')) from jsonb_array_elements(p_wiersze) e)
    order by id
    for update;
  for v_w in select * from jsonb_array_elements(p_wiersze) loop
    i := i + 1;
    v_id := public.magazyn_id_czesci(v_w ->> 'numer_katalogowy', i);
    begin
      v_ilosc := (v_w ->> 'ilosc')::numeric;
    exception when others then
      raise exception 'Wiersz %: nieprawidłowa ilość', i;
    end;
    if v_ilosc is null or v_ilosc < 0.01 or v_ilosc > 100000 or v_ilosc <> trunc(v_ilosc, 2) then
      raise exception 'Wiersz %: ilość od 0,01 do 100000 (najwyżej 2 miejsca po przecinku)', i;
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
