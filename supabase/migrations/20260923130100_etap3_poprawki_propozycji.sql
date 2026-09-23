-- Etap 3, poprawki po przeglądzie kodu:
-- 1) wykonanie przeglądu zamyka jego oczekującą propozycję przyspieszenia (inaczej późniejsze zatwierdzenie
--    cofnęłoby termin świeżo wykonanego przeglądu);
-- 2) zatwierdzenie liczy termin od dnia decyzji (dziś + 7), a nie od dnia utworzenia propozycji — inaczej
--    decyzja podjęta po kilku dniach ustawiałaby termin w przeszłości.

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

  update public.przeglady_propozycje set status = 'nieaktualna', decyzja_at = now()
  where przeglad_id = new.przeglad_id and status = 'oczekuje';
  return null;
end
$$;

create or replace function public.przeglady_decyzja(p_propozycja_id uuid, p_zatwierdz boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prop public.przeglady_propozycje;
  v_termin date;
begin
  if not public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]) then
    raise exception 'Decyzja o przyspieszeniu przeglądu wymaga roli kierownika lub administratora'
      using errcode = '42501';
  end if;
  select * into v_prop from public.przeglady_propozycje where id = p_propozycja_id for update;
  if not found then
    raise exception 'Nie znaleziono propozycji';
  end if;
  if v_prop.status <> 'oczekuje' then
    raise exception 'Propozycja została już rozpatrzona';
  end if;
  -- Propozycja z terminem: termin liczony na nowo od dnia decyzji. Bez terminu („wykonaj pilnie"): bez zmiany daty.
  v_termin := case when v_prop.proponowany_termin is null then null else public.dzis_pl() + 7 end;
  update public.przeglady_propozycje set
    status = (case when p_zatwierdz then 'zatwierdzona' else 'odrzucona' end)::public.status_propozycji,
    proponowany_termin = coalesce(v_termin, proponowany_termin),
    decyzja_id = auth.uid(),
    decyzja_at = now()
  where id = p_propozycja_id;
  if p_zatwierdz and v_termin is not null then
    update public.przeglady set data_najblizszego = v_termin
    where id = v_prop.przeglad_id
      and (data_najblizszego is null or data_najblizszego > v_termin);
  end if;
end
$$;

revoke all on function public.przeglady_decyzja(uuid, boolean) from public, anon;
grant execute on function public.przeglady_decyzja(uuid, boolean) to authenticated;
