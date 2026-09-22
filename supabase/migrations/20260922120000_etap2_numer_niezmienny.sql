-- Etap 2: numer jest niezmienny po nadaniu (jak zglaszajacy_id/zglaszajacy_nazwa od etapu 1) —
-- chroni sekwencję numeracji przed przypadkową lub złośliwą zmianą przez klienta. Nadaje go
-- wyłącznie trigger awarie_nadaj_numer przy wstawieniu (etap 2, poprzednia migracja); ta migracja
-- pilnuje, żeby nikt nie mógł go potem zmienić przez UPDATE — celowo bez wyjątku dla klucza
-- service-role (w przeciwieństwie do innych trigerów tej fazy): nie ma dziś uzasadnionego powodu,
-- żeby ktokolwiek zmieniał numer po jego nadaniu.
create or replace function public.awarie_pilnuj_numeru()
returns trigger
language plpgsql as $$
begin
  new.numer := old.numer;
  return new;
end
$$;

create trigger awarie_numer_niezmienny
  before update on public.awarie
  for each row execute function public.awarie_pilnuj_numeru();
