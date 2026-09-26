# Zdjęcia do zgłoszeń awarii — plan

**Decyzje użytkownika (2026-09-26):** zdjęcia opcjonalne, ale gdy ktoś je doda, mają działać także offline
(„mamy obsługę zgłoszeń offline, to całość aplikacji powinna to umożliwiać”); dodaje zgłaszający (przy zgłoszeniu
i na karcie swojej awarii) oraz obsługa (technik/kierownik/admin, na karcie każdej awarii); do 3 zdjęć na awarię.
Konta demo zostają.

## Założenia

- **Przechowywanie:** prywatny kubełek Supabase Storage `zdjecia-awarii`, ścieżka `<awaria_id>/<zdjecie_id>.jpg`,
  tylko JPEG, do 2 MB. Wiersz w tabeli `awarie_zdjecia` (id nadaje klient, żeby kolejka offline była idempotentna).
- **Uprawnienia (baza, nie interfejs):** odczyt i dodawanie pliku i wiersza tylko dla tego, kto widzi awarię
  (`widzi_awarie`, ta sama reguła co komentarze). Limit 3 zdjęć pilnuje trigger (wiersze) i polityka Storage
  (pliki). Autor ustawiany z `auth.uid()`. Usunąć zdjęcie może autor albo admin (tylko online).
  Dodanie i usunięcie trafia do historii awarii (typ `edycja`, `dane.akcja`).
- **Zmniejszanie w telefonie:** dłuższy bok do 1600 px, JPEG ~0,8 (zwykle 200–400 KB), orientacja z EXIF.
  Ponowne kodowanie przy okazji usuwa metadane EXIF (m.in. lokalizację GPS).
- **Offline:** nowa operacja kolejki `zdjecie` (plik jako Blob w IndexedDB, w tym samym magazynie). Kolejka idzie
  w kolejności zapisu, więc zdjęcie wysyła się po zgłoszeniu, do którego należy. Wysyłka: plik (duplikat = już jest),
  potem wiersz (duplikat = sukces). Odmowa biznesowa → „Do sprawdzenia” (i sprzątnięcie wysłanego pliku).
  Zdjęcie dodane do awarii, która sama czeka w kolejce, zawsze idzie przez kolejkę. Oczekujące zdjęcia widać na
  karcie awarii od razu (z pamięci telefonu). Zdjęcia już wysłane oglądamy online (podpisane linki, 1 h).
- **CSP:** `img-src` dopuszcza `https://*.supabase.co` (podpisane linki do Storage).

## Zadania

1. Migracja `20260926140000_zdjecia_awarii.sql`: tabela, triggery (autor, limit, historia), polityki RLS, kubełek,
   polityki `storage.objects`; testy RLS `tests/rls/zdjecia-awarii.test.ts` (widoczność wg roli, limit 3, ścieżki,
   usuwanie, anon). Regeneracja typów.
2. `src/lib/zdjecia.ts` (zmniejszanie, zapytania, dodawanie online/kolejka, usuwanie) + operacja `zdjecie`
   w `src/lib/offline.ts`; testy jednostkowe.
3. Interfejs: wybór zdjęć w formularzu zgłoszenia, sekcja „Zdjęcia” na karcie awarii (miniatury, podgląd,
   dodawanie, usuwanie), opis operacji w „Do sprawdzenia”, CSP. E2E online i offline.
4. Bramka (typecheck, unit, RLS, E2E, build, audit, przegląd kodu i bezpieczeństwa), `sprawdz-dostep.ts`
   (nowa tabela i kubełek), dokumentacja, tag `zdjecia-gotowe`; migracja na produkcję (użytkownik), push za zgodą.

## Wyniki (2026-09-26)

- Migracje `20260926140000_zdjecia_awarii.sql` i `20260926140100_zdjecia_poprawki.sql`. Przegląd znalazł dwa błędy,
  oba poprawione i pokryte testami: usunięcie awarii ze zdjęciami było blokowane (trigger historii przy kaskadzie),
  a funkcja licząca pliki ujawniała liczbę zdjęć cudzych awarii.
- Testy: 9 RLS (`tests/rls/zdjecia-awarii.test.ts`), 5 jednostkowych (`tests/unit/zdjecia.test.ts`), 2 E2E
  (`tests/e2e/zdjecia.spec.ts`: zgłoszenie ze zdjęciem online i offline z wysyłką po powrocie sieci; dodanie
  i usunięcie na karcie). `scripts/sprawdz-dostep.ts` obejmuje nową tabelę, funkcje i kubełek.
