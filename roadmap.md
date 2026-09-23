# Roadmap rozwoju — Ewidencja awarii urządzeń

Status: ✅ ukończone / ⏳ zaplanowane (czeka na osobne polecenie)

## ✅ Gotowe
- Aplikacja mobile-first: zgłoszenie, lista z filtrami/zamykaniem, dashboard z progami, eksport CSV.
- Tryb offline (IndexedDB + kolejka synchronizacji).
- **Logowanie (Supabase Auth) i zamknięcie RLS** — konta zakłada admin, role pracownik/technik/kierownik/admin, `anon` bez dostępu do tabel. Zrealizowane w etapie 1 rozbudowy (spec: `docs/superpowers/specs/2026-09-21-rozbudowa-obsluga-awarii-design.md`, plany: `docs/superpowers/plans/2026-09-21-etap-1-fundament-logowanie-uzytkownicy.md`, `docs/superpowers/plans/2026-09-21-plan-nadrzedny-etapy.md`).
- **Powiązanie zgłoszeń z auth.uid()** — autora ustawia baza z konta zalogowanego użytkownika (`zglaszajacy_id`, `zglaszajacy_nazwa`); tabela `pracownicy` zastąpiona przez `profiles`. Zrealizowane w etapie 1 rozbudowy (jak wyżej).
- **Obsługa awarii: statusy, przypisanie, komentarze, historia, numeracja, widok „Zadania”** — maszyna stanów statusu i numeracja `AWR-<rok>-<NNN>` egzekwowane triggerem w bazie, wersjonowanie do wykrywania konfliktów zapisu, kolejka offline nie blokuje się już na pierwszym odrzuconym zapisie (odrzucone lądują w „Do sprawdzenia”, reszta idzie dalej). Zrealizowane w etapie 2 rozbudowy (spec jak wyżej, plan: `docs/superpowers/plans/2026-09-21-etap-2-obsluga-awarii.md`).

- **Urządzenia i harmonogram przeglądów w aplikacji** — rejestr urządzeń (admin), przeglądy ze statusem wyliczanym, odnotowanie wykonania, propozycje przyspieszenia z decyzją kierownika, progi liczone w bazie, jednorazowy import trzech arkuszy xlsx, numer zgłoszenia w eksporcie CSV; webhook n8n usunięty. Zrealizowane w etapie 3 rozbudowy (plan: `docs/superpowers/plans/2026-09-23-etap-3-urzadzenia-harmonogram.md`).

## ⏳ Zaplanowane (realizować kolejno, z potwierdzeniem przed każdym)
4. (Opcjonalnie) **Zdjęcie do zgłoszenia awarii.**
5. (Opcjonalnie) **Powiadomienia push** przy nowym zgłoszeniu o wysokiej krytyczności.

## Rozbudowa 2026-09

Sześć etapów z planu nadrzędnego `docs/superpowers/plans/2026-09-21-plan-nadrzedny-etapy.md` (spec jak wyżej). Każdy etap ma własny plan, pisany dopiero po zamknięciu poprzedniego, i przechodzi bramkę jakości.

1. ✅ Fundament: logowanie i użytkownicy — plan `2026-09-21-etap-1-fundament-logowanie-uzytkownicy.md` (wdrożenie na produkcyjny projekt Supabase czeka na osobne polecenie).
2. ✅ Obsługa awarii (statusy, przypisanie, komentarze, historia, numeracja, widok „Zadania”) — plan `2026-09-21-etap-2-obsluga-awarii.md`.
3. ✅ Urządzenia i harmonogram (CRUD urządzeń, przeglądy, propozycje przyspieszenia, import xlsx, usunięcie webhooka) — plan `2026-09-23-etap-3-urzadzenia-harmonogram.md`.
4. ⏳ Powiadomienia w aplikacji i reguły — plan `…-etap-4-powiadomienia.md`, do napisania po zamknięciu etapu 3.
5. ⏳ Web Push (opcjonalny, osobny spec) — plan `…-etap-5-web-push.md`, po etapie 4.
6. ⏳ Audyt końcowy i publikacja — plan `…-etap-6-audyt-publikacja.md`, po etapie 4 (lub 5).

Nie zaczynać żadnego punktu ani etapu bez osobnego polecenia.
