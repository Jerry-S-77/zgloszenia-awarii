# Zgłaszanie awarii

**Aplikacja:** https://zgloszenia-awarii.vercel.app

Mobilna aplikacja webowa (mobile-first, responsywna) do zgłaszania, śledzenia, ewidencji i analizy awarii urządzeń technicznych w zakładzie farmaceutycznym.

Supabase jest głównym źródłem prawdy (wspólnym dla całego zespołu). W trybie offline zgłoszenie zapisuje się lokalnie (IndexedDB) w kolejce do synchronizacji i wysyła się automatycznie do Supabase po odzyskaniu połączenia; status jest widoczny dla użytkownika ("zapisano lokalnie, oczekuje na synchronizację" / "zsynchronizowano"). Klient zapytań działa w trybie `networkMode: always`, żeby lista awarii łączyła lokalną kolejkę także offline; offline użytkownik jest rozpoznawany po zapamiętanym profilu (tylko do wyświetlania, RLS nadal decyduje o dostępie do danych). Nieokreślona sesja (nieudane odświeżenie tokenu, np. tuż po powrocie sieci) zostawia stan z pamięci i jest sprawdzana ponownie; lista awarii offline wraca do swoich zapamiętanych wierszy zdalnych i dokłada do nich lokalną kolejkę.

## Tabele Supabase

1. **profiles** — konta użytkowników: `id` (uuid, = `auth.users.id`), `email`, `imie_nazwisko`, `rola` (`pracownik` / `technik` / `kierownik` / `admin`), `status` (`aktywny` / `zablokowany`), `must_change_password`, `created_at`.
2. **urzadzenia** — `nr_technologiczny` (text, klucz), `nazwa_urzadzenia`, `kategoria`, `lokalizacja`, `krytycznosc`, `wlasciciel`, `status_w_rejestrze` (tylko `Aktywne` trafia do dropdownu zgłoszenia).
3. **awarie** — `id` (uuid), `nr_technologiczny` (FK), `nazwa_urzadzenia`, `data_awarii`, `opis_awarii`, `przyczyna`, `czas_przestoju_h`, `krytycznosc_skutku` (Niska/Srednia/Wysoka), `zglaszajacy_id` (FK do profiles), `zglaszajacy_nazwa` (kopia imienia i nazwiska autora), `przypisany_technik_id` (FK do profiles, nullable), `status` (`zgloszona`/`przyjeta`/`w_naprawie`/`oczekuje_na_czesc`/`zamknieta`), `data_zamkniecia`, `numer` (`AWR-<rok>-<NNN>`, nadawany raz przez bazę, niezmienny potem), `wersja` (licznik do wykrywania konfliktów, rośnie przy każdym zapisie). Autora (`zglaszajacy_id`, `zglaszajacy_nazwa`) ustawia trigger w bazie z konta zalogowanego użytkownika; wartość wysłana przez klienta jest ignorowana, a przy edycji autor się nie zmienia. Przejścia statusu waliduje trigger (kto może, z jakiego stanu w jaki, że zamknięcie wymaga przyczyny i czasu przestoju) — baza jest ostatnią linią obrony, niezależnie od tego, co pokazuje interfejs.
4. **awarie_historia** — automatyczny, tylko-do-odczytu ślad zmian (utworzenie, zmiana statusu, przypisanie); dopisuje go wyłącznie trigger, nikt nie wstawia ręcznie.
5. **awarie_komentarze** — komentarze do zgłoszenia; autor ustawiany triggerem z konta zalogowanego użytkownika, bez edycji i usuwania.

Schemat: `supabase/migrations/`. Dostęp do wszystkich tabel ma tylko zalogowany, aktywny użytkownik (rola `anon` nie ma uprawnień); zasady opisuje sekcja „Role i uprawnienia”.

## Ekrany

Wszystkie ekrany poza logowaniem wymagają zalogowania. Dolny pasek nawigacji zależy od roli, a przycisk „Zgłoś” jest zawsze na środku.

1. **Logowanie** (`/logowanie`) — e-mail i hasło. Nie ma rejestracji ani przypominania hasła: konta zakłada administrator.
2. **Zmiana hasła** (`/zmiana-hasla`) — konto z hasłem tymczasowym (nowe albo po resecie) musi ustawić własne hasło (min. 12 znaków, inne niż tymczasowe), zanim zobaczy jakiekolwiek dane.
3. **Zgłoszenie awarii** (`/`) — wybór urządzenia z listy (autouzupełnienie kategorii/krytyczności), data/godzina (domyślnie teraz), opis, krytyczność skutku. Osoba zgłaszająca to zalogowane konto. Status ustawiany automatycznie na „Zgłoszona”; numer nadaje baza po zapisaniu (zgłoszenie z kolejki offline pokazuje „oczekuje na numer” do czasu synchronizacji).
4. **Lista awarii** (`/awarie`) — filtrowanie po urządzeniu, statusie, krytyczności, zakresie dat. Pracownik widzi tylko swoje zgłoszenia („Moje awarie”).
5. **Karta awarii** (`/awarie/$id`) — oś statusów, przycisk z kolejnym dozwolonym krokiem dla roli przeglądającego (przyjęcie, rozpoczęcie/wstrzymanie naprawy, zamknięcie z przyczyną i czasem przestoju, ponowne otwarcie tylko kierownik/admin), przycisk „Przypisz do mnie” (technik/kierownik/admin), komentarze i pełna historia zmian. Zapis niesie oczekiwaną wersję rekordu — przy konflikcie (ktoś inny zmienił zgłoszenie w międzyczasie) pokazuje komunikat i odświeża dane, nie nadpisuje cudzej zmiany.
6. **Zadania** (`/zadania`, technik i admin w pasku nawigacji; kierownik ma dostęp z linku, bez pozycji w pasku) — zgłoszenia do przyjęcia i przypisane do zalogowanego technika.
7. **Użytkownicy** (`/admin/uzytkownicy`, tylko admin) — lista kont, „Nowe konto” z hasłem tymczasowym pokazanym raz, reset hasła (nowe hasło tymczasowe, także pokazane raz), zmiana roli, blokada i odblokowanie konta.
8. **Dashboard analiz** — te same progi alarmowe co w automatyzacji n8n: ≥3 awarie/urządzenie w 90 dni, ≥2 awarie o krytyczności „Wysoka”/urządzenie w 60 dni, ≥8h przestoju/urządzenie w 30 dni, ranking TOP 10, trend miesięczny (kierownik, admin).
9. **Eksport danych** (kierownik, admin) — CSV zgodny z arkuszem Google Sheets „Awarie” używanym w automatyzacji n8n (`ID_zgloszenia` zostaje na razie puste — baza już nadaje realny numer zgłoszenia, ale wpięcie go do eksportu to kolejny etap).

## Role i uprawnienia

Konta zakłada wyłącznie administrator (hasło tymczasowe pokazane raz, zmiana wymuszona przy pierwszym logowaniu). Uprawnienia egzekwuje baza (RLS); ukrywanie pozycji menu to tylko wygoda.

| | Pracownik | Technik | Kierownik | Admin |
|---|---|---|---|---|
| Zgłaszanie awarii | tak | tak | tak | tak |
| Podgląd awarii | tylko własne | wszystkie | wszystkie | wszystkie |
| Przyjęcie, przypisanie, zmiana statusu, zamknięcie | – | tak | tak | tak |
| Ponowne otwarcie zamkniętej awarii | – | – | tak | tak |
| Komentarze | własne zgłoszenia | wszystkie | wszystkie | wszystkie |
| Dashboard analiz, eksport CSV | – | – | tak | tak |
| Użytkownicy: konta, role, blokada, reset hasła | – | – | – | tak |

Przejścia statusu (`zgloszona → przyjeta → w_naprawie ⇄ oczekuje_na_czesc → zamknieta`, plus skróty wprost do zamknięcia i ponowne otwarcie) waliduje trigger w bazie — niezależnie od tego, co pokazuje interfejs.

Menu dolne: pracownik — Zgłoś, Moje; technik — Zadania, Zgłoś, Awarie; kierownik — Awarie, Zgłoś, Analizy, Eksport; admin — Zadania, Awarie, Zgłoś, Analizy, Eksport, Admin (przycisk „Zgłoś” zawsze pośrodku). Konto zablokowane albo z wymuszoną zmianą hasła nie czyta żadnych danych poza własnym profilem. Ostatniego aktywnego administratora nie można zablokować ani zdegradować.

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

Testy e2e obejmują: wymuszoną zmianę hasła, ograniczone widoki pracownika, założenie konta przez administratora z pierwszym logowaniem i zgłoszeniem awarii, zimny start offline z wygasłym tokenem, oraz pełną obsługę awarii (przyjęcie, naprawę, komentarz, zamknięcie, ponowne otwarcie, konflikt wersji w kolejce offline lądujący w „Do sprawdzenia” bez blokowania reszty kolejki).

## Pierwszy administrator

Pierwsze konto administratora zakłada się skryptem (potem kolejne konta tworzy admin w panelu „Użytkownicy”):

```sh
node scripts/utworz-admina.ts <email> "<Imię Nazwisko>" --tak
```

Skrypt czyta `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` z `.env` (wartości **produkcyjnego** projektu Supabase), wypisuje docelowy host, a bez `--tak` niczego nie tworzy. Działa tylko wtedy, gdy nie ma jeszcze aktywnego administratora. Hasło tymczasowe wyświetla jeden raz; zmiana jest wymuszona przy pierwszym logowaniu. Imię i nazwisko podaj w cudzysłowie (dokładnie dwa argumenty pozycyjne).

Baza produkcyjna to własny projekt Supabase `zgloszenia-awarii` (jego identyfikator jest w `project_id` w `supabase/config.toml`); dawna baza z Lovable jest niedostępna i nieużywana. Konta demonstracyjne (po jednym na rolę, bez wymuszonej zmiany hasła) zakłada `node scripts/utworz-konta-demo.ts --tak`; hasła wyświetla jeden raz.

## Wdrożenie

Aplikacja działa na Vercel (projekt połączony z repozytorium GitHub, gałąź `master`): każdy push na `master` wdraża nową wersję. Zmienne środowiskowe w Vercelu: `SUPABASE_URL`, `VITE_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (i informacyjnie `SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PROJECT_ID`). Nitro sam wykrywa środowisko Vercel, więc konfiguracja builda nie wymaga zmian. Migracje bazy stosuje się ręcznie (`npx supabase db push --db-url <Session pooler>`).

## Odzyskiwanie dostępu administratora

Skrypt z poprzedniej sekcji odmawia działania, gdy istnieje aktywny administrator, a aplikacja nie wysyła wiadomości e-mail, więc nie ma odzyskiwania hasła linkiem. Jeśli jedyny administrator zapomni hasła, odzyskanie dostępu jest awaryjne i ręczne. W panelu Supabase otwórz **SQL Editor** i wykonaj (za `adres@admina` wstaw e-mail administratora, a za hasło tymczasowe losowy ciąg co najmniej 12 znaków, którego nigdzie indziej nie używasz):

```sql
update auth.users set encrypted_password = crypt('TYMCZASOWE_HASLO_MIN_12_ZNAKOW', gen_salt('bf')) where email = 'adres@admina';
update public.profiles set must_change_password = true where email = 'adres@admina';
```

Sprawdź, że każde polecenie zwróciło `UPDATE 1` (przy literówce w adresie e-mail zmieni 0 wierszy, a hasło mogłoby zostać zmienione bez wymuszenia zmiany); możesz też wykonać oba polecenia w jednej transakcji (`begin; ...; commit;`).

Przy następnym logowaniu aplikacja wymusi ustawienie własnego hasła. Uwagi: SQL Editor działa z podwyższonymi uprawnieniami (omija RLS), a hasło tymczasowe zostaje w historii zapytań, dlatego wymuszona zmiana hasła jest tu konieczna. To procedura awaryjna (break-glass), nie codzienne narzędzie.

Zalecenie: zaraz po utworzeniu pierwszego administratora załóż **drugie** konto administratora (panel „Użytkownicy”), żeby utrata jednego hasła nie zamykała dostępu do panelu.

Roadmap dalszego rozwoju: `roadmap.md`.
