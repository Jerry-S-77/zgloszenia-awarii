# Plan nadrzędny: rozbudowa aplikacji „Zgłaszanie awarii" (etapy 1–6)

> **Dla wykonawców:** ten dokument nie zawiera kroków implementacji. Kroki są w planach poszczególnych etapów
> (tabela niżej). Do wykonania planu etapu użyj `superpowers:subagent-driven-development` (zalecane) albo
> `superpowers:executing-plans`.

**Specyfikacja:** `docs/superpowers/specs/2026-09-21-rozbudowa-obsluga-awarii-design.md`
**Źródło wymagań o testowaniu i oddaniu pracy:** karta wyzwania „Projekt finałowy: Twój Boss Fight" (Gwardia AI, tydzień 7–8).

## 1. Dlaczego osobne plany

Specyfikacja obejmuje sześć etapów, z których każdy daje działające oprogramowanie, ale zależy od kodu poprzedniego
(nazwy funkcji pomocniczych RLS, typy, komponenty). Szczegółowy plan z kodem powstaje dla jednego etapu naraz, dopiero gdy
poprzedni jest zamknięty i zweryfikowany. Plan późniejszego etapu pisany „na zapas" rozjechałby się z rzeczywistym kodem.

| Etap | Plan | Stan |
|---|---|---|
| 1. Fundament: logowanie i użytkownicy | `2026-09-21-etap-1-fundament-logowanie-uzytkownicy.md` | **zamknięty** (tag `etap-1-gotowy`) |
| 2. Obsługa awarii | `2026-09-21-etap-2-obsluga-awarii.md` | **zamknięty** (tag `etap-2-gotowy`) |
| 3. Urządzenia i harmonogram | `2026-09-23-etap-3-urzadzenia-harmonogram.md` | **zamknięty** (tag `etap-3-gotowy`); ręczny test na telefonie po wdrożeniu na produkcję |
| 4. Powiadomienia w aplikacji i reguły | `…-etap-4-powiadomienia.md` | do napisania po zamknięciu etapu 3 |
| 5. Web Push | `…-etap-5-web-push.md` (osobny spec) | po etapie 4, opcjonalny |
| 6. Audyt końcowy i publikacja | `…-etap-6-audyt-publikacja.md` | po etapie 4 (lub 5) |

Do napisania planu każdego kolejnego etapu używamy `superpowers:writing-plans` na podstawie specyfikacji i faktycznego stanu kodu.

## 2. Zasady z karty wyzwania, które obowiązują w każdym etapie

Karta wyzwania mówi wprost, jak ma wyglądać praca. Przekładamy to na reguły planu:

| Zalecenie z karty | Reguła w tym planie |
|---|---|
| „Zanim zaczniesz budować, wykorzystaj tryb planowania" | Zrobione: brainstorming, specyfikacja, ten plan. Każdy etap zaczyna się od własnego planu |
| „Pętla: opisz, sprawdź, popraw" | Każde zadanie to cykl: test, implementacja, uruchomienie testu, poprawka. Zadanie kończy się dopiero, gdy jego test przechodzi |
| „Zapisuj pracę commitem zawsze wtedy, kiedy coś zaczyna działać" | Każde zadanie kończy się commitem, a każdy etap tagiem `etap-N-gotowy` (punkt powrotu, gdy kolejna zmiana coś popsuje). Push tylko za osobną zgodą |
| „Kiedy cała ścieżka działa od początku do końca, wszystko dokładnie przetestuj, iteruj i poprawiaj" | Bramka etapu (sekcja 3) obejmuje testy automatyczne **oraz** ręczne przejście całej ścieżki użytkownika na telefonie |
| „Zrób deploy… działający link" | Etap 6: publikacja pod publicznym linkiem, sprawdzona po wdrożeniu tą samą ścieżką testową |
| „Wrzuć: link, zrzut ekranu, repozytorium, kilka zdań" | Sekcja 5 tego dokumentu (lista do oddania) |

## 3. Bramka jakości każdego etapu (definicja „zrobione")

Etap jest zamknięty dopiero, gdy **wszystkie** punkty przechodzą, a wynik jest zapisany w komunikacie commitu zamykającego:

1. `npm run lint` bez nowych błędów względem stanu wyjściowego (zapisanego w zadaniu 1 etapu 1).
2. `npm run typecheck` bez błędów.
3. `npm test` (jednostkowe) zielone.
4. `npm run test:rls` (polityki RLS i logika kont na projekcie **testowym** Supabase) zielone.
5. `npm run test:e2e` (Playwright, viewport telefonu) zielone dla ścieżek danego etapu.
6. `npm run build` przechodzi.
7. `npm audit --omit=dev`: brak nowych podatności wysokiego i krytycznego poziomu (lub udokumentowany wyjątek).
8. Przegląd kodu (`/code-review`) i przegląd bezpieczeństwa (`/security-review`) zmian etapu; znaleziska naprawione lub
   świadomie odrzucone z uzasadnieniem w commicie.
9. **Ręczna ścieżka na telefonie** (lub w narzędziach deweloperskich z widokiem telefonu, min. 390 px szerokości): przejście
   głównej ścieżki etapu od logowania do końca, z wyszukaniem błędów układu (elementy dotykowe min. 44 px, brak poziomego
   przewijania, czytelność w słabym świetle). Zrzuty ekranu zapisujemy poza repozytorium.
10. Aktualizacja `CLAUDE.md` i `README.md` o to, co się zmieniło w etapie.

Zasada testów: testy polityk RLS i logiki kont **nigdy** nie działają na projekcie produkcyjnym. Helper testowy odmawia
uruchomienia, jeśli `SUPABASE_URL` wskazuje na projekt, którego identyfikator jest w `supabase/config.toml`
(`project_id`), oraz gdy nie da się go odczytać.

## 4. Przypomnienia i decyzje przeniesione

- **Zdjęcia do zgłoszeń** (opcjonalne): przypomnieć użytkownikowi po zamknięciu etapu 2 oraz przed etapem 6. Ekran zgłoszenia
  zostaje bez pola zdjęcia, ale bez blokowania późniejszego dodania.
- **`pg_cron`** (etap 4): sprawdzić dostępność rozszerzenia w planie Supabase na początku planu etapu 4. Wariant awaryjny:
  Cloudflare Cron Trigger wywołujący funkcję SQL.
- **Środowisko testów RLS**: rozstrzygnięte. Na komputerze nie ma Dockera ani Supabase CLI, więc testy działają na osobnym
  projekcie Supabase (`zgloszenia-awarii-test`), a migracje stosuje Supabase CLI z zależności deweloperskiej.
- **Baza produkcyjna:** rozstrzygnięte. Dawna baza `fujutpwdtnnooeusivdr` (z Lovable) jest niedostępna dla użytkownika i nie jest używana. Produkcją będzie nowy, własny projekt Supabase (`zgloszenia-awarii`), zbudowany od zera z migracji w zadaniu 11 etapu 1. Jego Reference ID trafia do `supabase/config.toml` (`project_id`), skąd czyta go też strażnik testów przed uruchomieniem na produkcji. Dane przykładowe z migracji bazowej zastąpi import z arkuszy w etapie 3. Każdy krok zewnętrzny (tworzenie projektu, `link`, `db push`, push do GitHuba) wymaga udziału i zgody użytkownika.
- **Znane ograniczenie do rozwiązania w etapie 2:** kolejka offline zatrzymuje się na pierwszej odrzuconej operacji.
  Etap 1 usuwa tylko przypadek duplikatu; lista „Do sprawdzenia" dla konfliktów biznesowych powstaje w etapie 2.
- **Znane luki po etapie 1 (do domknięcia w etapie 2 lub 6):**
  - Test E2E trybu offline nie ćwiczy zimnego startu: asercja „brak przekierowania na /logowanie" po powrocie sieci nie
    dotyka ścieżki odświeżania sesji (w trybie dev nie da się przeładować strony offline). Dodać test: przeładowanie
    online z wygasłym tokenem i przerwanym `**/auth/v1/token**`, oczekiwanie: użytkownik zostaje w aplikacji, a profil
    jest weryfikowany po odblokowaniu żądania.
  - Przez ok. 60 s po nieudanym odświeżeniu tokenu (cooldown auth-js) niezsynchronizowane zgłoszenie offline może krótko
    wyglądać na zsynchronizowane, `biezacyUserId` traktuje „null z błędem" online jak brak sesji (kolejka odzyskuje się po
    ok. 60–80 s), a mutacje online idą wtedy jako anon. Rozważyć traktowanie „null z błędem" jako nieokreślonego także tam.
  - Logika scalania w `awarieQuery` (dedup po id, nakładanie oczekujących aktualizacji) jest testowana tylko w części
    czystej (`zdalneLubZCache`); dodać test jednostkowy całej funkcji scalającej przy przebudowie kolejki (etap 2).
- **Import arkuszy na produkcję (po etapie 3, za zgodą użytkownika):** `node scripts/importuj-arkusze.ts` (próba), potem `--tak`. Na produkcji istnieje testowa awaria `AWR-2026-001` z sesji zrzutów ekranu — przed importem usunąć ją albo zaakceptować, że import pominie ten numer.
- **Lista przełączenia na produkcję (etap 6):**
  - podnieść wersję IndexedDB kolejki offline i odrzucić operacje o nieznanym kształcie przy przełączeniu na nową bazę;
  - zweryfikować na nowym projekcie produkcyjnym, że publiczna rejestracja jest wyłączona (`Allow new users to sign up` = off), bo test tego ustawienia działa tylko na projekcie testowym.

## 5. Lista do oddania w wyzwaniu (kanał #wygrane-boss-fight)

Wypełniana po etapie 6:

- [ ] **Link do opublikowanego projektu:** działający, do kliknięcia, sprawdzony po wdrożeniu (część obowiązkowa).
- [ ] **Zrzut ekranu** telefonu z głównymi ekranami (zgłoszenie, karta awarii, przeglądy).
- [ ] **Link do repozytorium:** `https://github.com/Jerry-S-77/zgloszenia-awarii`. Wcześniej sprawdzić, że w historii nie ma
  sekretów ani plików z `@Dodatkowe dokumenty/`.
- [ ] **Kilka zdań:** co to jest (mobilna aplikacja do zgłaszania i obsługi awarii oraz przeglądów w zakładzie farmaceutycznym),
  dla kogo (pracownicy, technicy, kierownicy i administratorzy zakładu), czego ze szkolenia użyto (tryb planowania i
  brainstorming, praca w pętli opisz-sprawdź-popraw, commity jako punkty powrotu, testy automatyczne, przegląd kodu i
  bezpieczeństwa, deploy). Szkic tekstu uzupełniamy faktami po etapie 6.
