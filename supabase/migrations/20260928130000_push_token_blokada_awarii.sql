-- Poprawki po ponownej weryfikacji (Codex, 2026-09-28).

-- A. Wyrejestrowanie push tylko z tokenem tej subskrypcji. Poprzednia wersja usuwała po samym adresie
--    (endpoint), więc każdy zalogowany, kto go poznał, mógł wyłączyć cudze powiadomienia, a zaległe
--    wyrejestrowanie mogło w wyścigu skasować subskrypcję nowej osoby na tym samym telefonie. Token jest
--    losowy, nadawany przy każdym zapisie subskrypcji i znany tylko przeglądarce, która ją zapisała.
alter table public.push_subskrypcje add column token uuid not null default gen_random_uuid();

drop function public.push_zapisz_subskrypcje(text, text, text, boolean);
create function public.push_zapisz_subskrypcje(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_tylko_krytyczne boolean default true
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_token uuid;
begin
  if public.moja_rola() is null then
    raise exception 'Brak aktywnego konta';
  end if;
  delete from public.push_subskrypcje where endpoint = p_endpoint;
  insert into public.push_subskrypcje (uzytkownik_id, endpoint, p256dh, auth, tylko_krytyczne)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth, coalesce(p_tylko_krytyczne, true))
    returning token into v_token;
  return v_token;
end
$$;
revoke all on function public.push_zapisz_subskrypcje(text, text, text, boolean) from public, anon;
grant execute on function public.push_zapisz_subskrypcje(text, text, text, boolean) to authenticated;

drop function public.push_usun_subskrypcje(text);
create function public.push_usun_subskrypcje(p_endpoint text, p_token uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Brak sesji';
  end if;
  delete from public.push_subskrypcje where endpoint = p_endpoint and token = p_token;
end
$$;
revoke all on function public.push_usun_subskrypcje(text, uuid) from public, anon;
grant execute on function public.push_usun_subskrypcje(text, uuid) to authenticated;

-- B. „Tylko przy niezamkniętej awarii” bez wyścigu: sprawdzenie blokuje wiersz awarii (FOR SHARE) do końca
--    transakcji, więc równoległe zamknięcie czeka albo — gdy było pierwsze — sprawdzenie widzi już zamkniętą.
--    Dotyczy części przy awarii (także pobrania z magazynu, które je wstawia) i zespołu.
create or replace function public.awaria_otwarta_z_blokada(p_awaria_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_status public.status_awarii;
begin
  select a.status into v_status from public.awarie a where a.id = p_awaria_id for share;
  return found and v_status <> 'zamknieta';
end
$$;
revoke all on function public.awaria_otwarta_z_blokada(uuid) from public, anon;
grant execute on function public.awaria_otwarta_z_blokada(uuid) to authenticated, service_role;

create or replace function public.pilnuj_otwartej_awarii()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  -- Usunięcie awarii kaskadą: wiersza awarii już nie ma, nie blokujemy.
  if tg_op = 'DELETE' and not exists (select 1 from public.awarie a where a.id = old.awaria_id) then
    return old;
  end if;
  if not public.awaria_otwarta_z_blokada(coalesce(new.awaria_id, old.awaria_id)) then
    raise exception 'Awaria jest zamknięta — zmiany nie są już możliwe';
  end if;
  return coalesce(new, old);
end
$$;
revoke all on function public.pilnuj_otwartej_awarii() from public, anon, authenticated;

create trigger awarie_czesci_otwarta_awaria
  before insert or update or delete on public.awarie_czesci
  for each row execute function public.pilnuj_otwartej_awarii();

create trigger awarie_zespol_otwarta_awaria
  before insert or update or delete on public.awarie_zespol
  for each row execute function public.pilnuj_otwartej_awarii();
