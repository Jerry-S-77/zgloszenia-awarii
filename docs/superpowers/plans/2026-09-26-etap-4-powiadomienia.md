# Etap 4: powiadomienia w aplikacji i reguły — plan

**Spec:** `docs/superpowers/specs/2026-09-21-rozbudowa-obsluga-awarii-design.md`, sekcja 8. Plan nadrzędny:
`docs/superpowers/plans/2026-09-21-plan-nadrzedny-etapy.md`. Uzupełnienie po etapie 3b: „przydzielenie
awarii” = ktoś inny dodał mnie do zespołu awarii.

**Cel:** dzwonek w nagłówku z licznikiem nieprzeczytanych (na żywo, Supabase Realtime), lista powiadomień
z wyróżnieniem krytycznych i nieprzeczytanych, powiadomienia tworzone w bazie (triggery) oraz codzienne
przypomnienia o przeglądach (pg_cron). Web Push to etap 5.

## Reguły (kto dostaje, spec 8 + 3b)

| Zdarzenie | Odbiorcy | Uwagi |
|---|---|---|
| Nowa awaria | aktywni technicy i kierownicy + właściciel urządzenia | „Wysoka” = krytyczne; bez autora zgłoszenia |
| Dodanie do zespołu przez inną osobę | dodana osoba | samodzielne dołączenie nie powiadamia |
| Zmiana statusu na przyjętą lub zamkniętą | zgłaszający | bez osoby, która zmieniła status |
| Propozycja przyspieszenia przeglądu | właściciel urządzenia + kierownicy | |
| Przegląd za ≤ 14 dni i przegląd opóźniony (codziennie) | właściciel urządzenia + kierownicy | jedno powiadomienie danego typu na przegląd i termin |

Adresat musi mieć aktywne konto bez wymuszonej zmiany hasła. Idempotencja: kolumna `klucz` unikalna
per użytkownik (np. `przeglad_opozniony:<id>:<termin>`).

## Zadania

1. **Baza** (`20260926120000_etap4_powiadomienia.sql`): enum `typ_powiadomienia`, tabela `powiadomienia`
   (odbiorca, typ, treść, link, krytyczne, przeczytane, klucz, awaria/przegląd z kaskadą, data). RLS: odczyt
   tylko własnych; zmiana tylko `przeczytane` (grant kolumnowy) i tylko własnych; brak INSERT/DELETE dla
   `authenticated`. Funkcje wewnętrzne `powiadom(...)`, triggery na `awarie`, `awarie_zespol`,
   `przeglady_propozycje`; funkcja `powiadomienia_przegladow()` + `pg_cron` codziennie o 04:00 UTC; tabela
   w publikacji `supabase_realtime`. Testy: `tests/rls/powiadomienia.test.ts`.
2. **Kod:** `src/lib/powiadomienia.ts` (zapytania, oznaczanie, subskrypcja Realtime, czysty opis czasu
   „5 min temu” z testem jednostkowym), `Dzwonek` w nagłówku, ekran `/powiadomienia` (Oznacz wszystkie,
   krytyczne na czerwono, nieprzeczytane na pomarańczowo, dotknięcie → karta awarii/przeglądu i oznaczenie
   jako przeczytane). Tylko online (licznik zostaje z ostatniego pobrania).
3. **E2E:** pracownik zgłasza awarię „Wysoka” → technik widzi licznik i krytyczne powiadomienie, przechodzi do
   karty, licznik spada.
4. **Bramka i wdrożenie:** typecheck, unit, RLS, E2E, build, przegląd kodu; dokumentacja; migracja na
   produkcji przed pushem (razem z poprawką formularza `8d79bc4`).
