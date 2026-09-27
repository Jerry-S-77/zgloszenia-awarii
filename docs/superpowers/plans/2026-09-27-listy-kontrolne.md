# Listy kontrolne przeglądów — plan i wyniki

**Decyzja użytkownika (2026-09-27):** „dołóż listy kontrolne” (punkt 6 z przeglądu rynku CMMS).

## Założenia

- Harmonogram (`przeglady.lista_kontrolna`, `text[]`, do 30 punktów po 1–200 znaków) edytuje kierownik lub admin
  w „Edytuj harmonogram” (dodawanie, kolejność, usuwanie).
- Wykonanie (`przeglady_wykonania.lista_kontrolna`, `jsonb`) zapisuje wynik każdego punktu: `ok`, `nok`
  (nieprawidłowość, opis wymagany, do 500 znaków), `nd` (nie dotyczy). Trigger `przeglady_wykonania_przed`
  sprawdza komplet i zgodność treści z aktualną listą (zmieniona w międzyczasie lista → odrzucenie z prośbą
  o odświeżenie) i przebudowuje wynik z dozwolonych pól. Przegląd bez listy zapisuje pustą listę.
- Wyniki są kopią treści punktów, więc zmiana listy nie zmienia historii.
- Nieprawidłowość → powiadomienie krytyczne (`przeglad_nieprawidlowosc`) dla kierowników i właściciela urządzenia
  z obsługi (`odbiorcy_przegladu`), bez autora wykonania; idempotentne (klucz `nok:<id wykonania>`).
- Przeglądy pozostają tylko online (bez kolejki offline), jak dotąd.

## Wyniki

- Migracje `20260927110000_listy_kontrolne.sql`, `20260927110100_listy_kontrolne_odmiana.sql` (odmiana
  „nieprawidłowość/nieprawidłowości” w treści powiadomienia).
- Testy: 7 RLS (`tests/rls/listy-kontrolne.test.ts`), 3 jednostkowe (`tests/unit/lista-kontrolna.test.ts`),
  3 E2E (`tests/e2e/listy-kontrolne.spec.ts`: kierownik układa listę, technik ocenia punkty z nieprawidłowością,
  kierownik dostaje powiadomienie).
