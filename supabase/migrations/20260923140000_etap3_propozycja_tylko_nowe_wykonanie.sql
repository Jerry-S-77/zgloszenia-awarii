-- Etap 3, poprawka po przeglądzie bezpieczeństwa: propozycję przyspieszenia zamyka tylko wykonanie, które
-- faktycznie przesunęło daty przeglądu. Wpis z datą wsteczną (starszy niż ostatni przegląd) niczego nie zmienia,
-- więc nie może też zamknąć propozycji, o której decyduje kierownik.
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

  if found then
    update public.przeglady_propozycje set status = 'nieaktualna', decyzja_at = now()
    where przeglad_id = new.przeglad_id and status = 'oczekuje';
  end if;
  return null;
end
$$;
