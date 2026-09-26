-- Poprawki po przeglądzie:
-- 1. Usunięcie awarii ze zdjęciami: kaskada usuwa zdjęcia, a trigger historii próbował dopisać wpis
--    do usuwanej awarii (naruszenie klucza obcego blokowało całe usunięcie). Przy kaskadzie awarii
--    już nie ma, więc wpisu nie dodajemy.
-- 2. zdjecia_inne_pliki liczy pliki tylko awarii, którą wywołujący widzi (bezpośrednie wywołanie RPC
--    nie ujawnia już liczby zdjęć cudzych awarii ani, przez znaki % i _, wszystkich plików).

create or replace function public.zdjecia_zapisz_historie()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.awarie_historia (awaria_id, autor_id, typ, dane)
      values (new.awaria_id, auth.uid(), 'edycja',
              jsonb_build_object('akcja', 'zdjecie_dodane', 'nazwa', new.autor_nazwa));
    return new;
  end if;
  if not exists (select 1 from public.awarie a where a.id = old.awaria_id) then
    return old;
  end if;
  insert into public.awarie_historia (awaria_id, autor_id, typ, dane)
    values (old.awaria_id, auth.uid(), 'edycja',
            jsonb_build_object('akcja', 'zdjecie_usuniete',
                               'nazwa', (select p.imie_nazwisko from public.profiles p where p.id = auth.uid())));
  return old;
end
$$;
revoke all on function public.zdjecia_zapisz_historie() from public, anon, authenticated;

create or replace function public.zdjecia_inne_pliki(p_nazwa text)
returns integer
language sql stable security definer set search_path = public, storage as $$
  select case
    when public.zdjecie_awaria_id(p_nazwa) is null
      or not public.widzi_awarie(public.zdjecie_awaria_id(p_nazwa)) then 0
    else (
      select count(*)::integer from storage.objects o
      where o.bucket_id = 'zdjecia-awarii'
        and o.name like public.zdjecie_awaria_id(p_nazwa)::text || '/%'
        and o.name <> p_nazwa
    )
  end
$$;
revoke all on function public.zdjecia_inne_pliki(text) from public, anon;
grant execute on function public.zdjecia_inne_pliki(text) to authenticated, service_role;
