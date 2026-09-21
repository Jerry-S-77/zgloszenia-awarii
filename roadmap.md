# Roadmap rozwoju — Ewidencja awarii urządzeń

Status: ✅ ukończone / ⏳ zaplanowane (czeka na osobne polecenie)

## ✅ Gotowe
- Aplikacja mobile-first: zgłoszenie, lista z filtrami/zamykaniem, dashboard z progami, eksport CSV.
- Tryb offline (IndexedDB + kolejka synchronizacji).
- Webhook /api/public/sync-urzadzenia — publiczny POST, weryfikacja nagłówka `x-sync-secret` vs `SYNC_URZADZENIA_SECRET`, upsert do `urzadzenia` przez supabaseAdmin. Podłączony do n8n, synchronizacja codziennie o 5:45.
- **Logowanie (Supabase Auth) i zamknięcie RLS** — konta zakłada admin, role pracownik/technik/kierownik/admin, `anon` bez dostępu do tabel. Zrealizowane w etapie 1 rozbudowy (spec: `docs/superpowers/specs/2026-09-21-rozbudowa-obsluga-awarii-design.md`, plany: `docs/superpowers/plans/2026-09-21-etap-1-fundament-logowanie-uzytkownicy.md`, `docs/superpowers/plans/2026-09-21-plan-nadrzedny-etapy.md`).
- **Powiązanie zgłoszeń z auth.uid()** — autora ustawia baza z konta zalogowanego użytkownika (`zglaszajacy_id`, `zglaszajacy_nazwa`); tabela `pracownicy` zastąpiona przez `profiles`. Zrealizowane w etapie 1 rozbudowy (jak wyżej).

## ⏳ Zaplanowane (realizować kolejno, z potwierdzeniem przed każdym)
3. **Numeracja ID_zgloszenia AWR-2026-XXX** przy zapisie do arkusza Google Sheets (CSV zostawia to pole puste do numeracji w arkuszu).
4. (Opcjonalnie) **Zdjęcie do zgłoszenia awarii.**
5. (Opcjonalnie) **Powiadomienia push** przy nowym zgłoszeniu o wysokiej krytyczności.

## Rozbudowa 2026-09

Sześć etapów z planu nadrzędnego `docs/superpowers/plans/2026-09-21-plan-nadrzedny-etapy.md` (spec jak wyżej). Każdy etap ma własny plan, pisany dopiero po zamknięciu poprzedniego, i przechodzi bramkę jakości.

1. ✅ Fundament: logowanie i użytkownicy — plan `2026-09-21-etap-1-fundament-logowanie-uzytkownicy.md` (wdrożenie na produkcyjny projekt Supabase czeka na osobne polecenie).
2. ⏳ Obsługa awarii (statusy, przypisanie, komentarze, historia, numeracja, widok „Zadania”) — plan `…-etap-2-obsluga-awarii.md`, do napisania po zamknięciu etapu 1.
3. ⏳ Urządzenia i harmonogram (CRUD urządzeń, przeglądy, import xlsx, usunięcie webhooka) — plan `…-etap-3-urzadzenia-harmonogram.md`, do napisania po zamknięciu etapu 2.
4. ⏳ Powiadomienia w aplikacji i reguły — plan `…-etap-4-powiadomienia.md`, do napisania po zamknięciu etapu 3.
5. ⏳ Web Push (opcjonalny, osobny spec) — plan `…-etap-5-web-push.md`, po etapie 4.
6. ⏳ Audyt końcowy i publikacja — plan `…-etap-6-audyt-publikacja.md`, po etapie 4 (lub 5).

Nie zaczynać żadnego punktu ani etapu bez osobnego polecenia.
