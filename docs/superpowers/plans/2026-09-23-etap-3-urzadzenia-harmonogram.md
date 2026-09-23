# Etap 3: urządzenia i harmonogram przeglądów — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, wybrane przez użytkownika ze względu na limit) lub superpowers:subagent-driven-development. Kroki w formacie checkbox (`- [ ]`).

**Goal:** Rejestr urządzeń i harmonogram przeglądów żyją w aplikacji (zamiast arkuszy xlsx i n8n): admin prowadzi urządzenia, technik odnotowuje wykonanie przeglądu, kierownik zmienia terminy i decyduje o proponowanym przyspieszeniu, a dane z trzech arkuszy importuje jednorazowy skrypt.

**Architecture:** Kontynuacja hybrydy z etapów 1–2. Reguły (daty po wykonaniu, tworzenie przeglądu przy aktywacji urządzenia, propozycje przyspieszenia, progi) żyją w bazie jako triggery i funkcje SQL; decyzja o propozycji to jedna funkcja RPC (atomowo: propozycja + termin). Interfejs ma czystą kopię obliczeń (status przeglądu, następny termin) tylko do wyświetlania. Przeglądy i urządzenia działają wyłącznie online (jak komentarze w etapie 2) — kolejka offline dotyczy nadal tylko awarii.

**Tech Stack:** TanStack Start + React 19, Supabase (Postgres, RLS, triggery, RPC), Zod 3, Vitest (unit + RLS), Playwright (E2E, Pixel 7), `read-excel-file` (devDependency, tylko skrypt importu).

**Spec:** `docs/superpowers/specs/2026-09-21-rozbudowa-obsluga-awarii-design.md` (sekcja 7, przekrojowo 4, 5, 10). Plan nadrzędny: `docs/superpowers/plans/2026-09-21-plan-nadrzedny-etapy.md` (bramka jakości sekcja 3).

## Global Constraints

- Statusy urządzenia w bazie: `proponowane | aktywne | wycofane`. Tylko `aktywne` trafia do formularza zgłoszenia. Pracownik czyta tylko aktywne; technik/kierownik/admin czytają wszystkie. Zapis urządzeń: tylko admin. `nr_technologiczny` jest niezmienny po utworzeniu (brak grantu UPDATE na tej kolumnie).
- `urzadzenia.wlasciciel` → `wlasciciel_nazwa` (tekst, jak `zglaszajacy_nazwa`) + `wlasciciel_id` (→ `profiles`). Trigger wpisuje nazwisko z `profiles`, gdy ustawiono `wlasciciel_id` (kierownik nie czyta `profiles`).
- Status przeglądu jest **wyliczany** (nigdy zapisywany): brak `data_najblizszego` → Do uzupełnienia; `< dziś` → Opóźniony; `≤ 14 dni` → Wkrótce; inaczej Zaplanowany. „Dziś" = data w strefie `Europe/Warsaw` (SQL: `public.dzis_pl()`; klient: data lokalna).
- Odnotowanie wykonania = INSERT do `przeglady_wykonania` (technik+). Trigger: autor z `auth.uid()`, data z przyszłości odrzucona, `data_ostatniego` = data wykonania (nie cofa się przy starszym wpisie), `data_najblizszego` = data + `czestotliwosc_dni` (gdy częstotliwość znana).
- Aktywacja urządzenia (INSERT jako aktywne albo zmiana statusu na aktywne) tworzy pusty przegląd („Do uzupełnienia"), jeśli urządzenie nie ma żadnego.
- Progi (te same co w n8n): ≥3 awarie w 90 dni, ≥2 „Wysoka" w 60 dni, ≥8 h przestoju w 30 dni — tylko awarie z `data_awarii <= now()`. Jedno źródło: `public.statystyki_progow_urzadzen()` (dashboard) i `public.urzadzenia_przekraczajace_progi()` (trigger, etap 4).
- Propozycja przyspieszenia: tworzy ją trigger na `awarie` (INSERT, zmiana krytyczności/przestoju/daty). Najwyżej jedna `oczekuje` na przegląd; kolejna dopiero po decyzji i po nowej awarii urządzenia (`awarie.created_at > decyzja_at`). Termin = dziś + 7, tylko gdy wcześniejszy niż `data_najblizszego`; inaczej NULL („wykonaj pilnie"). Decyzja: RPC `przeglady_decyzja(p_propozycja_id, p_zatwierdz)` — kierownik/admin.
- `awarie_nadaj_numer`: zapis service-role z podanym numerem `AWR-RRRR-NNN` zachowuje numer i podnosi licznik roku do maksimum (import). Klient nigdy nie ustawia numeru.
- Webhook `/api/public/sync-urzadzenia` i `SYNC_URZADZENIA_SECRET` usunięte.
- Nawigacja: Zgłoś na indeksie `ceil(n/2)`: pracownik Moje, Zgłoś; technik Zadania, Awarie, Zgłoś, Przeglądy; kierownik Analizy, Awarie, Zgłoś, Przeglądy; admin Zadania, Awarie, Zgłoś, Przeglądy, Admin. Analizy i Eksport dla kierownika/admina także w menu konta. Pozycja „Admin" aktywna dla całego `/admin/*`.
- Import: `scripts/importuj-arkusze.ts`, domyślnie próba (nic nie zapisuje), `--tak` zapisuje, `--test` bierze `.env.test`. Kolumny e-mail z arkuszy pomijane. Istniejący numer awarii → pominięty i zgłoszony w raporcie. Na produkcję uruchamiany dopiero za zgodą użytkownika (na produkcji istnieje testowa `AWR-2026-001`).
- Migracje stosuje użytkownik (`npx supabase db push --db-url <Session pooler>`), najpierw na projekcie TESTOWYM; produkcja dopiero przy zamknięciu etapu, PRZED pushem kodu (Vercel wdraża `master` automatycznie).
- Commity z trailerem `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push tylko za zgodą. `tsconfig`: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.

## File Structure

Tworzone:
- `supabase/migrations/20260923100000_etap3_urzadzenia.sql`, `…110000_etap3_przeglady.sql`, `…120000_etap3_progi_propozycje.sql`
- `tests/rls/urzadzenia-przeglady.test.ts`
- `src/lib/przeglady.ts`, `src/lib/urzadzenia.ts`, `src/lib/przeglady-zapytania.ts`, `src/lib/urzadzenia-zapytania.ts`
- `tests/unit/przeglady.test.ts`, `tests/unit/urzadzenia.test.ts`, `tests/unit/import-mapowanie.test.ts`
- `src/routes/przeglady.index.tsx`, `src/routes/przeglady.$id.tsx`, `src/routes/admin.urzadzenia.tsx`
- `src/components/przeglady/*` (karta listy, arkusz wykonania, arkusz harmonogramu, baner propozycji), `src/components/admin/ZakladkiAdmina.tsx`, `src/components/admin/UrzadzenieSheet.tsx`
- `scripts/import/mapowanie.ts`, `scripts/importuj-arkusze.ts`
- `tests/e2e/przeglady.spec.ts`

Zmieniane: `src/lib/types.ts`, `src/lib/queries.ts`, `src/lib/uprawnienia.ts`, `src/components/AppShell.tsx`, `src/components/MenuUzytkownika.tsx`, `src/routes/dashboard.tsx`, `src/routes/eksport.tsx`, `src/routes/zadania.tsx`, `src/routes/admin.uzytkownicy.tsx`, `src/integrations/supabase/types.ts`, `tests/unit/uprawnienia.test.ts`, `tests/e2e/*.spec.ts` (status urządzenia), `.env.example`, `README.md`, `roadmap.md`, `CLAUDE.md`, `package.json`. Usuwane: `src/routes/api/public/sync-urzadzenia.ts`.

---

### Task 1: Migracje bazy + testy RLS

**Files:** 3 migracje (pełna treść w repo po wykonaniu), `tests/rls/urzadzenia-przeglady.test.ts`, regeneracja `src/integrations/supabase/types.ts`.

**Produces (SQL):** enum `status_urzadzenia`; kolumny `urzadzenia.status`, `wlasciciel_id`, `wlasciciel_nazwa`, `uwagi`; tabele `przeglady`, `przeglady_wykonania`, `przeglady_propozycje` (enum `status_propozycji`); funkcje `dzis_pl()`, `statystyki_progow_urzadzen()`, `urzadzenia_przekraczajace_progi()`, `przeglady_decyzja(uuid, boolean)`; triggery: nazwisko właściciela, przegląd przy aktywacji, daty po wykonaniu, propozycje po awarii, numer z importu.

- [ ] Gałąź `etap-3-urzadzenia-harmonogram`.
- [ ] Napisać test RLS (przypadki niżej), migracje, poprosić użytkownika o `db push` na projekt TESTOWY, zregenerować typy, `npm run test:rls` zielone.

Przypadki testu RLS (każdy to `it`):
1. Pracownik nie widzi urządzenia `proponowane`, technik widzi.
2. Admin dodaje urządzenie; technik i kierownik nie mogą (błąd).
3. Admin nie może zmienić `nr_technologiczny` (błąd uprawnień kolumny).
4. Ustawienie `wlasciciel_id` wpisuje `wlasciciel_nazwa` z profilu.
5. Aktywacja urządzenia tworzy dokładnie jeden pusty przegląd; ponowna aktywacja (wycofane → aktywne) nie dubluje.
6. Pracownik nie czyta przeglądów; technik czyta.
7. Technik nie zmienia przeglądu (0 wierszy); kierownik zmienia częstotliwość.
8. Technik odnotowuje wykonanie → `data_ostatniego` = data, `data_najblizszego` = data + częstotliwość, `autor_id` = technik mimo innej wartości od klienta.
9. Wykonanie z datą w przyszłości odrzucone; starsze wykonanie nie cofa `data_ostatniego`; pracownik nie może odnotować.
10. 3 awarie w 90 dni → jedna propozycja `oczekuje` z terminem dziś+7 (gdy przegląd za >7 dni); 4. awaria nie tworzy drugiej.
11. Przegląd opóźniony → propozycja bez terminu.
12. Technik nie może wywołać `przeglady_decyzja`; kierownik zatwierdza → termin przeglądu = proponowany, status `zatwierdzona`, `decyzja_id` = kierownik.
13. Po decyzji bez nowej awarii — brak nowej propozycji; nowa awaria → nowa propozycja.
14. `statystyki_progow_urzadzen()` dla kierownika zwraca urządzenie z `przekracza = true`.
15. Service-role z numerem `AWR-<rok losowy>-050` zachowuje numer, następna awaria tego roku dostaje `051`; pracownik podający numer dostaje numer nadany przez bazę.
16. Anon nie czyta `przeglady`, `przeglady_wykonania`, `przeglady_propozycje`.

### Task 2: Logika czysta + nawigacja (unit)

- `src/lib/przeglady.ts`: `PROG_WKROTCE_DNI = 14`, `dzisLokalnie()`, `dodajDni(data, dni)`, `roznicaDni(od, do)`, `statusPrzegladu(p, dzis)`, `nastepnyTermin(dataWykonania, czestotliwosc)`, `sortujPoPilnosci(lista)`, `filtrujPrzeglady(lista, filtr, dzis)`, `opisTerminu(dni)` („−22 dni", „dziś", „za 1 dzień", „za 6 dni"), `formatujDate('2026-09-04') → '04.09.2026'`, etykiety statusów.
- `src/lib/urzadzenia.ts`: `STATUSY_URZADZEN`, etykiety, `akcjeStatusu(status)` (proponowane → Aktywuj/Wycofaj; aktywne → Wycofaj; wycofane → Przywróć), `KRYTYCZNOSCI`, `urzadzenieSchema` (Zod).
- `src/lib/uprawnienia.ts`: `Sciezka` + `/przeglady`, `/admin/urzadzenia`; ikona `przeglady`; nowe menu wg Global Constraints; `ceil`; `czyAktywna(pathname, pozycja)` (prefiks `/admin` dla Admin).
- Testy: `tests/unit/przeglady.test.ts`, `tests/unit/urzadzenia.test.ts`, zaktualizowany `tests/unit/uprawnienia.test.ts`. `npm test` zielone.

### Task 3: Dostosowanie istniejącego kodu do nowego schematu

- `Urzadzenie` = typ wiersza z bazy; `urzadzeniaQuery` filtruje `status = 'aktywne'`.
- Usunięcie webhooka i `SYNC_URZADZENIA_SECRET` (`.env.example`), regeneracja `routeTree.gen.ts`.
- `eksport.tsx`: `ID_zgloszenia` = `numer`, tekst bez odwołań do arkusza Google.
- `dashboard.tsx`: sekcja progów z RPC `statystyki_progow_urzadzen` (online), przycisk „Eksport CSV".
- `MenuUzytkownika.tsx`: Analizy i Eksport dla kierownika/admina.
- E2E fixtures: `status: "aktywne"` zamiast `status_w_rejestrze`.
- `npm run typecheck`, `npm test` zielone.

### Task 4: Ekran „Przeglądy" + nawigacja + Zadania

- `przeglady-zapytania.ts`: `przegladyQuery` (przeglądy z urządzeniem i propozycjami, online), `wykonaniaQuery(id)`, `odnotujWykonanie`, `zapiszHarmonogram`, `zdecydujPropozycje` (RPC).
- `/przeglady`: chipy Wszystkie / Opóźnione N / 30 dni / Do uzupełnienia N, karty z paskiem koloru, licznikiem dni (etykieta, nie tylko kolor) i znacznikiem „Zalecane przyspieszenie".
- `/przeglady/$id`: dane, baner propozycji (kierownik/admin: Zatwierdź / Odrzuć), historia wykonań, „Odnotuj wykonanie" (technik+, arkusz od dołu z podglądem następnego terminu), „Edytuj harmonogram" (kierownik/admin).
- AppShell: ikona Przeglądy, aktywność pozycji przez `czyAktywna`.
- `/zadania`: sekcja „Przeglądy w najbliższym terminie" (opóźnione i wkrótce).

### Task 5: Admin → Urządzenia

- `ZakladkiAdmina` (Użytkownicy | Urządzenia) w obu ekranach admina.
- `/admin/urzadzenia`: lista ze statusem i właścicielem, „Dodaj", edycja w arkuszu (nazwa, kategoria, lokalizacja, krytyczność, właściciel z listy aktywnych kont, uwagi), akcje statusu.

### Task 6: Import arkuszy xlsx

- `npm i -D read-excel-file`.
- `scripts/import/mapowanie.ts` (czyste): `dataZExcela` (liczba seryjna / Date / tekst → `YYYY-MM-DD`), `normalizujNazwisko` (bez diakrytyków, ł→l), `dopasujKonto` (jednoznaczne dopasowanie), `wierszeNaObiekty`, `mapujUrzadzenie`, `mapujPrzeglad`, `mapujAwarie` (status Zamknieta/Otwarta → zamknieta/zgloszona, data jako `YYYY-MM-DDT12:00:00Z`).
- `scripts/importuj-arkusze.ts`: urządzenia (upsert po numerze) → przeglądy (wypełnia pusty przegląd urządzenia albo dopasowany po typie, inaczej wstawia) → awarie (pomija istniejące numery). Raport: dodane/zaktualizowane/pominięte, niedopasowane nazwiska.
- Test `tests/unit/import-mapowanie.test.ts` (m.in. 46208 → 2026-07-05, 46269 → 2026-09-04).
- Uruchomienie na projekcie TESTOWYM: próba, potem `--tak`.

### Task 7: E2E przeglądów

`tests/e2e/przeglady.spec.ts`: (1) kierownik zatwierdza propozycję i widzi nowy termin; (2) technik odnotowuje wykonanie, widzi następny termin i wpis w historii; (3) admin dodaje urządzenie, aktywuje je, a w Przeglądach pojawia się „Do uzupełnienia".

### Task 8: Bramka jakości i zamknięcie

Lint (bez nowych błędów), typecheck, unit, RLS, E2E, build, audit, `/code-review`, ręczna ścieżka na telefonie, aktualizacja `CLAUDE.md`, `README.md`, `roadmap.md`, planu nadrzędnego; commit zamykający z wynikami, tag `etap-3-gotowy`, scalenie do `main`. Wdrożenie: użytkownik stosuje migracje na produkcji → (za zgodą) push → Vercel.
