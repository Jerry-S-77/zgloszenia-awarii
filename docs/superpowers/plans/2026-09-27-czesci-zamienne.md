# Części zamienne przy awarii (poziom 1) — plan i wyniki

**Decyzja użytkownika (2026-09-27):** „działaj, najwyżej poprawimy” po omówieniu dwóch poziomów; zgodnie
z rekomendacją poziom 1 (części przy awarii, bez magazynu). Poziom 2 (katalog części przypięty do urządzeń,
stany magazynowe, alarm niskiego stanu) — osobno, jeśli poziom 1 się sprawdzi.

## Założenia

- Tabela `awarie_czesci` (nazwa/numer, ilość 1–9999, status `potrzebna|zamowiona|dostarczona`, przewidywana
  dostawa, autor z konta). Zmiany tylko obsługa i tylko przy niezamkniętej awarii (`awaria_otwarta`);
  pracownik widzi części swojej awarii (`widzi_awarie`). Nie da się przenieść części do innej awarii.
- Historia awarii: `edycja` z `dane.akcja` = `czesc_dodana|czesc_status|czesc_usunieta` (przy kaskadowym
  usunięciu awarii bez wpisu). Dostarczenie → powiadomienie `czesc_dostarczona` dla zespołu awarii (bez autora).
- Powiązanie z urządzeniem przez awarię: karta urządzenia pokazuje zużyte (dostarczone) części zsumowane po
  nazwie; formularz podpowiada nazwy użyte wcześniej przy tym urządzeniu.
- „Czekają na części” (Zadania i Analizy): awarie w statusie `oczekuje_na_czesc` z niedostarczonymi częściami
  i czasem oczekiwania.
- Tylko online (jak zespół i komentarze); baner offline to mówi.

## Wyniki

- Migracja `20260927120000_czesci_zamienne.sql`.
- Testy: 6 RLS (`tests/rls/czesci-zamienne.test.ts`), 5 jednostkowych (`tests/unit/czesci-logika.test.ts`),
  2 E2E (`tests/e2e/czesci.spec.ts`). `scripts/sprawdz-dostep.ts` obejmuje nową tabelę.
