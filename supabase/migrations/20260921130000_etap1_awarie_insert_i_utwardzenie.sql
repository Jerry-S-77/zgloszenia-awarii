-- Etap 1, poprawka po przeglądzie zadania 3: ograniczenia wstawiania awarii i drobne utwardzenie.

-- Nowa awaria musi być otwarta i bez danych zamknięcia (zamykanie to prawo technika i wyżej).
drop policy awarie_insert on public.awarie;
create policy awarie_insert on public.awarie for insert to authenticated
  with check (
    public.moja_rola() is not null
    and status = 'Otwarta'
    and data_zamkniecia is null
    and przyczyna is null
    and czas_przestoju_h is null
  );

-- Dwóch adminów degradowanych równocześnie nie może zostawić systemu bez administratora.
create or replace function public.profiles_pilnuj_ostatniego_admina()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pozostalo integer;
begin
  if old.rola = 'admin' and old.status = 'aktywny'
     and (tg_op = 'DELETE' or new.rola <> 'admin' or new.status <> 'aktywny') then
    perform pg_advisory_xact_lock(hashtext('profiles_ostatni_admin'));
    select count(*) into pozostalo from public.profiles
      where rola = 'admin' and status = 'aktywny' and id <> old.id;
    if pozostalo = 0 then
      raise exception 'Nie można zdegradować, zablokować ani usunąć ostatniego aktywnego administratora';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

-- TRUNCATE omijałby wierszowy trigger ostatniego admina.
revoke truncate on public.profiles from service_role;

-- Kolumna filtrowana przez politykę SELECT pracownika.
create index awarie_zglaszajacy_id_idx on public.awarie (zglaszajacy_id);
