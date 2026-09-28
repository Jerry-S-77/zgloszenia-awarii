-- Trzecia weryfikacja (Codex, 2026-09-28): zapis subskrypcji nie może przejmować cudzego rekordu po samym
-- adresie (endpoint). Przejęcie rekordu innego konta wymaga tych samych kluczy szyfrujących (p256dh, auth),
-- które generuje i zna tylko przeglądarka, w której subskrypcja powstała — tak jest przy zmianie konta
-- na wspólnym telefonie. Obcy, który zna sam adres, dostaje odmowę i nie wyłączy cudzych powiadomień.
create or replace function public.push_zapisz_subskrypcje(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_tylko_krytyczne boolean default true
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_istniejaca public.push_subskrypcje%rowtype;
  v_token uuid;
begin
  if public.moja_rola() is null then
    raise exception 'Brak aktywnego konta';
  end if;
  select * into v_istniejaca from public.push_subskrypcje where endpoint = p_endpoint for update;
  if found and v_istniejaca.uzytkownik_id <> auth.uid()
     and (v_istniejaca.p256dh <> p_p256dh or v_istniejaca.auth <> p_auth) then
    raise exception 'Ta subskrypcja należy do innego urządzenia';
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
