# Zgłaszanie awarii

Mobilna aplikacja webowa (mobile-first, responsywna) do zgłaszania, śledzenia, ewidencji i analizy awarii urządzeń technicznych w zakładzie farmaceutycznym.

Supabase jest głównym źródłem prawdy (wspólnym dla całego zespołu). W trybie offline zgłoszenie zapisuje się lokalnie (IndexedDB) w kolejce do synchronizacji i wysyła się automatycznie do Supabase po odzyskaniu połączenia; status jest widoczny dla użytkownika ("zapisano lokalnie, oczekuje na synchronizację" / "zsynchronizowano").

## Tabele Supabase

1. **profiles** — konta użytkowników: `id` (uuid, = `auth.users.id`), `email`, `imie_nazwisko`, `rola` (`pracownik` / `technik` / `kierownik` / `admin`), `status` (`aktywny` / `zablokowany`), `must_change_password`, `created_at`.
2. **urzadzenia** — `nr_technologiczny` (text, klucz), `nazwa_urzadzenia`, `kategoria`, `lokalizacja`, `krytycznosc`, `wlasciciel`, `status_w_rejestrze` (tylko `Aktywne` trafia do dropdownu zgłoszenia).
3. **awarie** — `id` (uuid), `nr_technologiczny` (FK), `nazwa_urzadzenia`, `data_awarii`, `opis_awarii`, `przyczyna`, `czas_przestoju_h`, `krytycznosc_skutku` (Niska/Srednia/Wysoka), `zglaszajacy_id` (FK do profiles), `zglaszajacy_nazwa` (kopia imienia i nazwiska autora), `status` (Otwarta/Zamknieta), `data_zamkniecia`. Autora (`zglaszajacy_id`, `zglaszajacy_nazwa`) ustawia trigger w bazie z konta zalogowanego użytkownika; wartość wysłana przez klienta jest ignorowana, a przy edycji autor się nie zmienia.

Schemat: `supabase/migrations/`. Dostęp do wszystkich tabel ma tylko zalogowany, aktywny użytkownik (rola `anon` nie ma uprawnień); zasady opisuje sekcja „Role i uprawnienia”.

## Ekrany

Wszystkie ekrany poza logowaniem wymagają zalogowania. Dolny pasek nawigacji zależy od roli, a przycisk „Zgłoś” jest zawsze na środku.

1. **Logowanie** (`/logowanie`) — e-mail i hasło. Nie ma rejestracji ani przypominania hasła: konta zakłada administrator.
2. **Zmiana hasła** (`/zmiana-hasla`) — konto z hasłem tymczasowym (nowe albo po resecie) musi ustawić własne hasło (min. 12 znaków, inne niż tymczasowe), zanim zobaczy jakiekolwiek dane.
3. **Zgłoszenie awarii** (`/`) — wybór urządzenia z listy (autouzupełnienie kategorii/krytyczności), data/godzina (domyślnie teraz), opis, krytyczność skutku. Osoba zgłaszająca to zalogowane konto. Status ustawiany automatycznie na „Otwarta”.
4. **Lista awarii** (`/awarie`) — filtrowanie po urządzeniu, statusie, krytyczności, zakresie dat. Pracownik widzi tylko swoje zgłoszenia („Moje awarie”).
5. **Zamknięcie awarii** (`/awarie/$id`) — uzupełnienie przyczyny, czasu przestoju, zmiana statusu na „Zamknieta” (technik, kierownik, admin).
6. **Użytkownicy** (`/admin/uzytkownicy`, tylko admin) — lista kont, „Nowe konto” z hasłem tymczasowym pokazanym raz, reset hasła (nowe hasło tymczasowe, także pokazane raz), zmiana roli, blokada i odblokowanie konta.
7. **Dashboard analiz** — te same progi alarmowe co w automatyzacji n8n: ≥3 awarie/urządzenie w 90 dni, ≥2 awarie o krytyczności „Wysoka”/urządzenie w 60 dni, ≥8h przestoju/urządzenie w 30 dni, ranking TOP 10, trend miesięczny (kierownik, admin).
8. **Eksport danych** (kierownik, admin) — CSV zgodny z arkuszem Google Sheets „Awarie” używanym w automatyzacji n8n (`ID_zgloszenia` zostaje puste — numeracja `AWR-2026-XXX` nadawana jest w arkuszu).

## Role i uprawnienia

Konta zakłada wyłącznie administrator (hasło tymczasowe pokazane raz, zmiana wymuszona przy pierwszym logowaniu). Uprawnienia egzekwuje baza (RLS); ukrywanie pozycji menu to tylko wygoda.

| | Pracownik | Technik | Kierownik | Admin |
|---|---|---|---|---|
| Zgłaszanie awarii | tak | tak | tak | tak |
| Podgląd awarii | tylko własne | wszystkie | wszystkie | wszystkie |
| Zamknięcie i edycja awarii | – | tak | tak | tak |
| Dashboard analiz, eksport CSV | – | – | tak | tak |
| Użytkownicy: konta, role, blokada, reset hasła | – | – | – | tak |

W etapie 1 baza tylko pilnuje dozwolonych wartości statusu (`Otwarta`, `Zamknieta`); zasada, że ponowne otwarcie zamkniętej awarii należy do kierownika i admina, oraz reszta przejść statusów wchodzą wraz z triggerem w etapie 2.

Menu dolne: pracownik — Zgłoś, Moje; technik — Zgłoś, Awarie; kierownik — Awarie, Zgłoś, Analizy, Eksport; admin — Awarie, Analizy, Zgłoś, Eksport, Admin (przycisk „Zgłoś” zawsze pośrodku, przy dwóch pozycjach pierwszy). Konto zablokowane albo z wymuszoną zmianą hasła nie czyta żadnych danych poza własnym profilem. Ostatniego aktywnego administratora nie można zablokować ani zdegradować.

Publiczny webhook `POST /api/public/sync-urzadzenia` (nagłówek `x-sync-secret`) synchronizuje rejestr urządzeń z n8n.

Aplikacja ma manifest PWA — można ją dodać do ekranu głównego telefonu.

## Rozwój lokalny

Wymagany Node.js ≥ 22.18 (skrypty `.ts` w `scripts/` uruchamiane natywnie) i npm.

```sh
git clone https://github.com/Jerry-S-77/zgloszenia-awarii.git
cd zgloszenia-awarii
npm i
npm run dev
```

Wymagane zmienne środowiskowe aplikacji (`.env`, nieśledzony przez git; wzór: `.env.example`):

- `VITE_SUPABASE_URL` / `SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (tylko serwer)
- `SYNC_URZADZENIA_SECRET` (webhook synchronizacji urządzeń)

### Projekt testowy i testy

Testy działają na osobnym, **testowym** projekcie Supabase, nigdy na produkcji. Skopiuj `.env.test.example` do `.env.test` (nieśledzony przez git) i uzupełnij `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` i `SUPABASE_SERVICE_ROLE_KEY` projektu testowego. Testy i `dev:test` odmawiają uruchomienia, gdy adres wskazuje projekt z `supabase/config.toml` (`project_id`) albo gdy nie da się odczytać tego pliku.

```sh
npm run typecheck   # tsc --noEmit
npm test            # testy jednostkowe (Vitest, tests/unit)
npm run test:rls    # polityki RLS i logika kont na projekcie testowym (Vitest, tests/rls)
npm run test:e2e    # Playwright, viewport telefonu; sam uruchamia dev:test
npm run dev:test    # serwer deweloperski na http://localhost:8081 podłączony do projektu testowego
```

Supabase Auth ogranicza liczbę logowań hasłem, więc `test:rls` i `test:e2e` uruchamiaj osobno, z kilkuminutową przerwą.

Testy e2e obejmują: wymuszoną zmianę hasła, ograniczone widoki pracownika oraz założenie konta przez administratora z pierwszym logowaniem i zgłoszeniem awarii.

## Pierwszy administrator

Pierwsze konto administratora zakłada się skryptem (potem kolejne konta tworzy admin w panelu „Użytkownicy”):

```sh
node scripts/utworz-admina.ts <email> "<Imię Nazwisko>" --tak
```

Skrypt czyta `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` z `.env` (wartości **produkcyjnego** projektu Supabase), wypisuje docelowy host, a bez `--tak` niczego nie tworzy. Działa tylko wtedy, gdy nie ma jeszcze aktywnego administratora. Hasło tymczasowe wyświetla jeden raz; zmiana jest wymuszona przy pierwszym logowaniu. Imię i nazwisko podaj w cudzysłowie (dokładnie dwa argumenty pozycyjne).

Baza produkcyjna to nowy, własny projekt Supabase, który dopiero zostanie założony (jego identyfikator trafi do `project_id` w `supabase/config.toml`); dawna baza z Lovable jest niedostępna i nieużywana.

## Odzyskiwanie dostępu administratora

Skrypt z poprzedniej sekcji odmawia działania, gdy istnieje aktywny administrator, a aplikacja nie wysyła wiadomości e-mail (brak odzyskiwania hasła przez „Send password recovery”). Jeśli jedyny administrator zapomni hasła, odzyskanie dostępu jest ręczne, przez panel Supabase:

1. Authentication → Users → wybierz konto administratora → ustaw nowe hasło.
2. Table Editor → `profiles` → dla tego użytkownika ustaw `must_change_password = true`, aby przy następnym logowaniu wymusić zmianę hasła.

Zalecenie: zaraz po utworzeniu pierwszego administratora załóż **drugie** konto administratora (panel „Użytkownicy”), żeby utrata jednego hasła nie zamykała dostępu do panelu.

Roadmap dalszego rozwoju: `roadmap.md`.
