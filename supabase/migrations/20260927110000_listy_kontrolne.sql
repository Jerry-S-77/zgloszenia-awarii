-- Listy kontrolne przeglądów. Harmonogram (przeglady) ma listę punktów do sprawdzenia; wykonanie
-- (przeglady_wykonania) zapisuje wynik każdego punktu: ok / nok (nieprawidłowość, wymaga opisu) / nd
-- (nie dotyczy). Wyniki są kopią treści punktów z chwili wykonania, więc późniejsza zmiana listy nie
-- zmienia historii. Nieprawidłowość powiadamia kierowników i właściciela urządzenia.

alter type public.typ_powiadomienia add value if not exists 'przeglad_nieprawidlowosc';

-- Do 30 punktów, każdy 1–200 znaków (po obcięciu spacji).
create or replace function public.lista_kontrolna_poprawna(p_lista text[])
returns boolean
language sql immutable set search_path = public as $$
  select coalesce(cardinality(p_lista), 0) <= 30
    and not exists (
      select 1 from unnest(coalesce(p_lista, '{}'::text[])) e
      where e is null or char_length(btrim(e)) not between 1 and 200
    )
$$;
revoke all on function public.lista_kontrolna_poprawna(text[]) from public, anon;
grant execute on function public.lista_kontrolna_poprawna(text[]) to authenticated, service_role;

alter table public.przeglady
  add column lista_kontrolna text[] not null default '{}'
  check (public.lista_kontrolna_poprawna(lista_kontrolna));
grant insert (lista_kontrolna), update (lista_kontrolna) on public.przeglady to authenticated;

alter table public.przeglady_wykonania
  add column lista_kontrolna jsonb not null default '[]'::jsonb;

-- Autor z konta, data nie z przyszłości (jak dotąd) oraz walidacja wyników listy kontrolnej względem
-- aktualnej listy przeglądu. Wynik jest przebudowywany z pól, więc dodatkowe klucze od klienta znikają.
create or replace function public.przeglady_wykonania_przed()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_lista text[];
  v_wyniki jsonb := coalesce(new.lista_kontrolna, '[]'::jsonb);
  v_wynik jsonb;
  v_czysta jsonb := '[]'::jsonb;
  v_uwaga text;
  i integer;
begin
  if auth.uid() is not null then
    new.autor_id := auth.uid();
  end if;
  if new.data_wykonania > public.dzis_pl() then
    raise exception 'Data wykonania przeglądu nie może być w przyszłości';
  end if;

  select p.lista_kontrolna into v_lista from public.przeglady p where p.id = new.przeglad_id;
  if coalesce(cardinality(v_lista), 0) = 0 then
    new.lista_kontrolna := '[]'::jsonb;
    return new;
  end if;
  if jsonb_typeof(v_wyniki) <> 'array' or jsonb_array_length(v_wyniki) <> cardinality(v_lista) then
    raise exception 'Uzupełnij listę kontrolną: oceń każdy punkt';
  end if;
  for i in 1 .. cardinality(v_lista) loop
    v_wynik := v_wyniki -> (i - 1);
    if v_wynik ->> 'tresc' is distinct from v_lista[i] then
      raise exception 'Lista kontrolna przeglądu została zmieniona — odśwież i wypełnij ją ponownie';
    end if;
    if coalesce(v_wynik ->> 'wynik', '') not in ('ok', 'nok', 'nd') then
      raise exception 'Uzupełnij listę kontrolną: oceń każdy punkt';
    end if;
    v_uwaga := nullif(btrim(coalesce(v_wynik ->> 'uwaga', '')), '');
    if v_wynik ->> 'wynik' = 'nok' and v_uwaga is null then
      raise exception 'Opisz nieprawidłowość w punkcie: %', v_lista[i];
    end if;
    if v_uwaga is not null and char_length(v_uwaga) > 500 then
      raise exception 'Opis punktu listy kontrolnej może mieć najwyżej 500 znaków';
    end if;
    v_czysta := v_czysta || jsonb_build_array(jsonb_build_object(
      'tresc', v_lista[i], 'wynik', v_wynik ->> 'wynik', 'uwaga', v_uwaga));
  end loop;
  new.lista_kontrolna := v_czysta;
  return new;
end
$$;

-- Nieprawidłowość w liście kontrolnej → powiadomienie krytyczne dla kierowników i właściciela urządzenia
-- (bez autora wykonania). Zapis service-role nie powiadamia, jak pozostałe reguły.
create or replace function public.przeglady_wykonania_powiadom()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_liczba integer;
  v_nr text;
  v_odbiorca uuid;
begin
  if auth.uid() is null then
    return null;
  end if;
  select count(*) into v_liczba
    from jsonb_array_elements(new.lista_kontrolna) e where e ->> 'wynik' = 'nok';
  if v_liczba = 0 then
    return null;
  end if;
  select p.nr_technologiczny into v_nr from public.przeglady p where p.id = new.przeglad_id;
  for v_odbiorca in select * from public.odbiorcy_przegladu(new.przeglad_id) loop
    if v_odbiorca is distinct from auth.uid() then
      perform public.powiadom(
        v_odbiorca, 'przeglad_nieprawidlowosc',
        format('Przegląd %s: %s nieprawidłowości na liście kontrolnej', v_nr, v_liczba),
        '/przeglady/' || new.przeglad_id, true, 'nok:' || new.id, null, new.przeglad_id);
    end if;
  end loop;
  return null;
end
$$;
revoke all on function public.przeglady_wykonania_powiadom() from public, anon, authenticated;

create trigger przeglady_wykonania_nieprawidlowosci
  after insert on public.przeglady_wykonania
  for each row execute function public.przeglady_wykonania_powiadom();
