-- Etap 1: pinuje dotychczasowe wartości statusu awarii (maszyna stanów dochodzi w etapie 2).
alter table public.awarie
  add constraint awarie_status_check check (status in ('Otwarta', 'Zamknieta'));
