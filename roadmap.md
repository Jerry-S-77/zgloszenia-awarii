# Roadmap rozwoju — Ewidencja awarii urządzeń

Status: ✅ ukończone / ⏳ zaplanowane (czeka na osobne polecenie)

## ✅ Gotowe
- Aplikacja mobile-first: zgłoszenie, lista z filtrami/zamykaniem, dashboard z progami, eksport CSV.
- Tryb offline (IndexedDB + kolejka synchronizacji).
- Webhook /api/public/sync-urzadzenia — publiczny POST, weryfikacja nagłówka `x-sync-secret` vs `SYNC_URZADZENIA_SECRET`, upsert do `urzadzenia` przez supabaseAdmin. Podłączony do n8n, synchronizacja codziennie o 5:45.

## ⏳ Zaplanowane (realizować kolejno, z potwierdzeniem przed każdym)
1. **Logowanie (Supabase Auth)** — zamknięcie dostępu do `awarie`/`pracownicy`/`urzadzenia` tylko dla zalogowanych. Obecnie polityki RLS są tymczasowo otwarte (świadomie zignorowane znaleziska bezpieczeństwa). Stan przejściowy, nie docelowy.
2. **Powiązanie zgłoszeń z auth.uid()** zamiast wyboru osoby z listy.
3. **Numeracja ID_zgloszenia AWR-2026-XXX** przy zapisie do arkusza Google Sheets (CSV zostawia to pole puste do numeracji w arkuszu).
4. (Opcjonalnie) **Zdjęcie do zgłoszenia awarii.**
5. (Opcjonalnie) **Powiadomienia push** przy nowym zgłoszeniu o wysokiej krytyczności.

Nie zaczynać żadnego punktu bez osobnego polecenia.
