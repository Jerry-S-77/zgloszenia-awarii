# Zgłaszanie awarii

Mobilna aplikacja webowa (mobile-first, responsywna) do zgłaszania, śledzenia, ewidencji i analizy awarii urządzeń technicznych w zakładzie farmaceutycznym.

Supabase jest głównym źródłem prawdy (wspólnym dla całego zespołu). W trybie offline zgłoszenie zapisuje się lokalnie (IndexedDB) w kolejce do synchronizacji i wysyła się automatycznie do Supabase po odzyskaniu połączenia; status jest widoczny dla użytkownika ("zapisano lokalnie, oczekuje na synchronizację" / "zsynchronizowano").

## Tabele Supabase

1. **pracownicy** — `id` (uuid), `imie_nazwisko`.
2. **urzadzenia** — `nr_technologiczny` (text, klucz), `nazwa_urzadzenia`, `kategoria`, `lokalizacja`, `krytycznosc`, `wlasciciel`, `status_w_rejestrze` (tylko `Aktywne` trafia do dropdownu zgłoszenia).
3. **awarie** — `id` (uuid), `nr_technologiczny` (FK), `nazwa_urzadzenia`, `data_awarii`, `opis_awarii`, `przyczyna`, `czas_przestoju_h`, `krytycznosc_skutku` (Niska/Srednia/Wysoka), `osoba_zglaszajaca_id` (FK do pracownicy), `status` (Otwarta/Zamknieta), `data_zamkniecia`.

Schemat: `supabase/migrations/`.

## Ekrany

1. **Zgłoszenie awarii** — wybór osoby zgłaszającej i urządzenia z listy (autouzupełnienie kategorii/krytyczności), data/godzina (domyślnie teraz), opis, krytyczność skutku. Status ustawiany automatycznie na „Otwarta”.
2. **Lista awarii** — filtrowanie po urządzeniu, statusie, krytyczności, zakresie dat.
3. **Zamknięcie awarii** — uzupełnienie przyczyny, czasu przestoju, zmiana statusu na „Zamknieta”.
4. **Dashboard analiz** — te same progi alarmowe co w automatyzacji n8n: ≥3 awarie/urządzenie w 90 dni, ≥2 awarie o krytyczności „Wysoka”/urządzenie w 60 dni, ≥8h przestoju/urządzenie w 30 dni, ranking TOP 10, trend miesięczny.
5. **Eksport danych** — CSV zgodny z arkuszem Google Sheets „Awarie” używanym w automatyzacji n8n (`ID_zgloszenia` zostaje puste — numeracja `AWR-2026-XXX` nadawana jest w arkuszu).

Publiczny webhook `POST /api/public/sync-urzadzenia` (nagłówek `x-sync-secret`) synchronizuje rejestr urządzeń z n8n.

Aplikacja ma manifest PWA — można ją dodać do ekranu głównego telefonu.

## Rozwój lokalny

Wymagany Node.js i npm.

```sh
git clone https://github.com/Jerry-S-77/zgloszenia-awarii.git
cd zgloszenia-awarii
npm i
npm run dev
```

Wymagane zmienne środowiskowe (`.env`, nieśledzony przez git):

- `VITE_SUPABASE_URL` / `SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (tylko serwer)
- `SYNC_URZADZENIA_SECRET` (webhook synchronizacji urządzeń)

Roadmap dalszego rozwoju: `roadmap.md`.
