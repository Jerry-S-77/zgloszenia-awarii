-- Etap 3b: nazwisko w zespole zawsze wpisuje trigger (awarie_zespol_przed); klient nie ma do tej kolumny
-- uprawnienia INSERT. Wartość domyślna pozwala wstawiać wiersz bez niej (i daje poprawne typy klienta).
alter table public.awarie_zespol alter column nazwa set default '';
