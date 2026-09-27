# Magazyn części (poziom 2) i powiadomienia push — plan i wyniki

**Decyzje użytkownika (2026-09-27):** „dawaj z magazynem poziom 2 i powiadomieniami push, dokończmy to”;
magazyn prowadzą kierownik i admin (technik widzi i pobiera do awarii); katalog ręcznie i importem z pliku
z wzorcowym plikiem wielokrotnego użytku; push — każdy wybiera sam (domyślnie tylko krytyczne). Na koniec
niezależny przegląd kodu drugim modelem (Codex).

## Magazyn

- Tabele `magazyn_czesci` (stan bez uprawnienia UPDATE), `urzadzenia_czesci` (wiele do wielu, „krytyczna”),
  `magazyn_ruchy` (tylko odczyt), kolumna `awarie_czesci.magazyn_czesc_id`.
- RPC: `magazyn_przyjecie`, `magazyn_korekta` (powód wymagany), `magazyn_pobierz_do_awarii` (obsługa, otwarta
  awaria, blokada wiersza — stan nie zejdzie poniżej zera; część trafia do awarii jako dostarczona),
  `magazyn_import` (atomowy, klucz = numer katalogowy, stan początkowy tylko dla nowych, urządzenia dopisywane).
  Alarm `niski_stan` przy przejściu poniżej minimum → kierownicy i admini.
- UI: `/magazyn` (menu konta), `PobierzZMagazynu` na karcie awarii, części na karcie urządzenia, sekcja
  w Analizach. Import CSV/XLSX (`read-excel-file/browser`) z podglądem; wzór `public/wzory/wzor-importu-magazynu.csv`.

## Push

- `push_subskrypcje` (własne wiersze, zapis przez RPC `push_zapisz_subskrypcje` — ta sama przeglądarka przechodzi
  na nowe konto), trigger na `powiadomienia` → `net.http_post` do `/api/push` z sekretem z
  `prywatne.push_konfiguracja` (błąd zlecenia nie blokuje powiadomienia; bez konfiguracji nic nie wysyła).
- `/api/push`: sekret w stałym czasie, `web-push` z kluczami VAPID, wygasłe subskrypcje (404/410) usuwane,
  link w wiadomości tylko wewnętrzny. `public/sw.js`: tylko push i kliknięcie (bez cache).
- Wylogowanie wyłącza push na tym telefonie (wspólne telefony).

## Wyniki

- Migracje `20260928100000_magazyn.sql`, `20260928110000_web_push.sql`, `20260928110100_magazyn_liczby.sql`.
- Testy: RLS `magazyn.test.ts` (9), `push.test.ts` (5); jednostkowe `magazyn-import.test.ts` (5),
  `push.test.ts` (5); E2E `magazyn.spec.ts` (4). Pełna bramka: unit 137, RLS 141, E2E 32, build, audit 0.
- Push nie jest testowany end-to-end na bazie testowej (brak konfiguracji wysyłki) — sprawdzenie na telefonie po
  wdrożeniu.
