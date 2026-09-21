# Stan wyjściowy jakości (przed zmianami etapu 1)

Zmierzone na gałęzi `etap-1-uzytkownicy` po dodaniu narzędzi testowych (zadanie 1), 2026-09-21.

- `npm run lint`: 20531 problemów w całym drzewie (20525 błędów, 6 ostrzeżeń). Do porównań liczy się tylko kod repozytorium: 6498 błędów i 6 ostrzeżeń (73 pliki). Błędy to wyłącznie `prettier/prettier` (w większości `Delete ␍`, czyli końce linii CRLF w kopii roboczej przy `core.autocrlf=true`); ostrzeżenia to 6x `react-refresh/only-export-components`. Poza tym: 14015 błędów prettier w niezatwierdzonym `.agents/` (poza repozytorium) oraz 12 w nowych plikach `scripts/dev-test.ts` i `tests/wspolne/srodowisko.ts` (szerokość linii, wklejone dosłownie z planu).
- `npm run typecheck`: 7 błędów, wszystkie w `tests/wspolne/srodowisko.ts` (brak tabeli `profiles` w typach `Database`); oczekiwane do zadania 3. Poza tym plikiem: 0 błędów.
- `npm run build`: kończy się powodzeniem; 2 ostrzeżenia (limit rozmiaru chunków; opcja `inlineDynamicImports` ignorowana przy `codeSplitting`).
