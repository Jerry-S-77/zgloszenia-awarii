# Zgłaszanie awarii

Zbuduj mobilną aplikację webową (mobile-first, responsywna, do użytku głównie w przeglądarce telefonu) do zgłaszania, śledzenia, ewidencji i analizy awarii urządzeń technicznych w zakładzie farmaceutycznym. BAZA DANYCH: Supabase jako główne źródło prawdy (wspólne dla całego zespołu). Tryb offline: gdy brak internetu, zgłoszenie zapisuje się lokalnie (IndexedDB) w kolejce do synchronizacji i wysyła się automatycznie do Supabase po odzyskaniu połączenia. Status widoczny dla użytkownika: "zapisano lokalnie, oczekuje na synchronizację" / "zsynchronizowano". TABELE SUPABASE: 1. pracownicy: id (uuid), imie_nazwisko Dane startowe: Jan Kowalski, Piotr Nowak, Anna Wisniewska, Marek Zielinski, Tomasz Krawczyk, Katarzyna Nowicka, Pawel Adamczyk, Lukasz Dabrowski, Grzegorz Wojcik, Robert Kaczmarek 2. urzadzenia: nr_technologiczny (text, klucz), nazwa_urzadzenia, kategoria, lokalizacja, krytycznosc, wlasciciel, status_w_rejestrze Dane startowe (tylko status_w_rejestrze = 'Aktywne'): HVAC-01 | AHU nr 1 - strefa CNC HPAPI | HVAC | Hala CNC - AHU1 | Wysoka WFI-02 | Stacja wody oczyszczonej WFI-2 | Woda oczyszczona / media krytyczne | Pomieszczenie mediow | Wysoka DCS-03 | System DCS linia B | Automatyka DCS/PLC/SCADA | Sterownia linia B | Wysoka ISO-04 | Izolator do syntezy nr 4 | Izolatory produkcyjne | Hala syntez | Wysoka CO-05 | Instalacja CO - kociol 2 | CT/CO | Kotlownia | Srednia HVAC-06 | AHU nr 6 - magazyn | HVAC | Magazyn surowcow | Niska (urządzenia ze statusem "Proponowane" - SC-07 do PLC-14 - NIE wchodzą do dropdown zgłoszenia; będą dodane po zatwierdzeniu) 3. awarie: id (uuid, generowany lokalnie), nr_technologiczny (FK), nazwa_urzadzenia, data_awarii, opis_awarii, przyczyna, czas_przestoju_h, krytycznosc_skutku (Niska/Srednia/Wysoka), osoba_zglaszajaca_id (FK do pracownicy), status (Otwarta/Zamknieta), data_zamkniecia EKRANY: 1. Zgłoszenie awarii — wybór osoby zgłaszającej z listy, wybór urządzenia z listy (nr_technologiczny + nazwa_urzadzenia, autouzupełnienie kategorii i krytyczności urządzenia jako informacja pomocnicza), data i godzina (domyślnie teraz), opis_awarii, krytycznosc_skutku. Status ustawiany automatycznie na "Otwarta". Duże pola, czytelne na telefonie. 2. Lista awarii — filtrowanie po urządzeniu, statusie, krytyczności, zakresie dat. Kliknięcie otwiera szczegóły. 3. Zamknięcie awarii — uzupełnienie: przyczyna, czas_przestoju_h, zmiana statusu na "Zamknieta", data_zamkniecia. 4. Dashboard analiz — dokładnie te same progi co w automatyzacji n8n: - liczba awarii w ostatnich 90 dniach per urządzenie (alarm przy >=3) - liczba awarii o krytycznosci "Wysoka" w ostatnich 60 dniach per urządzenie (alarm przy >=2) - suma czasu przestoju w ostatnich 30 dniach per urządzenie (alarm przy >=8h) - ranking TOP 10 najbardziej awaryjnych urządzeń - trend miesięczny liczby awarii ogółem Urządzenia przekraczające którykolwiek próg oznacz wizualnie (np. czerwoną ramką) - to są te same kryteria, które w n8n automatycznie przyspieszają przegląd. 5. Eksport danych — przycisk generujący CSV z kolumnami dokładnie: ID_zgloszenia, Nr_technologiczny, Nazwa_urzadzenia, Data_awarii, Opis_awarii, Przyczyna, Czas_przestoju_h, Krytycznosc_skutku, Osoba_zglaszajaca, Status, Data_zamkniecia (zgodność z arkuszem Google Sheets "Awarie" używanym w automatyzacji n8n). ID_zgloszenia w eksporcie generuj jako pusty placeholder do uzupełnienia przy imporcie - numeracja AWR-2026-XXX jest nadawana sekwencyjnie po stronie arkusza, nie w apce. Dodaj manifest PWA, żeby aplikację dało się dodać do ekranu głównego telefonu.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://pharma-fault-tracker.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f4b75267-7530-4638-9398-826c5979d384).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
