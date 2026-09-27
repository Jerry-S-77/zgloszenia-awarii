# Karta urządzenia, MTBF/MTTR, kategorie przyczyn (Pareto) — plan

**Decyzja użytkownika (2026-09-27):** z listy propozycji po przeglądzie rynku CMMS zrobić punkty 2, 3 i 4: kartę
urządzenia z historią, wskaźniki MTBF/MTTR w Analizach i słownik kategorii przyczyn z analizą Pareto. Kody QR,
pakiet GMP, logowanie Microsoft (Entra ID) i części zamienne — później, osobno.

## Założenia

- **Kategoria przyczyny** (`awarie.kategoria_przyczyny`, enum): mechaniczna, elektryczna, automatyka (sterowanie,
  czujniki, oprogramowanie), media (sprężone powietrze, woda, para, HVAC), obsługa (błąd obsługi, ustawienia), inna.
  Wymagana przy każdym zamknięciu (trigger przejść statusu, tak jak przyczyna i czas przestoju); nowa awaria nie może
  jej mieć (polityka INSERT). Zamkniętym awariom bez kategorii (dane historyczne, import) obsługa może ją uzupełnić
  na karcie awarii. Przechodzi przez kolejkę offline jak reszta pól zamknięcia. Eksport CSV dostaje kolumnę na końcu.
- **Wskaźniki (liczone w aplikacji z listy awarii, więc działają też offline z pamięci):** w wybranym okresie
  (90 / 365 dni) — MTTR = średni czas przestoju zamkniętych awarii (h); MTBF urządzenia = (czas okresu − przestój)
  / liczba awarii (czas kalendarzowy 24/7, bez planu zmian). Czysta funkcja w `src/lib/wskazniki.ts` z testami.
- **Pareto:** kategorie posortowane malejąco wg liczby awarii albo godzin przestoju (przełącznik), słupki poziome
  z udziałem i sumą narastającą w podpisie (bez drugiej osi), „Nie określono” na końcu.
- **Karta urządzenia** `/urzadzenia/$nr` (technik, kierownik, admin): dane urządzenia, wskaźniki (liczba awarii,
  przestój, MTBF, MTTR), kategorie przyczyn tego urządzenia, lista awarii (link do karty), przeglądy (link do karty
  przeglądu, online). Linki: z karty awarii, z kart progów w Analizach i z karty przeglądu.

## Zadania

1. Migracja `20260927100000_kategoria_przyczyny.sql` + testy RLS (zamknięcie bez kategorii odrzucone, insert
   z kategorią odrzucony, uzupełnienie po zamknięciu); typy.
2. `src/lib/wskazniki.ts` (MTBF, MTTR, Pareto) + `src/lib/kategorie-przyczyn.ts` (etykiety); testy jednostkowe.
3. Zamknięcie awarii z wyborem kategorii, uzupełnianie kategorii na karcie, eksport CSV.
4. Analizy: sekcja „Niezawodność” (MTBF/MTTR per urządzenie) i „Przyczyny (Pareto)”.
5. Karta urządzenia + linki. E2E. Bramka, dokumentacja, migracja na produkcję (użytkownik), push za zgodą.

## Wyniki (2026-09-27)

- Migracja `20260927100000_kategoria_przyczyny.sql` (enum, kolumna, polityka INSERT, trigger przejść z wymogiem
  kategorii). Operacja zamknięcia zapisana offline przed wdrożeniem (bez kategorii) trafi do „Do sprawdzenia”.
- Testy: 5 RLS (`tests/rls/kategoria-przyczyny.test.ts`, macierz uzupełniona o kategorię), 7 jednostkowych
  (`tests/unit/wskazniki.test.ts`), 2 E2E (`tests/e2e/analizy-urzadzen.spec.ts`); zamknięcie w
  `obsluga-awarii.spec.ts` wybiera kategorię; audyt 44 px obejmuje kartę urządzenia.
