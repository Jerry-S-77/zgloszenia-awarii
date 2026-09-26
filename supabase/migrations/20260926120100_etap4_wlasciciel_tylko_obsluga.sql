-- Etap 4, poprawka po przeglądzie kodu: właściciel urządzenia dostaje powiadomienia o awariach i przeglądach
-- tylko jako osoba obsługi (technik, kierownik, admin). Pracownik nie może otworzyć cudzej awarii ani ekranu
-- przeglądów, a treść powiadomienia zdradzałaby mu opis awarii, który RLS przed nim ukrywa.

create or replace function public.awarie_powiadom_nowa()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_odbiorca uuid;
  v_wlasciciel uuid;
  v_krytyczna boolean := new.krytycznosc_skutku = 'Wysoka';
  v_tresc text;
begin
  if auth.uid() is null then
    return null;
  end if;
  select u.wlasciciel_id into v_wlasciciel from public.urzadzenia u
    where u.nr_technologiczny = new.nr_technologiczny;
  v_tresc := format('%s %s · %s — %s',
    case when v_krytyczna then 'Krytyczna awaria' else 'Nowa awaria' end,
    coalesce(new.numer, ''), new.nr_technologiczny, left(new.opis_awarii, 120));
  for v_odbiorca in
    select * from public.odbiorcy_rol(array['technik', 'kierownik']::public.rola_uzytkownika[])
    union
    select v_wlasciciel where v_wlasciciel is not null and public.osoba_obslugi(v_wlasciciel)
  loop
    if v_odbiorca <> auth.uid() then
      perform public.powiadom(v_odbiorca, 'nowa_awaria', v_tresc, '/awarie/' || new.id,
                              v_krytyczna, null, new.id, null);
    end if;
  end loop;
  return null;
end
$$;

create or replace function public.odbiorcy_przegladu(p_przeglad uuid)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select u.wlasciciel_id from public.przeglady p
    join public.urzadzenia u on u.nr_technologiczny = p.nr_technologiczny
    where p.id = p_przeglad and u.wlasciciel_id is not null and public.osoba_obslugi(u.wlasciciel_id)
  union
  select * from public.odbiorcy_rol(array['kierownik']::public.rola_uzytkownika[])
$$;
revoke all on function public.odbiorcy_przegladu(uuid) from public, anon, authenticated;
