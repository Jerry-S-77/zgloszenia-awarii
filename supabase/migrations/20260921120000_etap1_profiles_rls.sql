-- Etap 1: konta użytkowników (profiles), zamknięcie RLS, autor zgłoszenia z auth.uid().

create type public.rola_uzytkownika as enum ('pracownik', 'technik', 'kierownik', 'admin');
create type public.status_uzytkownika as enum ('aktywny', 'zablokowany');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  imie_nazwisko text not null check (char_length(btrim(imie_nazwisko)) between 2 and 120),
  rola public.rola_uzytkownika not null default 'pracownik',
  status public.status_uzytkownika not null default 'aktywny',
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- Rola bieżącego użytkownika. NULL, gdy konto jest zablokowane albo czeka na zmianę hasła
-- (wtedy żadna polityka oparta na roli nie przepuści zapytania).
create or replace function public.moja_rola()
returns public.rola_uzytkownika
language sql stable security definer set search_path = public as $$
  select p.rola from public.profiles p
  where p.id = auth.uid() and p.status = 'aktywny' and not p.must_change_password
$$;

create or replace function public.mam_role(dozwolone public.rola_uzytkownika[])
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.moja_rola() = any (dozwolone), false)
$$;

revoke all on function public.moja_rola() from public, anon;
revoke all on function public.mam_role(public.rola_uzytkownika[]) from public, anon;
grant execute on function public.moja_rola() to authenticated, service_role;
grant execute on function public.mam_role(public.rola_uzytkownika[]) to authenticated, service_role;

-- Własny profil zawsze czytelny (interfejs musi wiedzieć, że trzeba zmienić hasło); admin czyta wszystkie.
create policy profiles_select_wlasny on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.mam_role(array['admin']::public.rola_uzytkownika[]));

-- Ostatni aktywny admin nie może zostać zdegradowany, zablokowany ani usunięty.
create or replace function public.profiles_pilnuj_ostatniego_admina()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pozostalo integer;
begin
  if old.rola = 'admin' and old.status = 'aktywny'
     and (tg_op = 'DELETE' or new.rola <> 'admin' or new.status <> 'aktywny') then
    select count(*) into pozostalo from public.profiles
      where rola = 'admin' and status = 'aktywny' and id <> old.id;
    if pozostalo = 0 then
      raise exception 'Nie można zdegradować, zablokować ani usunąć ostatniego aktywnego administratora';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger profiles_ostatni_admin
  before update or delete on public.profiles
  for each row execute function public.profiles_pilnuj_ostatniego_admina();

-- awarie: autor z konta zamiast wyboru z listy pracowników.
alter table public.awarie add column zglaszajacy_nazwa text;
update public.awarie a set zglaszajacy_nazwa = p.imie_nazwisko
  from public.pracownicy p where a.osoba_zglaszajaca_id = p.id;
drop table public.pracownicy cascade;
update public.awarie set osoba_zglaszajaca_id = null;
alter table public.awarie rename column osoba_zglaszajaca_id to zglaszajacy_id;
alter table public.awarie
  add constraint awarie_zglaszajacy_id_fkey foreign key (zglaszajacy_id)
  references public.profiles (id) on delete set null;

-- Autora ustawia baza. Wartości od klienta są ignorowane, a przy edycji autor jest niezmienny.
create or replace function public.awarie_pilnuj_zglaszajacego()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.zglaszajacy_id := auth.uid();
      select imie_nazwisko into new.zglaszajacy_nazwa from public.profiles where id = auth.uid();
    else
      new.zglaszajacy_id := old.zglaszajacy_id;
      new.zglaszajacy_nazwa := old.zglaszajacy_nazwa;
    end if;
  end if;
  return new;
end
$$;

create trigger awarie_zglaszajacy
  before insert or update on public.awarie
  for each row execute function public.awarie_pilnuj_zglaszajacego();

-- Zamknięcie RLS: koniec z dostępem anonimowym.
drop policy "awarie_read_all" on public.awarie;
drop policy "awarie_insert_all" on public.awarie;
drop policy "awarie_update_all" on public.awarie;
drop policy "urzadzenia_read_all" on public.urzadzenia;

revoke all on public.awarie from anon, authenticated;
grant select, insert, update on public.awarie to authenticated;
revoke all on public.urzadzenia from anon, authenticated;
grant select on public.urzadzenia to authenticated;

create policy awarie_select on public.awarie for select to authenticated using (
  public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[])
  or (public.moja_rola() is not null and zglaszajacy_id = auth.uid())
);
create policy awarie_insert on public.awarie for insert to authenticated
  with check (public.moja_rola() is not null);
create policy awarie_update on public.awarie for update to authenticated
  using (public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[]))
  with check (public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[]));

create policy urzadzenia_select on public.urzadzenia for select to authenticated
  using (public.moja_rola() is not null);
