-- Etap 3: rejestr urządzeń prowadzony w aplikacji (koniec synchronizacji z n8n).

create type public.status_urzadzenia as enum ('proponowane', 'aktywne', 'wycofane');

alter table public.urzadzenia
  add column status public.status_urzadzenia not null default 'proponowane';
update public.urzadzenia set status = (
  case lower(btrim(status_w_rejestrze))
    when 'aktywne' then 'aktywne'
    when 'proponowane' then 'proponowane'
    else 'wycofane'
  end
)::public.status_urzadzenia;
alter table public.urzadzenia drop column status_w_rejestrze;

-- Nazwisko właściciela jako tekst (dane historyczne, czytelne dla każdej roli) + powiązanie z kontem.
alter table public.urzadzenia rename column wlasciciel to wlasciciel_nazwa;
alter table public.urzadzenia
  add column wlasciciel_id uuid references public.profiles (id) on delete set null,
  add column uwagi text check (uwagi is null or char_length(uwagi) <= 2000);
alter table public.urzadzenia
  add constraint urzadzenia_nr_check
    check (char_length(btrim(nr_technologiczny)) between 1 and 40) not valid,
  add constraint urzadzenia_nazwa_check
    check (char_length(btrim(nazwa_urzadzenia)) between 2 and 300) not valid;

-- Kierownik nie czyta profiles, więc nazwisko właściciela kopiujemy do wiersza urządzenia.
create or replace function public.urzadzenia_nazwa_wlasciciela()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.wlasciciel_id is not null
     and (tg_op = 'INSERT' or new.wlasciciel_id is distinct from old.wlasciciel_id) then
    select imie_nazwisko into new.wlasciciel_nazwa from public.profiles where id = new.wlasciciel_id;
  end if;
  return new;
end
$$;

create trigger urzadzenia_wlasciciel
  before insert or update on public.urzadzenia
  for each row execute function public.urzadzenia_nazwa_wlasciciela();

-- Odczyt: pracownik tylko aktywne (lista przy zgłoszeniu), obsługa wszystkie. Zapis: tylko admin.
drop policy urzadzenia_select on public.urzadzenia;
create policy urzadzenia_select on public.urzadzenia for select to authenticated using (
  public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[])
  or (public.moja_rola() is not null and status = 'aktywne')
);

-- nr_technologiczny jest kluczem wskazywanym przez awarie: po utworzeniu niezmienny (brak grantu UPDATE).
grant insert (nr_technologiczny, nazwa_urzadzenia, kategoria, lokalizacja, krytycznosc,
              wlasciciel_id, wlasciciel_nazwa, status, uwagi)
  on public.urzadzenia to authenticated;
grant update (nazwa_urzadzenia, kategoria, lokalizacja, krytycznosc,
              wlasciciel_id, wlasciciel_nazwa, status, uwagi)
  on public.urzadzenia to authenticated;

create policy urzadzenia_insert on public.urzadzenia for insert to authenticated
  with check (public.mam_role(array['admin']::public.rola_uzytkownika[]));
create policy urzadzenia_update on public.urzadzenia for update to authenticated
  using (public.mam_role(array['admin']::public.rola_uzytkownika[]))
  with check (public.mam_role(array['admin']::public.rola_uzytkownika[]));
