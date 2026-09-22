# Rozbudowa aplikacji: użytkownicy, obsługa awarii, urządzenia i harmonogram, powiadomienia

Data: 2026-09-21 · Status: do akceptacji · Powiązane: `roadmap.md`, `CLAUDE.md`

## 1. Cel i zakres

Dziś aplikacja pozwala zgłaszać i przeglądać awarie (Supabase, tryb offline), ale nie ma kont, ról ani obsługi
awarii. Rejestr urządzeń, harmonogram przeglądów, numeracja awarii, alerty progowe i maile żyją poza aplikacją
(arkusze Google + n8n). RLS jest celowo otwarty.

Cel: aplikacja mobilna, która jest **jedynym źródłem prawdy** i obejmuje:

1. konta użytkowników z rolami, zakładane przez admina,
2. obsługę awarii od zgłoszenia do zamknięcia (przypisanie, statusy, komentarze, historia),
3. rejestr urządzeń i harmonogram przeglądów prowadzone w aplikacji,
4. powiadomienia w aplikacji zamiast maili,
5. zamknięty dostęp (RLS), testy i przegląd bezpieczeństwa przed publikacją.

n8n i arkusze Google zostają wyłączone. Dane z trzech plików xlsx importujemy jednorazowo.

**Poza zakresem tego specu:** zdjęcia do zgłoszeń (opcjonalne, później; przypomnienie po etapie 2 i przed
etapem 6), szczegóły Web Push (osobny spec w etapie 5), walidacja GxP i podpisy elektroniczne (historia zmian
jest śladem wspierającym, ale aplikacja nie jest formalnie walidowanym systemem).

## 2. Zatwierdzone decyzje

| Temat | Decyzja |
|---|---|
| Role | Pracownik, Technik, Kierownik (właściciel), Admin |
| Zakładanie kont | Tylko admin, z hasłem tymczasowym pokazanym raz; wymuszona zmiana przy pierwszym logowaniu. Brak rejestracji i brak maili |
| n8n i arkusze | Wyłączone, aplikacja jedynym źródłem, import jednorazowy z xlsx |
| Powiadomienia | W aplikacji (dzwonek, Realtime) na start; Web Push w osobnym etapie |
| Przyspieszanie przeglądu | Propozycja i zatwierdzenie przez kierownika lub admina, raz na zdarzenie |
| Architektura | Hybryda: RLS jako jedyny strażnik, zapisy przez supabase-js (także kolejka offline), funkcje serwerowe tylko dla operacji admina, triggery i pg_cron dla reguł |
| Nawigacja mobilna | Dolny pasek zależny od roli ze środkowym przyciskiem „Zgłoś" |
| Zdjęcia | Odłożone, docelowo tylko opcjonalne |

## 3. Etapy

Każdy etap ma własny plan implementacji i przechodzi bramkę jakości (sekcja 9) przed przejściem dalej.

1. **Fundament: logowanie i użytkownicy.** Supabase Auth, `profiles`, zamknięcie RLS, ekrany logowania i zmiany
   hasła, panel „Użytkownicy", zgłoszenie z `auth.uid()`, usunięcie `pracownicy`, polskie komunikaty 404/błędu.
2. **Obsługa awarii.** Statusy, przypisanie, komentarze, historia, numeracja, widok „Zadania".
3. **Urządzenia i harmonogram.** CRUD urządzeń, przeglądy, wykonania, statusy wyliczane, propozycje
   przyspieszenia, import xlsx, usunięcie webhooka i `SYNC_URZADZENIA_SECRET`.
4. **Powiadomienia w aplikacji i reguły.** Dzwonek, Realtime, pg_cron (progi, przeterminowane i zbliżające się przeglądy).
5. **Web Push.** Osobny spec.
6. **Audyt końcowy i publikacja.** Pełny przegląd kodu i bezpieczeństwa, testy end-to-end, deploy, aktualizacja `CLAUDE.md`, `roadmap.md`, README.

RLS zamykamy w tym samym wdrożeniu co logowanie (etap 1), inaczej aplikacja przestałaby działać.

## 4. Uprawnienia

| | Pracownik | Technik | Kierownik | Admin |
|---|---|---|---|---|
| Zgłaszanie awarii | ✅ | ✅ | ✅ | ✅ |
| Podgląd awarii | tylko własne | wszystkie | wszystkie | wszystkie |
| Przyjęcie, przypisanie, zmiana statusu, zamknięcie | – | ✅ | ✅ | ✅ |
| Ponowne otwarcie zamkniętej awarii | – | – | ✅ | ✅ |
| Odnotowanie wykonania przeglądu | – | ✅ | ✅ | ✅ |
| Edycja terminów i częstotliwości; decyzja o przyspieszeniu | – | – | ✅ | ✅ |
| Analizy, dashboard, eksport | – | – | ✅ | ✅ |
| Urządzenia: dodawanie, edycja, aktywacja | – | – | – | ✅ |
| Użytkownicy: konta, role, blokada, reset hasła | – | – | – | ✅ |

Wszyscy zalogowani aktywni użytkownicy czytają listę aktywnych urządzeń (do wyboru przy zgłoszeniu). Każdy czyta
tylko własne powiadomienia. Ostatniego aktywnego admina nie można zablokować ani zdegradować (trigger w bazie).

Ograniczenie analiz i eksportu do kierownika i admina jest ograniczeniem interfejsu: technik odczytuje wszystkie awarie, więc RLS nie może go od tych danych oddzielić.

## 5. Model danych

Nazwy tabel i kolumn zgodne z istniejącym stylem (polskie, bez diakrytyków). Wartości statusów w bazie bez
diakrytyków, etykiety w interfejsie po polsku.

- **`profiles`**: `id` (= `auth.users.id`), `email` (kopia informacyjna z chwili utworzenia konta), `imie_nazwisko`, `rola` (`pracownik|technik|kierownik|admin`),
  `status` (`aktywny|zablokowany`), `must_change_password` (bool), `created_at`. Zastępuje `pracownicy`.
- **`urzadzenia`** (istnieje): dochodzą `wlasciciel_id` (→ `profiles`, nullable) oraz status `proponowane|aktywne|wycofane`
  (dziś `status_w_rejestrze` = `Aktywne`; migracja mapuje wartości). Tylko `aktywne` pojawia się przy zgłoszeniu.
- **`awarie`** (istnieje): dochodzą `numer` (`AWR-ROK-NNN`), `zglaszajacy_id` (→ `profiles`) i `zglaszajacy_nazwa`
  (tekst dla danych historycznych), `przypisany_technik_id` (→ `profiles`), `wersja` (int, do wykrywania konfliktów).
  Statusy: `zgloszona|przyjeta|w_naprawie|oczekuje_na_czesc|zamknieta` (migracja: `Otwarta` → `zgloszona`, `Zamknieta` → `zamknieta`).
- **`awarie_historia`**: `id`, `awaria_id`, `autor_id`, `typ` (`utworzenie|zmiana_statusu|przypisanie|edycja`), `dane` (jsonb),
  `created_at`. Tylko dopisywanie (brak polityk UPDATE i DELETE), wpisuje trigger.
- **`awarie_komentarze`**: `id`, `awaria_id`, `autor_id`, `tresc`, `created_at`.
- **`przeglady`**: `id`, `nr_technologiczny` (→ `urzadzenia`), `typ_czynnosci`, `czestotliwosc_dni`, `data_ostatniego`,
  `data_najblizszego`, `wykonawca`, `uwagi`. Status (Zaplanowany, Wkrótce, Opóźniony, Do uzupełnienia) jest **wyliczany**, nie zapisywany.
- **`przeglady_wykonania`**: `id`, `przeglad_id`, `data_wykonania`, `wykonawca`, `uwagi`, `autor_id`, `created_at`.
- **`przeglady_propozycje`**: `id`, `przeglad_id`, `proponowany_termin` (nullable), `powod` (jsonb: próg i lista awarii),
  `status` (`oczekuje|zatwierdzona|odrzucona`), `decyzja_id`, `created_at`, `decyzja_at`.
- **`powiadomienia`**: `id`, `uzytkownik_id`, `typ`, `tresc`, `link`, `przeczytane`, `created_at`.
- **`numeracja_awarii`**: `rok`, `ostatni`. Numer nadaje trigger `BEFORE INSERT` z blokadą wiersza, rok = rok z `data_awarii`.

Historyczne wpisy zachowują nazwisko jako tekst. Nowe wskazują na `profiles`.

## 6. Obsługa awarii

**Przepływ statusów** (walidowany triggerem, niedozwolone przejście zwraca błąd):

```
zgloszona → przyjeta → w_naprawie ⇄ oczekuje_na_czesc → zamknieta
zgloszona / przyjeta → zamknieta   (odrzucone lub fałszywy alarm, wymaga komentarza)
zamknieta → w_naprawie             (ponowne otwarcie: kierownik lub admin)
```

- Zrealizowane w etapie 2: trigger `awarie_waliduj_przejscie` pilnuje w bazie pełnej maszyny stanów opisanej wyżej (kto może wykonać przejście, że ponowne otwarcie zamkniętej awarii należy do kierownika i admina), niezależnie od tego, co pokazuje interfejs.
- Zamknięcie każdą drogą wymaga wypełnionych `przyczyna` i `data_zamkniecia` — to jedyny warunek, którego pilnuje baza (trigger). Wymóg komentarza przy odrzuceniu ze zgłoszonej/przyjętej ("odrzucone lub fałszywy alarm") jest tylko sugestią UX, nie jest wymuszany przez bazę — nic nie stoi na przeszkodzie zamknięciu bez komentarza, jeśli przyczyna i czas przestoju są wypełnione.
- Konflikty: każda zmiana niesie oczekiwaną `wersja`. Trigger zwiększa `wersja`. Zapis z nieaktualną wersją nie zmienia
  wiersza, a interfejs pokazuje „Ktoś już zmienił tę awarię, odśwież".
- Numeracja: numer nadaje baza przy zapisie. Awaria utworzona offline pokazuje „oczekuje na numer", aż zsynchronizuje się kolejka.
- Widok „Zadania" (technik i wyżej): do przyjęcia, przypisane do mnie, przeglądy w najbliższym terminie.

**Kolejka offline.** Działa jak dziś (IndexedDB, kolejność wstawiania), z dwiema zmianami:
1. Operacje wykonuje zalogowany użytkownik. Przy wygasłej sesji kolejka czeka na ponowne logowanie i nic nie ginie.
2. Operacja odrzucona z powodu konfliktu biznesowego (nieaktualna wersja, niedozwolone przejście) **nie blokuje** kolejki.
   Trafia na listę „Do sprawdzenia" z opisem, a reszta kolejki idzie dalej. (Dziś pierwsza błędna operacja zatrzymuje wszystko.)

## 7. Urządzenia i harmonogram

- Admin dodaje, edytuje i wycofuje urządzenia. Urządzenie `proponowane` (np. dane robocze do weryfikacji w terenie)
  admin aktywuje ręcznie. Dodanie nowego urządzenia tworzy wpis w harmonogramie ze statusem „Do uzupełnienia".
- **Status przeglądu (wyliczany):** brak terminów → Do uzupełnienia; `data_najblizszego` < dziś → Opóźniony;
  ≤ 14 dni → Wkrótce; w przeciwnym razie Zaplanowany. „Zalecane przyspieszenie" to znacznik z otwartej propozycji.
- **Odnotowanie wykonania:** zapisuje wpis w `przeglady_wykonania`, ustawia `data_ostatniego` = data wykonania i
  `data_najblizszego` = data wykonania + `czestotliwosc_dni`.
- **Propozycja przyspieszenia** powstaje, gdy urządzenie przekracza jeden z progów (te same co w dotychczasowej automatyzacji):
  ≥ 3 awarie w 90 dni, ≥ 2 awarie „Wysoka" w 60 dni, ≥ 8 h przestoju w 30 dni.
  - Na jeden przegląd przypada najwyżej jedna propozycja `oczekuje`. Kolejna powstaje dopiero po decyzji i po pojawieniu
    się co najmniej jednej nowej awarii urządzenia. To zastępuje dotychczasowe wielokrotne skracanie terminu.
  - Proponowany termin = dziś + 7 dni, i tylko gdy jest wcześniejszy niż obecny `data_najblizszego`. Jeśli przegląd
    jest już opóźniony albo termin wypada wcześniej, propozycja nie ma terminu (`proponowany_termin` = NULL) i działa
    jak alert „próg przekroczony, wykonaj pilnie".
  - Zatwierdzenie (kierownik lub admin) zmienia termin i zapisuje decydenta oraz powód. Odrzucenie tylko zamyka propozycję.
- **Progi w jednym miejscu:** funkcja SQL `urzadzenia_przekraczajace_progi()` używana przez zadanie cykliczne i przez
  dashboard. Znika ręczne dublowanie progów między aplikacją a n8n.
- **Import jednorazowy** (skrypt lokalny z kluczem service-role, tryb próbny i raport): urządzenia (14, `Aktywne` → `aktywne`,
  `Proponowane` → `proponowane`), przeglądy (6 kompletnych + SC-07 „Do uzupełnienia"), awarie (5, z zachowaniem numerów
  `AWR-2026-001…005`, licznik ustawiony na maksimum). Właścicieli i zgłaszających dopasowujemy po nazwisku do istniejących
  kont, niedopasowani zostają NULL i trafiają do raportu. Kolumny e-mail z arkuszy są pomijane (adres konta pochodzi z `profiles.email`).
- Webhook `POST /api/public/sync-urzadzenia` i `SYNC_URZADZENIA_SECRET` są usuwane.
- **Eksport CSV** zostaje (kierownik, admin) i zawiera teraz `numer` w polu `ID_zgloszenia`. Zgodność z arkuszem Google nie jest już wymagana.

## 8. Powiadomienia

Tabela `powiadomienia` i Supabase Realtime (RLS obowiązuje także w Realtime, każdy słucha tylko swoich). Dzwonek w
nagłówku z licznikiem nieprzeczytanych.

| Zdarzenie | Odbiorca |
|---|---|
| Nowa awaria | Technicy i kierownicy oraz właściciel urządzenia. „Wysoka" oznaczona jako krytyczna |
| Przydzielenie awarii | Przypisany technik |
| Zmiana statusu (przyjęta, zamknięta) | Osoba zgłaszająca |
| Przegląd zbliża się (≤ 14 dni) i przegląd opóźniony | Właściciel urządzenia i kierownicy |
| Propozycja przyspieszenia | Właściciel urządzenia i kierownicy |

Zadania cykliczne (pg_cron, raz dziennie) są idempotentne dzięki kluczom unikalności (jedno powiadomienie danego typu na
przegląd i okres). Jeśli rozszerzenie pg_cron będzie niedostępne w planie Supabase, zamiennik to Cloudflare Cron Trigger
wywołujący tę samą funkcję SQL. Sprawdzamy to na początku etapu 4. Web Push (etap 5) dodaje tylko kanał dostarczenia.

## 9. Bezpieczeństwo, błędy, testy

**Bezpieczeństwo**
- Publiczna rejestracja w Supabase Auth wyłączona. Rola `anon` traci wszystkie uprawnienia do tabel.
- Funkcje pomocnicze RLS (`SECURITY DEFINER`, ustalony `search_path`) sprawdzają rolę i status z `profiles`. Konto
  `zablokowany` lub z `must_change_password` nie czyta żadnych danych.
- Brak eskalacji: użytkownik nie zmienia własnej roli ani statusu. Zmiany kont idą przez funkcje serwerowe admina.
- Funkcje serwerowe admina: podłączony `requireSupabaseAuth`, rola admina sprawdzana w bazie, wejście walidowane Zod,
  klucz service-role wyłącznie w plikach `.server.ts`. Operacje: utworzenie konta, reset hasła (nowe hasło tymczasowe,
  unieważnienie sesji), zmiana roli i statusu, blokada (także ban w Auth, żeby odświeżanie tokenu przestało działać).
  Reset hasła unieważnia tokeny odświeżania (potwierdzone testem), ale wydany już token dostępu działa do wygaśnięcia
  (do ok. godziny); dane odcina od razu RLS, bo odczytuje `must_change_password` i status na żywo.
- Zmiana hasła po pierwszym logowaniu przez funkcję serwerową: minimum 12 znaków, różne od tymczasowego; ustawia hasło
  przez Admin API i czyści `must_change_password` w jednej operacji (klient nie może sam wyczyścić flagi).
- Hasła tymczasowe: `crypto.getRandomValues`, pokazywane raz, nie zapisywane i nie logowane.
- Autor zgłoszenia i wpisów historii ustawiany triggerem z `auth.uid()`, wartość od klienta ignorowana.
- Nagłówki bezpieczeństwa (CSP z Google Fonts, `X-Frame-Options`, `Referrer-Policy`) ustalamy w etapie 6.

**Obsługa błędów:** komunikaty po polsku i bez szczegółów wewnętrznych; formularze walidowane Zod (react-hook-form już
jest w projekcie); błędy sieci i RLS jako toasty (sonner); istniejący mechanizm strony błędu SSR zostaje.

**Testy i bramki**
1. Vitest: logika czysta (statusy przeglądów, wyliczanie terminów, progi, przejścia statusów).
2. Testy polityk RLS w SQL: macierz 4 role × tabele × operacje, z przypadkami „nie wolno". Środowisko (lokalny Supabase w Dockerze
   albo osobny projekt testowy) wybieramy na początku etapu 1 po sprawdzeniu, co jest dostępne.
3. Playwright (viewport telefonu): logowanie i wymuszona zmiana hasła, zgłoszenie, obsługa do zamknięcia, przegląd z decyzją o przyspieszeniu.
4. Bramka każdego etapu: `npm run lint`, `tsc --noEmit` (dodać skrypt `typecheck`), `npm run build`, `npm audit`,
   przegląd kodu, security review.
5. Etap 6: pełny audyt RLS, skan sekretów w historii gita, kontrola elementów dotykowych (min. 44 px) i kontrastu, scenariusze offline.

## 10. Interfejs mobilny

Makiety zatwierdzone w sesji (zapisane lokalnie w `.superpowers/brainstorm/`, poza repozytorium).

- **Dolny pasek zależny od roli**, środkowy przycisk „Zgłoś" zawsze pod kciukiem. Powiadomienia dla wszystkich ról
  są pod dzwonkiem w nagłówku (nie w pasku).
  Pracownik: Moje, Zgłoś. Technik: Zadania, Awarie, Zgłoś, Przeglądy. Kierownik: Analizy zamiast Zadań.
  Admin: Zadania, Awarie, Zgłoś, Przeglądy, Admin (pięć pozycji).
- **Zgłoszenie:** urządzenie z wyszukiwarką, opis, krytyczność jako trzy duże przyciski, data domyślnie „teraz",
  znacznik trybu offline. Osoba zgłaszająca z konta. Bez pola zdjęcia.
- **Karta awarii:** oś statusów, jeden główny przycisk z kolejnym krokiem, komentarze, historia.
- **Przeglądy:** lista sortowana po pilności (pasek koloru i licznik dni), filtry jako chipy, karta przeglądu z banerem
  propozycji (widoczna dla kierownika i admina), arkusz od dołu „Odnotuj wykonanie" z automatycznym następnym terminem.
- **Admin:** zakładki Użytkownicy i Urządzenia, ekran „Nowe konto" z hasłem tymczasowym pokazanym raz.
- **Powiadomienia:** lista z wyróżnieniem krytycznych i nieprzeczytanych.
- Elementy dotykowe min. 44 px, kolory statusów nie jedyną informacją (etykieta i ikona), zgodnie z bieżącym motywem
  (`#1d5f6b`, Barlow Condensed i Manrope).

## 11. Zmiany w dokumentacji projektu

W etapach 1–6 aktualizujemy `CLAUDE.md`: znikają zasady o otwartym RLS jako stanie przejściowym, o niewpisywaniu
`ID_zgloszenia` po stronie aplikacji, o webhooku i o dublowaniu progów z n8n. `roadmap.md` i README dostają nowy stan.
Zasada „każdy krok z osobnym poleceniem" i „push wymaga osobnej zgody" pozostają w mocy.
