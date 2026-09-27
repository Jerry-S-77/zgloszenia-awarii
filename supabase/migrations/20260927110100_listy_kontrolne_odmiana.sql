-- Poprawna odmiana w treści powiadomienia: „1 nieprawidłowość”, „2 nieprawidłowości”.
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
        format('Przegląd %s: %s %s na liście kontrolnej', v_nr, v_liczba,
               case when v_liczba = 1 then 'nieprawidłowość' else 'nieprawidłowości' end),
        '/przeglady/' || new.przeglad_id, true, 'nok:' || new.id, null, new.przeglad_id);
    end if;
  end loop;
  return null;
end
$$;
revoke all on function public.przeglady_wykonania_powiadom() from public, anon, authenticated;
