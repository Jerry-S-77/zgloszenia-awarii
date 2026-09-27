-- Czytelne liczby w treści alarmu niskiego stanu: „4 szt., minimum 5” zamiast „4.00 szt., minimum 5.00”
-- (bez zbędnych zer, polski przecinek dziesiętny). Reszta funkcji bez zmian.
create or replace function public.liczba_pl(p numeric)
returns text
language sql immutable set search_path = public as $$
  select replace(trim_scale(p)::text, '.', ',')
$$;
revoke all on function public.liczba_pl(numeric) from public, anon;
grant execute on function public.liczba_pl(numeric) to authenticated, service_role;

create or replace function public.magazyn_zmien_stan(
  p_czesc uuid,
  p_typ public.typ_ruchu_magazynu,
  p_zmiana numeric,
  p_awaria uuid,
  p_uwagi text
)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_czesc public.magazyn_czesci%rowtype;
  v_nowy numeric;
  v_odbiorca uuid;
  v_ruch uuid;
begin
  select * into v_czesc from public.magazyn_czesci where id = p_czesc for update;
  if not found then
    raise exception 'Nie ma takiej części w magazynie';
  end if;
  v_nowy := v_czesc.stan + p_zmiana;
  if v_nowy < 0 then
    raise exception 'Za mało na stanie: % % (dostępne %)',
      v_czesc.nazwa, public.liczba_pl(-p_zmiana), public.liczba_pl(v_czesc.stan);
  end if;
  update public.magazyn_czesci set stan = v_nowy where id = p_czesc;
  insert into public.magazyn_ruchy (czesc_id, typ, zmiana, stan_po, awaria_id, uwagi, autor_id, autor_nazwa)
    values (p_czesc, p_typ, p_zmiana, v_nowy, p_awaria, nullif(btrim(coalesce(p_uwagi, '')), ''),
            auth.uid(), (select p.imie_nazwisko from public.profiles p where p.id = auth.uid()))
    returning id into v_ruch;
  if v_czesc.stan_minimalny > 0 and v_nowy < v_czesc.stan_minimalny
     and v_czesc.stan >= v_czesc.stan_minimalny then
    for v_odbiorca in
      select * from public.odbiorcy_rol(array['kierownik', 'admin']::public.rola_uzytkownika[])
    loop
      perform public.powiadom(
        v_odbiorca, 'niski_stan',
        format('Niski stan w magazynie: %s (%s) — zostało %s %s, minimum %s',
               v_czesc.nazwa, v_czesc.numer_katalogowy, public.liczba_pl(v_nowy), v_czesc.jednostka,
               public.liczba_pl(v_czesc.stan_minimalny)),
        '/magazyn', true, 'stan:' || v_ruch, null, null);
    end loop;
  end if;
  return v_nowy;
end
$$;
revoke all on function public.magazyn_zmien_stan(uuid, public.typ_ruchu_magazynu, numeric, uuid, text)
  from public, anon, authenticated;
