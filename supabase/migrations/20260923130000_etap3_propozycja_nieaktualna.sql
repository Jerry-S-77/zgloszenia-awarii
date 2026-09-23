-- Etap 3, poprawka po przeglądzie: propozycja zamknięta przez wykonanie przeglądu (nie jest decyzją kierownika).
-- Nowa wartość enuma musi zostać zatwierdzona przed użyciem, dlatego osobna migracja.
alter type public.status_propozycji add value if not exists 'nieaktualna';
