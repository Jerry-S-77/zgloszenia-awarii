-- Etap 3: progi awaryjności w jednym miejscu, propozycje przyspieszenia, numer z importu.

-- Statystyki progów dla urządzeń z awariami (security invoker: RLS wywołującego obowiązuje).
-- Progi jak w dotychczasowej automatyzacji n8n: ≥3 awarie/90 dni, ≥2 „Wysoka"/60 dni, ≥8 h przestoju/30 dni.
create or replace function public.statystyki_progow_urzadzen()
returns table (
  nr_technologiczny text,
  nazwa_urzadzenia text,
  awarie_90 integer,
  wysokie_60 integer,
  przestoj_30 numeric,
  razem integer,
  przekracza boolean
)
language sql stable set search_path = public as $$
  with s as (
    select
      a.nr_technologiczny,
      max(a.nazwa_urzadzenia) as nazwa_urzadzenia,
      (count(*) filter (where a.data_awarii >= now() - interval '90 days' and a.data_awarii <= now()))::integer as awarie_90,
      (count(*) filter (where a.data_awarii >= now() - interval '60 days' and a.data_awarii <= now()
                          and a.krytycznosc_skutku = 'Wysoka'))::integer as wysokie_60,
      coalesce(sum(a.czas_przestoju_h) filter (where a.data_awarii >= now() - interval '30 days'
                                                 and a.data_awarii <= now()), 0) as przestoj_30,
      count(*)::integer as razem
    from public.awarie a
    group by a.nr_technologiczny
  )
  select s.nr_technologiczny, s.nazwa_urzadzenia, s.awarie_90, s.wysokie_60, s.przestoj_30, s.razem,
         (s.awarie_90 >= 3 or s.wysokie_60 >= 2 or s.przestoj_30 >= 8)
  from s
$$;

-- Tylko urządzenia przekraczające próg (trigger propozycji, zadania cykliczne etapu 4).
create or replace function public.urzadzenia_przekraczajace_progi()
returns table (
  nr_technologiczny text,
  nazwa_urzadzenia text,
  awarie_90 integer,
  wysokie_60 integer,
  przestoj_30 numeric,
  razem integer,
  przekracza boolean
)
language sql stable set search_path = public as $$
  select * from public.statystyki_progow_urzadzen() s where s.przekracza
$$;

revoke all on function public.statystyki_progow_urzadzen() from public, anon;
revoke all on function public.urzadzenia_przekraczajace_progi() from public, anon;
grant execute on function public.statystyki_progow_urzadzen() to authenticated, service_role;
grant execute on function public.urzadzenia_przekraczajace_progi() to authenticated, service_role;

-- Propozycja przyspieszenia dla przeglądów urządzenia, które przekracza próg.
create or replace function public.przeglady_sprawdz_progi(p_nr text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_stat record;
  v_przeglad record;
  v_ostatnia_decyzja timestamptz;
  v_termin date;
begin
  select * into v_stat from public.statystyki_progow_urzadzen() s
    where s.nr_technologiczny = p_nr and s.przekracza;
  if not found then
    return;
  end if;
  for v_przeglad in select p.* from public.przeglady p where p.nr_technologiczny = p_nr loop
    if exists (select 1 from public.przeglady_propozycje pp
               where pp.przeglad_id = v_przeglad.id and pp.status = 'oczekuje') then
      continue;
    end if;
    select max(pp.decyzja_at) into v_ostatnia_decyzja
      from public.przeglady_propozycje pp where pp.przeglad_id = v_przeglad.id;
    if v_ostatnia_decyzja is not null and not exists (
      select 1 from public.awarie a where a.nr_technologiczny = p_nr and a.created_at > v_ostatnia_decyzja
    ) then
      continue;
    end if;
    v_termin := public.dzis_pl() + 7;
    if v_przeglad.data_najblizszego is null or v_termin >= v_przeglad.data_najblizszego then
      v_termin := null;
    end if;
    insert into public.przeglady_propozycje (przeglad_id, proponowany_termin, powod)
    values (
      v_przeglad.id,
      v_termin,
      jsonb_build_object(
        'awarie_90', v_stat.awarie_90,
        'wysokie_60', v_stat.wysokie_60,
        'przestoj_30', v_stat.przestoj_30,
        'awarie', (
          select coalesce(jsonb_agg(jsonb_build_object('numer', a.numer, 'data', a.data_awarii)
                                    order by a.data_awarii), '[]'::jsonb)
          from public.awarie a
          where a.nr_technologiczny = p_nr
            and a.data_awarii >= now() - interval '90 days' and a.data_awarii <= now()
        )
      )
    )
    on conflict (przeglad_id) where status = 'oczekuje' do nothing;
  end loop;
end
$$;

revoke all on function public.przeglady_sprawdz_progi(text) from public, anon, authenticated;

create or replace function public.awarie_sprawdz_progi()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.przeglady_sprawdz_progi(new.nr_technologiczny);
  return null;
end
$$;

create trigger awarie_progi
  after insert or update of krytycznosc_skutku, czas_przestoju_h, data_awarii on public.awarie
  for each row execute function public.awarie_sprawdz_progi();

-- Decyzja kierownika lub admina: zatwierdzenie przesuwa termin (tylko na wcześniejszy), odrzucenie zamyka.
create or replace function public.przeglady_decyzja(p_propozycja_id uuid, p_zatwierdz boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prop public.przeglady_propozycje;
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
  update public.przeglady_propozycje set
    status = (case when p_zatwierdz then 'zatwierdzona' else 'odrzucona' end)::public.status_propozycji,
    decyzja_id = auth.uid(),
    decyzja_at = now()
  where id = p_propozycja_id;
  if p_zatwierdz and v_prop.proponowany_termin is not null then
    update public.przeglady set data_najblizszego = v_prop.proponowany_termin
    where id = v_prop.przeglad_id
      and (data_najblizszego is null or data_najblizszego > v_prop.proponowany_termin);
  end if;
end
$$;

revoke all on function public.przeglady_decyzja(uuid, boolean) from public, anon;
grant execute on function public.przeglady_decyzja(uuid, boolean) to authenticated;

-- Numeracja: import (service-role) może podać historyczny numer; licznik roku rośnie do maksimum.
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
  new.numer := format('AWR-%s-%s', v_rok, lpad(v_nastepny::text, 3, '0'));
  return new;
end
$$;
