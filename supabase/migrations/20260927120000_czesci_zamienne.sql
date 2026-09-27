-- Części zamienne przy awarii (poziom 1, bez magazynu): jakiej części potrzeba, ile, na jakim jest etapie
-- (potrzebna → zamówiona → dostarczona) i kiedy ma dotrzeć. Przez awarię część należy do urządzenia, więc
-- karta urządzenia pokazuje historię zużytych części. Zmiany tylko przy niezamkniętej awarii (po zamknięciu
-- zapis jest zamrożony), tylko obsługa; pracownik widzi części swojej awarii. Dodanie, zmiana statusu
-- i usunięcie trafiają do historii; dostarczenie powiadamia zespół awarii.

alter type public.typ_powiadomienia add value if not exists 'czesc_dostarczona';

create type public.status_czesci as enum ('potrzebna', 'zamowiona', 'dostarczona');

create table public.awarie_czesci (
  id uuid primary key default gen_random_uuid(),
  awaria_id uuid not null references public.awarie (id) on delete cascade,
  nazwa text not null check (char_length(btrim(nazwa)) between 1 and 200),
  ilosc integer not null default 1 check (ilosc between 1 and 9999),
  status public.status_czesci not null default 'potrzebna',
  termin_dostawy date,
  autor_id uuid references public.profiles (id) on delete set null,
  autor_nazwa text,
  created_at timestamptz not null default now(),
  zmieniono_at timestamptz not null default now()
);
create index awarie_czesci_awaria_idx on public.awarie_czesci (awaria_id, created_at);

alter table public.awarie_czesci enable row level security;
revoke all on public.awarie_czesci from anon, authenticated;
grant select, delete on public.awarie_czesci to authenticated;
grant insert (awaria_id, nazwa, ilosc, status, termin_dostawy) on public.awarie_czesci to authenticated;
grant update (nazwa, ilosc, status, termin_dostawy) on public.awarie_czesci to authenticated;
grant all on public.awarie_czesci to service_role;

create policy awarie_czesci_select on public.awarie_czesci for select to authenticated
  using (public.widzi_awarie(awaria_id));
create policy awarie_czesci_insert on public.awarie_czesci for insert to authenticated
  with check (
    public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[])
    and public.awaria_otwarta(awaria_id)
  );
create policy awarie_czesci_update on public.awarie_czesci for update to authenticated
  using (
    public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[])
    and public.awaria_otwarta(awaria_id)
  )
  with check (
    public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[])
    and public.awaria_otwarta(awaria_id)
  );
create policy awarie_czesci_delete on public.awarie_czesci for delete to authenticated
  using (
    public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[])
    and public.awaria_otwarta(awaria_id)
  );

-- Autor z konta, nazwa bez zbędnych spacji, znacznik czasu zmiany.
create or replace function public.czesci_przed_zapisem()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.nazwa := btrim(new.nazwa);
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.autor_id := auth.uid();
    end if;
    new.autor_nazwa := (select p.imie_nazwisko from public.profiles p where p.id = new.autor_id);
    new.created_at := now();
  else
    new.awaria_id := old.awaria_id;
    new.autor_id := old.autor_id;
    new.autor_nazwa := old.autor_nazwa;
    new.created_at := old.created_at;
  end if;
  new.zmieniono_at := now();
  return new;
end
$$;
revoke all on function public.czesci_przed_zapisem() from public, anon, authenticated;

create trigger awarie_czesci_przed_zapisem
  before insert or update on public.awarie_czesci
  for each row execute function public.czesci_przed_zapisem();

-- Historia awarii i powiadomienie zespołu o dostarczeniu (bez osoby, która je odnotowała).
create or replace function public.czesci_po_zapisie()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nazwa_osoby text := (select p.imie_nazwisko from public.profiles p where p.id = auth.uid());
  v_numer text;
  v_czlonek uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.awarie_historia (awaria_id, autor_id, typ, dane)
      values (new.awaria_id, auth.uid(), 'edycja', jsonb_build_object(
        'akcja', 'czesc_dodana', 'czesc', new.nazwa, 'ilosc', new.ilosc, 'nazwa', v_nazwa_osoby));
    return null;
  end if;
  if tg_op = 'DELETE' then
    -- Przy kaskadowym usunięciu awarii nie ma już do czego dopisać historii.
    if exists (select 1 from public.awarie a where a.id = old.awaria_id) then
      insert into public.awarie_historia (awaria_id, autor_id, typ, dane)
        values (old.awaria_id, auth.uid(), 'edycja', jsonb_build_object(
          'akcja', 'czesc_usunieta', 'czesc', old.nazwa, 'nazwa', v_nazwa_osoby));
    end if;
    return null;
  end if;
  if new.status is distinct from old.status then
    insert into public.awarie_historia (awaria_id, autor_id, typ, dane)
      values (new.awaria_id, auth.uid(), 'edycja', jsonb_build_object(
        'akcja', 'czesc_status', 'czesc', new.nazwa, 'status', new.status, 'nazwa', v_nazwa_osoby));
    if new.status = 'dostarczona' and auth.uid() is not null then
      select a.numer into v_numer from public.awarie a where a.id = new.awaria_id;
      for v_czlonek in
        select z.uzytkownik_id from public.awarie_zespol z where z.awaria_id = new.awaria_id
      loop
        if v_czlonek is distinct from auth.uid() then
          perform public.powiadom(
            v_czlonek, 'czesc_dostarczona',
            format('Dotarła część %s do awarii %s', new.nazwa, coalesce(v_numer, '')),
            '/awarie/' || new.awaria_id, false, 'czesc:' || new.id || ':dostarczona',
            new.awaria_id, null);
        end if;
      end loop;
    end if;
  end if;
  return null;
end
$$;
revoke all on function public.czesci_po_zapisie() from public, anon, authenticated;

create trigger awarie_czesci_po_zapisie
  after insert or update or delete on public.awarie_czesci
  for each row execute function public.czesci_po_zapisie();
