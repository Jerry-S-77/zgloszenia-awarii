-- Powiadomienia push na telefon (Web Push). Każde urządzenie (przeglądarka) użytkownika to osobna subskrypcja
-- z własnym wyborem: tylko krytyczne (domyślnie) albo wszystkie. Nowe powiadomienie w tabeli `powiadomienia`
-- wywołuje (pg_net, asynchronicznie) serwerową trasę aplikacji `/api/push`, która wysyła push kluczami VAPID.
-- Adres trasy i wspólny sekret są w prywatnej tabeli poza API (uzupełnia je administrator po wdrożeniu);
-- bez konfiguracji nic nie jest wysyłane (np. na bazie testowej).

create extension if not exists pg_net with schema extensions;

create schema if not exists prywatne;
revoke all on schema prywatne from public, anon, authenticated;

create table prywatne.push_konfiguracja (
  id integer primary key default 1 check (id = 1),
  url text not null,
  sekret text not null check (char_length(sekret) >= 32)
);
revoke all on prywatne.push_konfiguracja from public, anon, authenticated;

create table public.push_subskrypcje (
  id uuid primary key default gen_random_uuid(),
  uzytkownik_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 10 and 100),
  tylko_krytyczne boolean not null default true,
  created_at timestamptz not null default now()
);
create index push_subskrypcje_uzytkownik_idx on public.push_subskrypcje (uzytkownik_id);

alter table public.push_subskrypcje enable row level security;
revoke all on public.push_subskrypcje from anon, authenticated;
grant select, delete on public.push_subskrypcje to authenticated;
grant update (tylko_krytyczne) on public.push_subskrypcje to authenticated;
grant all on public.push_subskrypcje to service_role;

create policy push_subskrypcje_select on public.push_subskrypcje for select to authenticated
  using (uzytkownik_id = auth.uid());
create policy push_subskrypcje_update on public.push_subskrypcje for update to authenticated
  using (uzytkownik_id = auth.uid()) with check (uzytkownik_id = auth.uid());
create policy push_subskrypcje_delete on public.push_subskrypcje for delete to authenticated
  using (uzytkownik_id = auth.uid());

-- Zapis subskrypcji tej przeglądarki dla zalogowanego (aktywnego) konta. Ten sam endpoint to ta sama
-- przeglądarka: na wspólnym telefonie po zmianie konta subskrypcja przechodzi na nowe konto, żeby push
-- poprzedniej osoby nie trafiał do następnej.
create or replace function public.push_zapisz_subskrypcje(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_tylko_krytyczne boolean default true
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.moja_rola() is null then
    raise exception 'Brak aktywnego konta';
  end if;
  delete from public.push_subskrypcje where endpoint = p_endpoint;
  insert into public.push_subskrypcje (uzytkownik_id, endpoint, p256dh, auth, tylko_krytyczne)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth, coalesce(p_tylko_krytyczne, true));
end
$$;
revoke all on function public.push_zapisz_subskrypcje(text, text, text, boolean) from public, anon;
grant execute on function public.push_zapisz_subskrypcje(text, text, text, boolean) to authenticated;

-- Po nowym powiadomieniu: jeśli adresat ma subskrypcję, która je obejmuje, zlecamy wysyłkę trasie aplikacji.
-- Błąd zlecenia nigdy nie blokuje zapisu powiadomienia (dzwonek w aplikacji działa niezależnie od push).
create or replace function public.powiadomienia_zlec_push()
returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_konf prywatne.push_konfiguracja%rowtype;
begin
  select * into v_konf from prywatne.push_konfiguracja where id = 1;
  if not found then
    return null;
  end if;
  if not exists (
    select 1 from public.push_subskrypcje s
    where s.uzytkownik_id = new.uzytkownik_id and (new.krytyczne or not s.tylko_krytyczne)
  ) then
    return null;
  end if;
  begin
    perform net.http_post(
      url := v_konf.url,
      body := jsonb_build_object('id', new.id),
      headers := jsonb_build_object('content-type', 'application/json', 'x-push-sekret', v_konf.sekret),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'Nie udało się zlecić push: %', sqlerrm;
  end;
  return null;
end
$$;
revoke all on function public.powiadomienia_zlec_push() from public, anon, authenticated;

create trigger powiadomienia_push
  after insert on public.powiadomienia
  for each row execute function public.powiadomienia_zlec_push();
