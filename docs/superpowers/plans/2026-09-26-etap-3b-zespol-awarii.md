# Etap 3b: zespół przy awarii i informacja o trybie offline — plan

**Cel:** (1) do jednej awarii może dołączyć kilka osób obsługi — jeden wspólny zespół techników, kilku
kierowników (brygadziści na zmianach) i kilku adminów; zastępuje pojedyncze pole `awarie.przypisany_technik_id`.
(2) Wyraźna informacja o braku połączenia: co da się zrobić offline, a co wymaga internetu.

**Decyzje użytkownika (2026-09-26):** kilka osób na awarię; technik dołącza/opuszcza tylko siebie, kierownik
i admin mogą dodać lub usunąć dowolną osobę obsługi; zmiany zespołu tylko online (jak komentarze); bez grup
(działów, hal, zmian); baner „Brak połączenia” z listą „Możesz / Poczeka na internet”, a przyciski wymagające
internetu wyszarzone z wyjaśnieniem.

## Zadania

1. **Baza** — `supabase/migrations/20260926100000_etap3b_zespol_awarii.sql`: tabela `awarie_zespol`
   (awaria, osoba, nazwisko kopiowane triggerem, kto dodał, kiedy; klucz awaria+osoba). RLS: odczyt jak
   awaria (`widzi_awarie`); dodanie — technik tylko siebie, kierownik/admin dowolną aktywną osobę obsługi
   (`osoba_obslugi`), tylko do niezamkniętej awarii (`awaria_otwarta`); usunięcie — siebie albo
   (kierownik/admin) każdego, tylko z niezamkniętej. Historia: trigger dopisuje `przypisanie` z `akcja`
   dolaczenie/odejscie i nazwiskiem. Przeniesienie istniejących przypisań i usunięcie kolumny
   `przypisany_technik_id` (poprawione: trigger historii awarii, polityka wstawiania). RPC `osoby_obslugi()`
   (tylko kierownik/admin). Testy: `tests/rls/zespol-awarii.test.ts`.
2. **Kod zespołu** — `src/lib/zespol.ts`, `src/components/awaria/Zespol.tsx` (lista, Dołącz / Opuść,
   dla kierownika/admina dodawanie i usuwanie), „Zadania → Przypisane do mnie” z zespołu
   (`mojeZespolyQuery`), historia z nazwiskami, usunięcie pola z typów, formularza i testów.
3. **Offline** — `src/hooks/use-online.ts`, `src/lib/offline-mozliwosci.ts` (czysta lista zależna od roli,
   test jednostkowy), `src/components/BanerOffline.tsx` w `AppShell`; wyszarzone przyciski: komentarze,
   zespół, przeglądy (wykonanie, harmonogram, decyzje), urządzenia, konta.
4. **E2E** — dwóch techników w zespole jednej awarii; kierownik dodaje i usuwa osobę; baner offline.
5. **Bramka i wdrożenie** — typecheck, unit, RLS, E2E, build, przegląd kodu; dokumentacja; migracja na
   produkcji przed pushem.
