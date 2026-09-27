-- Magazyn części (poziom 2): katalog części ze stanem, przypisanie części do urządzeń, historia ruchów
-- (przyjęcie, wydanie do awarii, korekta) i alarm niskiego stanu. Katalogiem, dostawami i korektami zarządzają
-- kierownik i admin; technik widzi stany i pobiera części do awarii (to zdejmuje ze stanu). Stan zmienia się
-- WYŁĄCZNIE przez funkcje RPC poniżej (kolumna `stan` nie ma uprawnienia UPDATE), każda zmiana zostawia ruch.

alter type public.typ_powiadomienia add value if not exists 'niski_stan';

create table public.magazyn_czesci (
  id uuid primary key default gen_random_uuid(),
  numer_katalogowy text not null unique
    check (char_length(btrim(numer_katalogowy)) between 1 and 100),
  nazwa text not null check (char_length(btrim(nazwa)) between 1 and 200),
  jednostka text not null default 'szt.' check (char_length(btrim(jednostka)) between 1 and 20),
  stan numeric(12, 2) not null default 0 check (stan >= 0),
  stan_minimalny numeric(12, 2) not null default 0 check (stan_minimalny >= 0),
  lokalizacja text check (lokalizacja is null or char_length(lokalizacja) <= 200),
  aktywna boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.magazyn_czesci enable row level security;
revoke all on public.magazyn_czesci from anon, authenticated;
grant select on public.magazyn_czesci to authenticated;
grant insert (numer_katalogowy, nazwa, jednostka, stan_minimalny, lokalizacja)
  on public.magazyn_czesci to authenticated;
grant update (nazwa, jednostka, stan_minimalny, lokalizacja, aktywna)
  on public.magazyn_czesci to authenticated;
grant all on public.magazyn_czesci to service_role;

create policy magazyn_czesci_select on public.magazyn_czesci for select to authenticated
  using (public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[]));
create policy magazyn_czesci_insert on public.magazyn_czesci for insert to authenticated
  with check (public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]));
create policy magazyn_czesci_update on public.magazyn_czesci for update to authenticated
  using (public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]))
  with check (public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]));

-- Które części pasują do których urządzeń (wiele do wielu); „krytyczna” = brak zatrzymuje urządzenie.
create table public.urzadzenia_czesci (
  nr_technologiczny text not null references public.urzadzenia (nr_technologiczny) on delete cascade,
  czesc_id uuid not null references public.magazyn_czesci (id) on delete cascade,
  krytyczna boolean not null default false,
  primary key (nr_technologiczny, czesc_id)
);
create index urzadzenia_czesci_czesc_idx on public.urzadzenia_czesci (czesc_id);

alter table public.urzadzenia_czesci enable row level security;
revoke all on public.urzadzenia_czesci from anon, authenticated;
grant select, insert, delete on public.urzadzenia_czesci to authenticated;
grant update (krytyczna) on public.urzadzenia_czesci to authenticated;
grant all on public.urzadzenia_czesci to service_role;

create policy urzadzenia_czesci_select on public.urzadzenia_czesci for select to authenticated
  using (public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[]));
create policy urzadzenia_czesci_insert on public.urzadzenia_czesci for insert to authenticated
  with check (public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]));
create policy urzadzenia_czesci_update on public.urzadzenia_czesci for update to authenticated
  using (public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]))
  with check (public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]));
create policy urzadzenia_czesci_delete on public.urzadzenia_czesci for delete to authenticated
  using (public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]));

create type public.typ_ruchu_magazynu as enum ('przyjecie', 'wydanie', 'korekta');

-- Historia ruchów: tylko do odczytu dla obsługi, zapis wyłącznie przez funkcje RPC.
create table public.magazyn_ruchy (
  id uuid primary key default gen_random_uuid(),
  czesc_id uuid not null references public.magazyn_czesci (id) on delete cascade,
  typ public.typ_ruchu_magazynu not null,
  zmiana numeric(12, 2) not null,
  stan_po numeric(12, 2) not null,
  awaria_id uuid references public.awarie (id) on delete set null,
  uwagi text check (uwagi is null or char_length(uwagi) <= 500),
  autor_id uuid references public.profiles (id) on delete set null,
  autor_nazwa text,
  created_at timestamptz not null default now()
);
create index magazyn_ruchy_czesc_idx on public.magazyn_ruchy (czesc_id, created_at desc);

alter table public.magazyn_ruchy enable row level security;
revoke all on public.magazyn_ruchy from anon, authenticated;
grant select on public.magazyn_ruchy to authenticated;
grant all on public.magazyn_ruchy to service_role;

create policy magazyn_ruchy_select on public.magazyn_ruchy for select to authenticated
  using (public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[]));

-- Część przy awarii może wskazywać pozycję magazynu (pobrana z magazynu albo zamówiona pod nią).
alter table public.awarie_czesci
  add column magazyn_czesc_id uuid references public.magazyn_czesci (id) on delete set null;
grant insert (magazyn_czesc_id) on public.awarie_czesci to authenticated;

-- Wspólny zapis zmiany stanu: blokada wiersza (równoległe wydania nie zejdą poniżej zera), ruch w historii
-- i powiadomienie kierowników i adminów, gdy stan właśnie spadł poniżej minimum.
create or replace function public.magazyn_zmien_stan(
  p_czesc uuid,
  p_typ public.typ_ruchu_magazynu,
  p_zmiana numeric,
  p_awaria uuid,
  p_uwagi text
)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_czesc public.magazyn_czesci%rowtype;
  v_nowy numeric;
  v_odbiorca uuid;
  v_ruch uuid;
begin
  select * into v_czesc from public.magazyn_czesci where id = p_czesc for update;
  if not found then
    raise exception 'Nie ma takiej części w magazynie';
  end if;
  v_nowy := v_czesc.stan + p_zmiana;
  if v_nowy < 0 then
    raise exception 'Za mało na stanie: % % (dostępne %)', v_czesc.nazwa, -p_zmiana, v_czesc.stan;
  end if;
  update public.magazyn_czesci set stan = v_nowy where id = p_czesc;
  insert into public.magazyn_ruchy (czesc_id, typ, zmiana, stan_po, awaria_id, uwagi, autor_id, autor_nazwa)
    values (p_czesc, p_typ, p_zmiana, v_nowy, p_awaria, nullif(btrim(coalesce(p_uwagi, '')), ''),
            auth.uid(), (select p.imie_nazwisko from public.profiles p where p.id = auth.uid()))
    returning id into v_ruch;
  if v_czesc.stan_minimalny > 0 and v_nowy < v_czesc.stan_minimalny
     and v_czesc.stan >= v_czesc.stan_minimalny then
    for v_odbiorca in
      select * from public.odbiorcy_rol(array['kierownik', 'admin']::public.rola_uzytkownika[])
    loop
      perform public.powiadom(
        v_odbiorca, 'niski_stan',
        format('Niski stan w magazynie: %s (%s) — zostało %s %s, minimum %s',
               v_czesc.nazwa, v_czesc.numer_katalogowy, v_nowy, v_czesc.jednostka, v_czesc.stan_minimalny),
        '/magazyn', true, 'stan:' || v_ruch, null, null);
    end loop;
  end if;
  return v_nowy;
end
$$;
revoke all on function public.magazyn_zmien_stan(uuid, public.typ_ruchu_magazynu, numeric, uuid, text)
  from public, anon, authenticated;

-- Przyjęcie dostawy (kierownik, admin).
create or replace function public.magazyn_przyjecie(p_czesc uuid, p_ilosc numeric, p_uwagi text default null)
returns numeric
language plpgsql security definer set search_path = public as $$
begin
  if not public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]) then
    raise exception 'Przyjęcie dostawy wymaga roli kierownika lub administratora';
  end if;
  if p_ilosc is null or p_ilosc <= 0 or p_ilosc > 100000 then
    raise exception 'Ilość przyjęcia musi być większa od zera';
  end if;
  return public.magazyn_zmien_stan(p_czesc, 'przyjecie', p_ilosc, null, p_uwagi);
end
$$;
revoke all on function public.magazyn_przyjecie(uuid, numeric, text) from public, anon;
grant execute on function public.magazyn_przyjecie(uuid, numeric, text) to authenticated;

-- Korekta do stanu faktycznego (inwentaryzacja; kierownik, admin). Uwagi wymagane — to zmiana ręczna.
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
  select stan into v_stan from public.magazyn_czesci where id = p_czesc;
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

-- Pobranie części z magazynu do awarii (obsługa, tylko przy niezamkniętej awarii): zdejmuje ze stanu
-- i od razu zapisuje część przy awarii jako dostarczoną (pobraną). Całość w jednej transakcji.
create or replace function public.magazyn_pobierz_do_awarii(p_czesc uuid, p_awaria uuid, p_ilosc integer)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_czesc public.magazyn_czesci%rowtype;
  v_id uuid;
begin
  if not public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[]) then
    raise exception 'Pobranie z magazynu wymaga roli technika, kierownika lub administratora';
  end if;
  if not public.awaria_otwarta(p_awaria) then
    raise exception 'Awaria jest zamknięta albo nie istnieje';
  end if;
  if p_ilosc is null or p_ilosc < 1 or p_ilosc > 9999 then
    raise exception 'Ilość: liczba całkowita od 1 do 9999';
  end if;
  select * into v_czesc from public.magazyn_czesci where id = p_czesc;
  if not found or not v_czesc.aktywna then
    raise exception 'Nie ma takiej części w magazynie';
  end if;
  perform public.magazyn_zmien_stan(p_czesc, 'wydanie', -p_ilosc, p_awaria, null);
  insert into public.awarie_czesci (awaria_id, nazwa, ilosc, status, magazyn_czesc_id)
    values (p_awaria, v_czesc.nazwa || ' (' || v_czesc.numer_katalogowy || ')', p_ilosc, 'dostarczona', p_czesc)
    returning id into v_id;
  return v_id;
end
$$;
revoke all on function public.magazyn_pobierz_do_awarii(uuid, uuid, integer) from public, anon;
grant execute on function public.magazyn_pobierz_do_awarii(uuid, uuid, integer) to authenticated;

-- Import katalogu z pliku (kierownik, admin), atomowo: albo wszystkie wiersze, albo żaden. Klucz: numer
-- katalogowy — istniejąca część dostaje nowe dane (bez zmiany stanu), nowa część dostaje stan początkowy jako
-- przyjęcie. Urządzenia z pliku są dopisywane (istniejące przypisania zostają).
-- Wiersz: {numer_katalogowy, nazwa, jednostka?, stan_minimalny?, stan_poczatkowy?, lokalizacja?,
--          urzadzenia?: text[], krytyczna?: boolean}
create or replace function public.magazyn_import(p_wiersze jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_w jsonb;
  v_nr text;
  v_id uuid;
  v_nowa boolean;
  v_nowe integer := 0;
  v_zmienione integer := 0;
  v_urz text;
  v_poczatkowy numeric;
  i integer := 0;
begin
  if not public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]) then
    raise exception 'Import magazynu wymaga roli kierownika lub administratora';
  end if;
  if jsonb_typeof(p_wiersze) <> 'array' or jsonb_array_length(p_wiersze) > 2000 then
    raise exception 'Plik importu: najwyżej 2000 wierszy';
  end if;
  for v_w in select * from jsonb_array_elements(p_wiersze) loop
    i := i + 1;
    v_nr := nullif(btrim(coalesce(v_w ->> 'numer_katalogowy', '')), '');
    if v_nr is null or nullif(btrim(coalesce(v_w ->> 'nazwa', '')), '') is null then
      raise exception 'Wiersz %: numer katalogowy i nazwa są wymagane', i;
    end if;
    select id into v_id from public.magazyn_czesci where numer_katalogowy = v_nr;
    v_nowa := v_id is null;
    if v_nowa then
      insert into public.magazyn_czesci (numer_katalogowy, nazwa, jednostka, stan_minimalny, lokalizacja)
        values (v_nr, btrim(v_w ->> 'nazwa'),
                coalesce(nullif(btrim(coalesce(v_w ->> 'jednostka', '')), ''), 'szt.'),
                coalesce((v_w ->> 'stan_minimalny')::numeric, 0),
                nullif(btrim(coalesce(v_w ->> 'lokalizacja', '')), ''))
        returning id into v_id;
      v_nowe := v_nowe + 1;
      v_poczatkowy := coalesce((v_w ->> 'stan_poczatkowy')::numeric, 0);
      if v_poczatkowy > 0 then
        perform public.magazyn_zmien_stan(v_id, 'przyjecie', v_poczatkowy, null, 'Stan początkowy z importu');
      end if;
    else
      update public.magazyn_czesci set
        nazwa = btrim(v_w ->> 'nazwa'),
        jednostka = coalesce(nullif(btrim(coalesce(v_w ->> 'jednostka', '')), ''), jednostka),
        stan_minimalny = coalesce((v_w ->> 'stan_minimalny')::numeric, stan_minimalny),
        lokalizacja = coalesce(nullif(btrim(coalesce(v_w ->> 'lokalizacja', '')), ''), lokalizacja),
        aktywna = true
      where id = v_id;
      v_zmienione := v_zmienione + 1;
    end if;
    for v_urz in select btrim(value) from jsonb_array_elements_text(coalesce(v_w -> 'urzadzenia', '[]'::jsonb))
    loop
      if v_urz = '' then
        continue;
      end if;
      if not exists (select 1 from public.urzadzenia u where u.nr_technologiczny = v_urz) then
        raise exception 'Wiersz %: nie ma urządzenia %', i, v_urz;
      end if;
      insert into public.urzadzenia_czesci (nr_technologiczny, czesc_id, krytyczna)
        values (v_urz, v_id, coalesce((v_w ->> 'krytyczna')::boolean, false))
        on conflict (nr_technologiczny, czesc_id) do update set krytyczna = excluded.krytyczna;
    end loop;
  end loop;
  return jsonb_build_object('nowe', v_nowe, 'zmienione', v_zmienione);
end
$$;
revoke all on function public.magazyn_import(jsonb) from public, anon;
grant execute on function public.magazyn_import(jsonb) to authenticated;
