-- Poprawka numeracji: lpad(tekst, 3, '0') w Postgresie UCINA dłuższy tekst, więc 1001. awaria w roku
-- dostawała numer „AWR-<rok>-100” (duplikat, zapis odrzucany przez unikalność numeru). Teraz numery do 999
-- są dopełniane zerami do trzech cyfr, a dłuższe zostają w całości (AWR-2026-1001). Reszta bez zmian.
create or replace function public.awarie_nadaj_numer()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rok integer;
  v_nr integer;
  v_nastepny integer;
begin
  if auth.uid() is null and new.numer is not null then
    if new.numer !~ '^AWR-[0-9]{4}-[0-9]{3,}$' then
      raise exception 'Nieprawidłowy numer awarii: %', new.numer;
    end if;
    v_rok := split_part(new.numer, '-', 2)::integer;
    v_nr := split_part(new.numer, '-', 3)::integer;
    insert into public.numeracja_awarii (rok, ostatni) values (v_rok, 0)
      on conflict (rok) do nothing;
    update public.numeracja_awarii set ostatni = greatest(ostatni, v_nr) where rok = v_rok;
    return new;
  end if;
  v_rok := extract(year from new.data_awarii)::integer;
  insert into public.numeracja_awarii (rok, ostatni) values (v_rok, 0)
    on conflict (rok) do nothing;
  update public.numeracja_awarii set ostatni = ostatni + 1
    where rok = v_rok
    returning ostatni into v_nastepny;
  new.numer := format('AWR-%s-%s', v_rok,
    case when v_nastepny < 1000 then lpad(v_nastepny::text, 3, '0') else v_nastepny::text end);
  return new;
end
$$;
