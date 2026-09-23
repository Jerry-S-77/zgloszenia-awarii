-- Etap 3: harmonogram przeglądów, wykonania i propozycje przyspieszenia.

-- „Dziś" zakładu (serwer bazy działa w UTC).
create or replace function public.dzis_pl()
returns date
language sql stable as $$
  select (now() at time zone 'Europe/Warsaw')::date
$$;

create table public.przeglady (
  id uuid primary key default gen_random_uuid(),
  nr_technologiczny text not null references public.urzadzenia (nr_technologiczny) on delete cascade,
  typ_czynnosci text check (typ_czynnosci is null or char_length(btrim(typ_czynnosci)) between 1 and 200),
  czestotliwosc_dni integer check (czestotliwosc_dni is null or czestotliwosc_dni between 1 and 3650),
  data_ostatniego date,
  data_najblizszego date,
  wykonawca text check (wykonawca is null or char_length(wykonawca) <= 200),
  uwagi text check (uwagi is null or char_length(uwagi) <= 4000),
  created_at timestamptz not null default now()
);
create index przeglady_nr_idx on public.przeglady (nr_technologiczny);

alter table public.przeglady enable row level security;
revoke all on public.przeglady from anon, authenticated;
grant select on public.przeglady to authenticated;
grant insert (nr_technologiczny, typ_czynnosci, czestotliwosc_dni, data_ostatniego,
              data_najblizszego, wykonawca, uwagi)
  on public.przeglady to authenticated;
grant update (typ_czynnosci, czestotliwosc_dni, data_ostatniego, data_najblizszego, wykonawca, uwagi)
  on public.przeglady to authenticated;
grant all on public.przeglady to service_role;

create policy przeglady_select on public.przeglady for select to authenticated
  using (public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[]));
create policy przeglady_insert on public.przeglady for insert to authenticated
  with check (public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]));
create policy przeglady_update on public.przeglady for update to authenticated
  using (public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]))
  with check (public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]));

-- Wykonania: tylko dopisywanie (brak UPDATE/DELETE dla authenticated).
create table public.przeglady_wykonania (
  id uuid primary key default gen_random_uuid(),
  przeglad_id uuid not null references public.przeglady (id) on delete cascade,
  data_wykonania date not null,
  wykonawca text check (wykonawca is null or char_length(wykonawca) <= 200),
  uwagi text check (uwagi is null or char_length(uwagi) <= 2000),
  autor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index przeglady_wykonania_przeglad_idx on public.przeglady_wykonania (przeglad_id, data_wykonania);

alter table public.przeglady_wykonania enable row level security;
revoke all on public.przeglady_wykonania from anon, authenticated;
grant select, insert on public.przeglady_wykonania to authenticated;
grant all on public.przeglady_wykonania to service_role;

create policy przeglady_wykonania_select on public.przeglady_wykonania for select to authenticated
  using (public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[]));
create policy przeglady_wykonania_insert on public.przeglady_wykonania for insert to authenticated
  with check (public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[]));

create or replace function public.przeglady_wykonania_przed()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.autor_id := auth.uid();
  end if;
  if new.data_wykonania > public.dzis_pl() then
    raise exception 'Data wykonania przeglądu nie może być w przyszłości';
  end if;
  return new;
end
$$;

create trigger przeglady_wykonania_autor
  before insert on public.przeglady_wykonania
  for each row execute function public.przeglady_wykonania_przed();

-- Po wykonaniu: ostatni = data wykonania (bez cofania przy starszym wpisie), następny = data + częstotliwość.
create or replace function public.przeglady_wykonania_po()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.przeglady p set
    data_ostatniego = new.data_wykonania,
    data_najblizszego = case
      when p.czestotliwosc_dni is null then p.data_najblizszego
      else new.data_wykonania + p.czestotliwosc_dni
    end
  where p.id = new.przeglad_id
    and (p.data_ostatniego is null or p.data_ostatniego <= new.data_wykonania);
  return null;
end
$$;

create trigger przeglady_wykonania_daty
  after insert on public.przeglady_wykonania
  for each row execute function public.przeglady_wykonania_po();

-- Propozycje przyspieszenia: tworzy je trigger (kolejna migracja), decyduje RPC przeglady_decyzja.
create type public.status_propozycji as enum ('oczekuje', 'zatwierdzona', 'odrzucona');

create table public.przeglady_propozycje (
  id uuid primary key default gen_random_uuid(),
  przeglad_id uuid not null references public.przeglady (id) on delete cascade,
  proponowany_termin date,
  powod jsonb not null default '{}'::jsonb,
  status public.status_propozycji not null default 'oczekuje',
  decyzja_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  decyzja_at timestamptz
);
create unique index przeglady_propozycje_jedna_oczekujaca
  on public.przeglady_propozycje (przeglad_id) where status = 'oczekuje';

alter table public.przeglady_propozycje enable row level security;
revoke all on public.przeglady_propozycje from anon, authenticated;
grant select on public.przeglady_propozycje to authenticated;
grant all on public.przeglady_propozycje to service_role;

create policy przeglady_propozycje_select on public.przeglady_propozycje for select to authenticated
  using (public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[]));

-- Aktywne urządzenie bez harmonogramu dostaje pusty przegląd („Do uzupełnienia").
create or replace function public.urzadzenia_utworz_przeglad()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'aktywne'
     and (tg_op = 'INSERT' or old.status is distinct from 'aktywne')
     and not exists (select 1 from public.przeglady where nr_technologiczny = new.nr_technologiczny) then
    insert into public.przeglady (nr_technologiczny) values (new.nr_technologiczny);
  end if;
  return null;
end
$$;

create trigger urzadzenia_przeglad
  after insert or update of status on public.urzadzenia
  for each row execute function public.urzadzenia_utworz_przeglad();

insert into public.przeglady (nr_technologiczny)
  select u.nr_technologiczny from public.urzadzenia u
  where u.status = 'aktywne'
    and not exists (select 1 from public.przeglady p where p.nr_technologiczny = u.nr_technologiczny);
