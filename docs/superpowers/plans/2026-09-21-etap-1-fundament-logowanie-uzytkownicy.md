# Etap 1: fundament (logowanie i użytkownicy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zalogowani użytkownicy z rolami (pracownik, technik, kierownik, admin), konta zakładane przez admina z hasłem tymczasowym, RLS zamknięty dla `anon`, autor zgłoszenia z `auth.uid()`.

**Architecture:** Hybryda ze specyfikacji. RLS w bazie (funkcje pomocnicze `moja_rola()` i `mam_role()`) jest jedynym strażnikiem dostępu. Zwykłe odczyty i zapisy idą przez supabase-js (kolejka offline zostaje). Tylko operacje na kontach (utworzenie, reset hasła, zmiana roli i statusu, zmiana własnego hasła) idą przez funkcje serwerowe TanStack z kluczem service-role. Guard w interfejsie (`AppShell`) jest tylko wygodą, nie zabezpieczeniem.

**Tech Stack:** TanStack Start 1.168 + React 19, Supabase (Auth + Postgres RLS), Zod 3, Vitest (jednostkowe i RLS), Playwright (E2E, viewport telefonu), Supabase CLI (zależność deweloperska).

**Spec:** `docs/superpowers/specs/2026-09-21-rozbudowa-obsluga-awarii-design.md` (sekcje 3 etap 1, 4, 5, 9). Plan nadrzędny: `docs/superpowers/plans/2026-09-21-plan-nadrzedny-etapy.md` (bramka jakości w sekcji 3 obowiązuje w zadaniu 11).

## Global Constraints

- Nazwy tabel, kolumn i wartości enumów po polsku, bez diakrytyków. Etykiety w interfejsie po polsku, z diakrytykami.
- Role: `pracownik | technik | kierownik | admin`. Status konta: `aktywny | zablokowany`.
- Konto z `must_change_password = true` albo `status = 'zablokowany'` nie czyta żadnych danych (poza własnym wierszem `profiles`).
- Rola `anon` nie ma żadnych uprawnień do tabel. Publiczna rejestracja w Supabase Auth wyłączona.
- Użytkownik nie zmienia własnej roli ani statusu. Zmiany kont wyłącznie przez funkcje serwerowe admina.
- Hasło tymczasowe: `crypto.getRandomValues`, 12 znaków w formacie `XXXX-XXXX-XXXX`, pokazywane raz, nie zapisywane i nie logowane. Nowe hasło: minimum 12 znaków, różne od dotychczasowego.
- Klucz service-role wyłącznie w plikach `*.server.ts` i ładowany dynamicznym importem w handlerach.
- `tsconfig` ma `exactOptionalPropertyTypes` i `noUncheckedIndexedAccess`: kod musi je respektować.
- Testy RLS i logiki kont działają wyłącznie na projekcie testowym. Helper odmawia startu, gdy `SUPABASE_URL` zawiera `fujutpwdtnnooeusivdr`.
- Ochrona sekretów blokuje polecenia powłoki dotykające `.env*`. Skrypty i testy same ładują env przez `process.loadEnvFile(...)`; w poleceniach nie odwołujemy się do plików `.env*`.
- Każdy commit kończy się trailerem: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. **Push tylko za osobną zgodą użytkownika.**
- Etap 1 nie zmienia statusów awarii (`Otwarta`/`Zamknieta`) ani nie usuwa webhooka `sync-urzadzenia` (to etapy 2 i 3).
- Odchylenie od specyfikacji: `profiles` dostaje kolumnę `email` (kopia informacyjna z chwili utworzenia konta), żeby admin odróżniał osoby o tym samym nazwisku. Specyfikacja zostaje poprawiona w zadaniu 3.

## File Structure

Tworzone:
- `vitest.config.ts`, `vitest.rls.config.ts`, `playwright.config.ts`, `.env.test.example`
- `scripts/dev-test.ts` (dev na projekcie testowym), `scripts/utworz-admina.ts` (pierwszy admin na produkcji)
- `supabase/migrations/20260921120000_etap1_profiles_rls.sql`
- `src/lib/uprawnienia.ts` (role, `czyRola`, `pozycjeNawigacji`), `src/lib/haslo.ts` (generator i schemat hasła), `src/lib/auth-bledy.ts`, `src/lib/kolejka-bledy.ts`
- `src/lib/uzytkownicy.schemas.ts` (Zod, wspólne dla klienta i serwera), `src/lib/uzytkownicy.server.ts` (logika kont), `src/lib/uzytkownicy.functions.ts` (cienkie funkcje serwerowe)
- `src/lib/auth.tsx` (`AuthProvider`, `useAuth`)
- `src/components/EkranAuth.tsx`, `src/components/MenuUzytkownika.tsx`, `src/components/admin/HasloTymczasoweDialog.tsx`, `src/components/admin/NoweKontoSheet.tsx`, `src/components/admin/EdycjaUzytkownikaSheet.tsx`
- `src/routes/logowanie.tsx`, `src/routes/zmiana-hasla.tsx`, `src/routes/admin.uzytkownicy.tsx`
- `tests/wspolne/srodowisko.ts`, `tests/unit/*.test.ts`, `tests/rls/macierz.test.ts`, `tests/rls/uzytkownicy.server.test.ts`, `tests/e2e/konta-i-zgloszenie.spec.ts`

Zmieniane: `package.json`, `tsconfig.json`, `.gitignore`, `src/integrations/supabase/types.ts` (regeneracja), `src/lib/types.ts`, `src/lib/queries.ts`, `src/lib/offline.ts`, `src/components/AppShell.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/awarie.index.tsx`, `src/routes/awarie.$id.tsx`, `src/routes/dashboard.tsx`, `src/routes/eksport.tsx`, `CLAUDE.md`, `README.md`, `roadmap.md`, specyfikacja.

---

### Task 1: Środowiska i narzędzia

**Files:**
- Create: `vitest.config.ts`, `vitest.rls.config.ts`, `.env.test.example`, `scripts/dev-test.ts`, `tests/wspolne/srodowisko.ts`
- Modify: `package.json`, `tsconfig.json`, `.gitignore`

**Interfaces:**
- Produces: skrypty `npm run typecheck | test | test:rls | test:e2e | dev:test`; `tests/wspolne/srodowisko.ts` eksportuje `HASLO_TESTOWE`, `KONTA`, `KluczKonta`, `klientAdmin()`, `klientAnon()`, `zaloguj(email)`, `przygotujKonta()`.

- [ ] **Step 1: Utwórz gałąź**

```bash
cd "D:/Claude/Code_zgłaszanie awarii" && git checkout -b etap-1-uzytkownicy
```
Expected: `Switched to a new branch 'etap-1-uzytkownicy'`.

- [ ] **Step 2: Zainstaluj narzędzia**

```bash
npm i -D vitest @playwright/test supabase
npx playwright install chromium
npx supabase --version
```
Expected: ostatnia komenda wypisuje numer wersji (np. `2.x.x`).

- [ ] **Step 3: Dodaj skrypty do `package.json`** (w sekcji `scripts`, obok istniejących)

```json
"typecheck": "tsc --noEmit",
"test": "vitest run",
"test:rls": "vitest run --config vitest.rls.config.ts",
"test:e2e": "playwright test",
"dev:test": "node scripts/dev-test.ts"
```

- [ ] **Step 4: Rozszerz `tsconfig.json`**: w `include` dodaj katalogi testów i skryptów oraz nowe konfiguracje

```json
"include": [
  "src/**/*.ts",
  "src/**/*.tsx",
  "tests/**/*.ts",
  "scripts/**/*.ts",
  "vite.config.ts",
  "vitest.config.ts",
  "vitest.rls.config.ts",
  "playwright.config.ts",
  "eslint.config.js"
],
```

- [ ] **Step 5: Uzupełnij `.gitignore`** (dopisz na końcu)

```
# Srodowisko testowe i pliki robocze Supabase CLI
.env.test
supabase/.temp/
playwright-report/
test-results/
```

- [ ] **Step 6: Utwórz `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});
```

- [ ] **Step 7: Utwórz `vitest.rls.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["tests/rls/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
```

- [ ] **Step 8: Utwórz `.env.test.example`**

```
# Skopiuj do .env.test i uzupelnij wartosciami z projektu TESTOWEGO Supabase
# (osobny projekt, np. "zgloszenia-awarii-test"). Nigdy nie uzywaj kluczy produkcyjnych.
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 9: Utwórz `scripts/dev-test.ts`** (dev-serwer wskazujący na projekt testowy)

```ts
import { spawn } from "node:child_process";

try {
  process.loadEnvFile(".env.test");
} catch {
  throw new Error("Brak pliku .env.test. Skopiuj .env.test.example i uzupełnij dane projektu testowego.");
}

const url = process.env["SUPABASE_URL"];
const klucz = process.env["SUPABASE_PUBLISHABLE_KEY"];
if (!url || !klucz) throw new Error("W .env.test brakuje SUPABASE_URL lub SUPABASE_PUBLISHABLE_KEY.");
if (url.includes("fujutpwdtnnooeusivdr")) {
  throw new Error("Ten skrypt nie może działać na projekcie produkcyjnym.");
}

const dziecko = spawn("npx", ["vite", "dev", "--port", "8081"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: klucz },
});
dziecko.on("exit", (kod) => process.exit(kod ?? 0));
```

- [ ] **Step 10: Utwórz `tests/wspolne/srodowisko.ts`**

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

try {
  process.loadEnvFile(".env.test");
} catch {
  throw new Error("Brak pliku .env.test. Skopiuj .env.test.example i uzupełnij dane projektu testowego.");
}

const PROJEKT_PRODUKCYJNY = "fujutpwdtnnooeusivdr";
export const HASLO_TESTOWE = "Test-Haslo-12345!";

function env(nazwa: string): string {
  const wartosc = process.env[nazwa];
  if (!wartosc) throw new Error(`Brak ${nazwa} w .env.test`);
  return wartosc;
}

export function url(): string {
  const u = env("SUPABASE_URL");
  if (u.includes(PROJEKT_PRODUKCYJNY)) {
    throw new Error("Testy nie mogą działać na projekcie produkcyjnym.");
  }
  return u;
}

const OPCJE = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export function klientAdmin(): SupabaseClient<Database> {
  return createClient<Database>(url(), env("SUPABASE_SERVICE_ROLE_KEY"), OPCJE);
}

export function klientAnon(): SupabaseClient<Database> {
  return createClient<Database>(url(), env("SUPABASE_PUBLISHABLE_KEY"), OPCJE);
}

export async function zaloguj(email: string, haslo = HASLO_TESTOWE): Promise<SupabaseClient<Database>> {
  const klient = klientAnon();
  const { error } = await klient.auth.signInWithPassword({ email, password: haslo });
  if (error) throw new Error(`Logowanie ${email} nie powiodło się: ${error.message}`);
  return klient;
}

export const KONTA = {
  pracownik: { email: "test-pracownik@example.test", rola: "pracownik", status: "aktywny", zmiana: false },
  pracownik2: { email: "test-pracownik2@example.test", rola: "pracownik", status: "aktywny", zmiana: false },
  technik: { email: "test-technik@example.test", rola: "technik", status: "aktywny", zmiana: false },
  kierownik: { email: "test-kierownik@example.test", rola: "kierownik", status: "aktywny", zmiana: false },
  admin: { email: "test-admin@example.test", rola: "admin", status: "aktywny", zmiana: false },
  zablokowany: { email: "test-zablokowany@example.test", rola: "pracownik", status: "zablokowany", zmiana: false },
  zmianaHasla: { email: "test-zmiana-hasla@example.test", rola: "pracownik", status: "aktywny", zmiana: true },
} as const;

export type KluczKonta = keyof typeof KONTA;

/** Tworzy (lub przywraca do stanu wyjściowego) konta testowe. Zwraca ich identyfikatory. */
export async function przygotujKonta(): Promise<Record<KluczKonta, string>> {
  const admin = klientAdmin();
  const { data: lista, error: blad } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (blad) throw blad;
  const wynik = {} as Record<KluczKonta, string>;

  for (const [klucz, konto] of Object.entries(KONTA) as [KluczKonta, (typeof KONTA)[KluczKonta]][]) {
    const istniejacy = lista.users.find((u) => u.email === konto.email);
    let id = istniejacy?.id;
    if (id) {
      const { error } = await admin.auth.admin.updateUserById(id, { password: HASLO_TESTOWE, ban_duration: "none" });
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: konto.email,
        password: HASLO_TESTOWE,
        email_confirm: true,
      });
      if (error || !data.user) throw error ?? new Error("createUser bez użytkownika");
      id = data.user.id;
    }
    const { error } = await admin.from("profiles").upsert(
      {
        id,
        email: konto.email,
        imie_nazwisko: `Test ${klucz}`,
        rola: konto.rola,
        status: konto.status,
        must_change_password: konto.zmiana,
      },
      { onConflict: "id" },
    );
    if (error) throw error;
    wynik[klucz] = id;
  }
  return wynik;
}
```
(Typy `Database` mają `profiles` dopiero po zadaniu 3. Do tego czasu `npm run typecheck` może zgłaszać błędy w tym pliku, a `npm test` ich nie sprawdza.)

- [ ] **Step 11: Stan wyjściowy jakości.** Uruchom i zapisz wyniki (do porównań w bramce, zadanie 11):

```bash
npm run lint 2>&1 | tail -15
npm run typecheck 2>&1 | tail -15
npm run build 2>&1 | tail -8
```
Jeśli `typecheck` zgłasza `Cannot find name 'process'`, dodaj `"node"` do `compilerOptions.types` w `tsconfig.json`. Liczbę istniejących błędów lintu i typów wpisz na koniec pliku `docs/superpowers/plans/stan-wyjsciowy-etap-1.md` (jedna linia na komendę) i nie naprawiaj cudzych błędów poza koniecznym minimum.

- [ ] **Step 12: Projekt testowy Supabase (czynność użytkownika).** Poproś użytkownika o:
1. Utworzenie w panelu Supabase drugiego projektu `zgloszenia-awarii-test` (plan darmowy dopuszcza dwa projekty).
2. W tym projekcie: **Authentication → Sign In / Providers → wyłączyć „Allow new users to sign up"** (publiczna rejestracja).
3. Skopiowanie `.env.test.example` do `.env.test` i wpisanie URL, klucza publishable oraz klucza service-role **tego projektu testowego**.
4. Zalogowanie CLI i podłączenie projektu (komendy z `!`, bo są interaktywne):
   `! npx supabase login` oraz `! npx supabase link --project-ref <REF_PROJEKTU_TESTOWEGO>` (zapyta o hasło bazy).
5. Zastosowanie dotychczasowej migracji na pustym projekcie testowym: `! npx supabase db push`.

Expected: `Finished supabase db push.` Sprawdź w panelu Table Editor, że istnieją `awarie`, `urzadzenia`, `pracownicy`.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore vitest.config.ts vitest.rls.config.ts .env.test.example scripts/dev-test.ts tests/wspolne/srodowisko.ts docs/superpowers/plans/stan-wyjsciowy-etap-1.md
git commit -m "Add test tooling: vitest, playwright, supabase cli, test env helpers" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Logika czysta (uprawnienia, hasła, komunikaty błędów)

**Files:**
- Create: `src/lib/uprawnienia.ts`, `src/lib/haslo.ts`, `src/lib/auth-bledy.ts`, `src/lib/kolejka-bledy.ts`
- Test: `tests/unit/uprawnienia.test.ts`, `tests/unit/haslo.test.ts`, `tests/unit/auth-bledy.test.ts`, `tests/unit/kolejka-bledy.test.ts`

**Interfaces:**
- Produces:
  - `ROLE`, `type Rola`, `ETYKIETY_ROL: Record<Rola, string>`, `czyRola(rola: Rola | null | undefined, dozwolone: readonly Rola[]): boolean`
  - `type PozycjaNawigacji = { to: Sciezka; label: string; ikona: IkonaNawigacji; glowna: boolean }`, `pozycjeNawigacji(rola: Rola): PozycjaNawigacji[]`
  - `generujHasloTymczasowe(): string`, `noweHasloSchema` (Zod)
  - `komunikatBleduLogowania(blad: BladAuth): string`
  - `czyDuplikat(blad: { code?: string | undefined } | null | undefined): boolean`

- [ ] **Step 1: Napisz testy uprawnień** `tests/unit/uprawnienia.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { czyRola, pozycjeNawigacji } from "@/lib/uprawnienia";

describe("czyRola", () => {
  it("zwraca true, gdy rola jest na liście", () => {
    expect(czyRola("admin", ["kierownik", "admin"])).toBe(true);
  });
  it("zwraca false dla roli spoza listy", () => {
    expect(czyRola("technik", ["kierownik", "admin"])).toBe(false);
  });
  it("zwraca false, gdy nie ma roli", () => {
    expect(czyRola(null, ["admin"])).toBe(false);
    expect(czyRola(undefined, ["admin"])).toBe(false);
  });
});

describe("pozycjeNawigacji", () => {
  const etykiety = (r: Parameters<typeof pozycjeNawigacji>[0]) => pozycjeNawigacji(r).map((p) => p.label);

  it("pracownik: Zgłoś i Moje", () => expect(etykiety("pracownik")).toEqual(["Zgłoś", "Moje"]));
  it("technik: Zgłoś i Awarie", () => expect(etykiety("technik")).toEqual(["Zgłoś", "Awarie"]));
  it("kierownik: Zgłoś jest drugi z czterech", () => {
    expect(etykiety("kierownik")).toEqual(["Awarie", "Zgłoś", "Analizy", "Eksport"]);
  });
  it("admin: Zgłoś pośrodku pięciu", () => {
    expect(etykiety("admin")).toEqual(["Awarie", "Analizy", "Zgłoś", "Eksport", "Admin"]);
  });
  it("dokładnie jedna pozycja główna (Zgłoś)", () => {
    for (const rola of ["pracownik", "technik", "kierownik", "admin"] as const) {
      const glowne = pozycjeNawigacji(rola).filter((p) => p.glowna);
      expect(glowne).toHaveLength(1);
      expect(glowne[0]?.to).toBe("/");
    }
  });
});
```

- [ ] **Step 2: Uruchom, potwierdź, że test pada**

Run: `npx vitest run tests/unit/uprawnienia.test.ts`
Expected: FAIL (`Failed to resolve import "@/lib/uprawnienia"`).

- [ ] **Step 3: Zaimplementuj `src/lib/uprawnienia.ts`**

```ts
export const ROLE = ["pracownik", "technik", "kierownik", "admin"] as const;
export type Rola = (typeof ROLE)[number];

export const ETYKIETY_ROL: Record<Rola, string> = {
  pracownik: "Pracownik",
  technik: "Technik",
  kierownik: "Kierownik",
  admin: "Administrator",
};

export function czyRola(rola: Rola | null | undefined, dozwolone: readonly Rola[]): boolean {
  return rola != null && dozwolone.includes(rola);
}

export type Sciezka = "/" | "/awarie" | "/dashboard" | "/eksport" | "/admin/uzytkownicy";
export type IkonaNawigacji = "zglos" | "lista" | "analizy" | "eksport" | "admin";
export type PozycjaNawigacji = { to: Sciezka; label: string; ikona: IkonaNawigacji; glowna: boolean };

const poz = (to: Sciezka, label: string, ikona: IkonaNawigacji): PozycjaNawigacji => ({
  to,
  label,
  ikona,
  glowna: false,
});

const ZGLOS: PozycjaNawigacji = { to: "/", label: "Zgłoś", ikona: "zglos", glowna: true };

function pozostale(rola: Rola): PozycjaNawigacji[] {
  switch (rola) {
    case "pracownik":
      return [poz("/awarie", "Moje", "lista")];
    case "technik":
      return [poz("/awarie", "Awarie", "lista")];
    case "kierownik":
      return [poz("/awarie", "Awarie", "lista"), poz("/dashboard", "Analizy", "analizy"), poz("/eksport", "Eksport", "eksport")];
    case "admin":
      return [
        poz("/awarie", "Awarie", "lista"),
        poz("/dashboard", "Analizy", "analizy"),
        poz("/eksport", "Eksport", "eksport"),
        poz("/admin/uzytkownicy", "Admin", "admin"),
      ];
  }
}

/** Przycisk „Zgłoś" trafia w środek paska: na indeks floor(liczba_pozostałych / 2). */
export function pozycjeNawigacji(rola: Rola): PozycjaNawigacji[] {
  const inne = pozostale(rola);
  const indeks = Math.floor(inne.length / 2);
  return [...inne.slice(0, indeks), ZGLOS, ...inne.slice(indeks)];
}
```

- [ ] **Step 4: Uruchom testy uprawnień.** Run: `npx vitest run tests/unit/uprawnienia.test.ts` — Expected: PASS (8 testów).

- [ ] **Step 5: Napisz testy haseł** `tests/unit/haslo.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { generujHasloTymczasowe, noweHasloSchema } from "@/lib/haslo";

const FORMAT = /^[A-HJ-NP-Za-km-np-z2-9]{4}-[A-HJ-NP-Za-km-np-z2-9]{4}-[A-HJ-NP-Za-km-np-z2-9]{4}$/;

describe("generujHasloTymczasowe", () => {
  it("ma format XXXX-XXXX-XXXX bez znaków mylących (0 O 1 l I)", () => {
    for (let i = 0; i < 200; i++) expect(generujHasloTymczasowe()).toMatch(FORMAT);
  });
  it("generuje różne hasła", () => {
    const hasla = new Set(Array.from({ length: 50 }, generujHasloTymczasowe));
    expect(hasla.size).toBe(50);
  });
});

describe("noweHasloSchema", () => {
  it("odrzuca hasło krótsze niż 12 znaków", () => {
    const wynik = noweHasloSchema.safeParse("a".repeat(11));
    expect(wynik.success).toBe(false);
    if (!wynik.success) expect(wynik.error.issues[0]?.message).toBe("Hasło musi mieć co najmniej 12 znaków.");
  });
  it("akceptuje hasło 12-znakowe", () => {
    expect(noweHasloSchema.safeParse("a".repeat(12)).success).toBe(true);
  });
  it("odrzuca hasło dłuższe niż 72 znaki", () => {
    expect(noweHasloSchema.safeParse("a".repeat(73)).success).toBe(false);
  });
});
```

- [ ] **Step 6: Uruchom, potwierdź FAIL.** Run: `npx vitest run tests/unit/haslo.test.ts` — Expected: FAIL (brak modułu).

- [ ] **Step 7: Zaimplementuj `src/lib/haslo.ts`**

```ts
import { z } from "zod";

// Bez znaków łatwych do pomylenia: 0 O 1 l I.
const ALFABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const DLUGOSC = 12;

/** Hasło tymczasowe XXXX-XXXX-XXXX z CSPRNG (odrzucanie próbek eliminuje obciążenie modulo). */
export function generujHasloTymczasowe(): string {
  const limit = 256 - (256 % ALFABET.length);
  const znaki: string[] = [];
  while (znaki.length < DLUGOSC) {
    for (const bajt of crypto.getRandomValues(new Uint8Array(24))) {
      if (bajt < limit && znaki.length < DLUGOSC) znaki.push(ALFABET[bajt % ALFABET.length] as string);
    }
  }
  const tekst = znaki.join("");
  return `${tekst.slice(0, 4)}-${tekst.slice(4, 8)}-${tekst.slice(8, 12)}`;
}

export const noweHasloSchema = z
  .string()
  .min(12, "Hasło musi mieć co najmniej 12 znaków.")
  .max(72, "Hasło może mieć najwyżej 72 znaki.");
```

- [ ] **Step 8: Uruchom.** Run: `npx vitest run tests/unit/haslo.test.ts` — Expected: PASS (5 testów).

- [ ] **Step 9: Napisz testy komunikatów i duplikatów** `tests/unit/auth-bledy.test.ts` oraz `tests/unit/kolejka-bledy.test.ts`

```ts
// tests/unit/auth-bledy.test.ts
import { describe, expect, it } from "vitest";
import { komunikatBleduLogowania } from "@/lib/auth-bledy";

describe("komunikatBleduLogowania", () => {
  it("błędne dane", () => {
    expect(komunikatBleduLogowania({ code: "invalid_credentials", status: 400 })).toBe("Nieprawidłowy e-mail lub hasło.");
  });
  it("limit prób", () => {
    expect(komunikatBleduLogowania({ code: "over_request_rate_limit" })).toBe("Zbyt wiele prób. Spróbuj ponownie za chwilę.");
    expect(komunikatBleduLogowania({ status: 429 })).toBe("Zbyt wiele prób. Spróbuj ponownie za chwilę.");
  });
  it("brak sieci", () => {
    expect(komunikatBleduLogowania({ name: "AuthRetryableFetchError", status: 0 })).toBe("Brak połączenia z internetem.");
  });
  it("nieznany błąd", () => {
    expect(komunikatBleduLogowania({})).toBe("Nie udało się zalogować. Spróbuj ponownie.");
  });
});
```

```ts
// tests/unit/kolejka-bledy.test.ts
import { describe, expect, it } from "vitest";
import { czyDuplikat } from "@/lib/kolejka-bledy";

describe("czyDuplikat", () => {
  it("rozpoznaje naruszenie unikalności Postgresa (23505)", () => {
    expect(czyDuplikat({ code: "23505" })).toBe(true);
  });
  it("inne błędy i brak błędu to nie duplikat", () => {
    expect(czyDuplikat({ code: "42501" })).toBe(false);
    expect(czyDuplikat(null)).toBe(false);
    expect(czyDuplikat(undefined)).toBe(false);
  });
});
```

- [ ] **Step 10: Uruchom, potwierdź FAIL.** Run: `npx vitest run tests/unit/auth-bledy.test.ts tests/unit/kolejka-bledy.test.ts` — Expected: FAIL (brak modułów).

- [ ] **Step 11: Zaimplementuj oba moduły**

```ts
// src/lib/auth-bledy.ts
export type BladAuth = {
  code?: string | undefined;
  status?: number | undefined;
  name?: string | undefined;
};

export function komunikatBleduLogowania(blad: BladAuth): string {
  if (blad.code === "invalid_credentials") return "Nieprawidłowy e-mail lub hasło.";
  if (blad.code === "over_request_rate_limit" || blad.status === 429) {
    return "Zbyt wiele prób. Spróbuj ponownie za chwilę.";
  }
  if (blad.name === "AuthRetryableFetchError" || blad.status === 0) return "Brak połączenia z internetem.";
  return "Nie udało się zalogować. Spróbuj ponownie.";
}
```

```ts
// src/lib/kolejka-bledy.ts
/** Powtórzone wstawienie tego samego zgłoszenia (np. po zgubionej odpowiedzi) traktujemy jak sukces. */
export function czyDuplikat(blad: { code?: string | undefined } | null | undefined): boolean {
  return blad?.code === "23505";
}
```

- [ ] **Step 12: Uruchom cały zestaw jednostkowy.** Run: `npm test` — Expected: PASS (wszystkie 4 pliki, 15 testów).

- [ ] **Step 13: Commit**

```bash
git add src/lib/uprawnienia.ts src/lib/haslo.ts src/lib/auth-bledy.ts src/lib/kolejka-bledy.ts tests/unit
git commit -m "Add pure logic: roles, navigation, temp password, error messages" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Migracja bazy, testy RLS i regeneracja typów

**Files:**
- Create: `supabase/migrations/20260921120000_etap1_profiles_rls.sql`, `tests/rls/macierz.test.ts`
- Modify: `src/integrations/supabase/types.ts` (regeneracja), specyfikacja (kolumna `email`)

**Interfaces:**
- Consumes: `tests/wspolne/srodowisko.ts` (`przygotujKonta`, `klientAdmin`, `klientAnon`, `zaloguj`, `KONTA`).
- Produces (SQL): typy `rola_uzytkownika`, `status_uzytkownika`; tabela `profiles(id, email, imie_nazwisko, rola, status, must_change_password, created_at)`; funkcje `moja_rola()` (zwraca rolę tylko dla konta aktywnego i bez wymuszonej zmiany hasła, inaczej `NULL`) oraz `mam_role(rola_uzytkownika[])`; kolumny `awarie.zglaszajacy_id` (→ `profiles`) i `awarie.zglaszajacy_nazwa`.

- [ ] **Step 1: Napisz test macierzy RLS** `tests/rls/macierz.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  KONTA,
  klientAdmin,
  klientAnon,
  przygotujKonta,
  zaloguj,
  type KluczKonta,
} from "../wspolne/srodowisko";

const ZNACZNIK = `TEST-RLS-${crypto.randomUUID()}`;
const admin = klientAdmin();
let id: Record<KluczKonta, string>;
let awariaPracownika: string;
let awariaPracownika2: string;

async function wstaw(zglaszajacy: string, nazwa: string): Promise<string> {
  const rekord = {
    id: crypto.randomUUID(),
    nr_technologiczny: "HVAC-01",
    nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
    opis_awarii: `${ZNACZNIK} ${nazwa}`,
    krytycznosc_skutku: "Niska",
    status: "Otwarta",
    zglaszajacy_id: zglaszajacy,
    zglaszajacy_nazwa: nazwa,
  };
  const { error } = await admin.from("awarie").insert(rekord);
  if (error) throw error;
  return rekord.id;
}

beforeAll(async () => {
  id = await przygotujKonta();
  awariaPracownika = await wstaw(id.pracownik, "Test pracownik");
  awariaPracownika2 = await wstaw(id.pracownik2, "Test pracownik2");
});

afterAll(async () => {
  await admin.from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
});

const moje = (k: Awaited<ReturnType<typeof zaloguj>>) =>
  k.from("awarie").select("id").like("opis_awarii", `${ZNACZNIK}%`);

describe("anon", () => {
  it("nie ma dostępu do awarii, urządzeń ani profili", async () => {
    const anon = klientAnon();
    for (const tabela of ["awarie", "urzadzenia", "profiles"] as const) {
      const { error } = await anon.from(tabela).select("*").limit(1);
      expect(error?.code, tabela).toBe("42501");
    }
  });
  it("nie może zgłosić awarii", async () => {
    const { error } = await klientAnon().from("awarie").insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "x",
      opis_awarii: `${ZNACZNIK} anon`,
      krytycznosc_skutku: "Niska",
    });
    expect(error?.code).toBe("42501");
  });
  it("nie może się zarejestrować (publiczna rejestracja wyłączona)", async () => {
    const { error } = await klientAnon().auth.signUp({
      email: `rejestracja-${crypto.randomUUID()}@example.test`,
      password: "Test-Haslo-12345!",
    });
    expect(error).not.toBeNull();
  });
});

describe("pracownik", () => {
  it("widzi tylko własne zgłoszenia", async () => {
    const k = await zaloguj(KONTA.pracownik.email);
    const { data } = await moje(k);
    expect(data?.map((r) => r.id)).toEqual([awariaPracownika]);
  });
  it("zgłasza awarię, a autor jest ustawiany z konta (podmiana ignorowana)", async () => {
    const k = await zaloguj(KONTA.pracownik.email);
    const { data, error } = await k
      .from("awarie")
      .insert({
        nr_technologiczny: "HVAC-01",
        nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
        opis_awarii: `${ZNACZNIK} podmiana autora`,
        krytycznosc_skutku: "Niska",
        zglaszajacy_id: id.pracownik2,
        zglaszajacy_nazwa: "Ktoś Inny",
      })
      .select("id, zglaszajacy_id, zglaszajacy_nazwa")
      .single();
    expect(error).toBeNull();
    expect(data?.zglaszajacy_id).toBe(id.pracownik);
    expect(data?.zglaszajacy_nazwa).toBe("Test pracownik");
  });
  it("nie może zmieniać zgłoszeń", async () => {
    const k = await zaloguj(KONTA.pracownik.email);
    const { data } = await k.from("awarie").update({ status: "Zamknieta" }).eq("id", awariaPracownika).select();
    expect(data).toEqual([]);
    const { data: po } = await admin.from("awarie").select("status").eq("id", awariaPracownika).single();
    expect(po?.status).toBe("Otwarta");
  });
  it("czyta tylko własny profil i nie zmieni sobie roli", async () => {
    const k = await zaloguj(KONTA.pracownik.email);
    const { data } = await k.from("profiles").select("id");
    expect(data?.map((p) => p.id)).toEqual([id.pracownik]);
    const { error } = await k.from("profiles").update({ rola: "admin" }).eq("id", id.pracownik);
    expect(error?.code).toBe("42501");
  });
  it("czyta urządzenia, ale ich nie dodaje", async () => {
    const k = await zaloguj(KONTA.pracownik.email);
    const { data } = await k.from("urzadzenia").select("nr_technologiczny");
    expect((data ?? []).length).toBeGreaterThan(0);
    const { error } = await k.from("urzadzenia").insert({ nr_technologiczny: "X-99", nazwa_urzadzenia: "x" });
    expect(error?.code).toBe("42501");
  });
});

describe("technik, kierownik, admin", () => {
  for (const klucz of ["technik", "kierownik", "admin"] as const) {
    it(`${klucz} widzi wszystkie zgłoszenia`, async () => {
      const k = await zaloguj(KONTA[klucz].email);
      const { data } = await moje(k);
      const ids = data?.map((r) => r.id) ?? [];
      expect(ids).toContain(awariaPracownika);
      expect(ids).toContain(awariaPracownika2);
    });
  }
  it("technik zamyka awarię, ale nie podmieni zgłaszającego", async () => {
    const k = await zaloguj(KONTA.technik.email);
    const { data, error } = await k
      .from("awarie")
      .update({ status: "Zamknieta", zglaszajacy_id: id.technik, zglaszajacy_nazwa: "Podmiana" })
      .eq("id", awariaPracownika)
      .select("status, zglaszajacy_id, zglaszajacy_nazwa")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("Zamknieta");
    expect(data?.zglaszajacy_id).toBe(id.pracownik);
    expect(data?.zglaszajacy_nazwa).toBe("Test pracownik");
    await admin.from("awarie").update({ status: "Otwarta" }).eq("id", awariaPracownika);
  });
  it("technik czyta tylko własny profil, admin wszystkie", async () => {
    const t = await zaloguj(KONTA.technik.email);
    const { data: dt } = await t.from("profiles").select("id");
    expect(dt?.map((p) => p.id)).toEqual([id.technik]);
    const a = await zaloguj(KONTA.admin.email);
    const { data: da } = await a.from("profiles").select("id");
    expect((da ?? []).length).toBeGreaterThanOrEqual(7);
  });
  it("admin nie zmienia profili bezpośrednio z klienta (tylko przez funkcje serwerowe)", async () => {
    const a = await zaloguj(KONTA.admin.email);
    const { error } = await a.from("profiles").update({ rola: "technik" }).eq("id", id.pracownik);
    expect(error?.code).toBe("42501");
  });
});

describe("konta bez dostępu do danych", () => {
  for (const klucz of ["zmianaHasla", "zablokowany"] as const) {
    it(`${klucz}: nie widzi awarii ani urządzeń, ale czyta własny profil`, async () => {
      const k = await zaloguj(KONTA[klucz].email);
      const { data: aw } = await moje(k);
      expect(aw).toEqual([]);
      const { data: urz } = await k.from("urzadzenia").select("nr_technologiczny");
      expect(urz).toEqual([]);
      const { data: prof } = await k.from("profiles").select("id, status, must_change_password");
      expect(prof).toHaveLength(1);
      expect(prof?.[0]?.id).toBe(id[klucz]);
    });
    it(`${klucz}: nie może zgłosić awarii`, async () => {
      const k = await zaloguj(KONTA[klucz].email);
      const { error } = await k.from("awarie").insert({
        nr_technologiczny: "HVAC-01",
        nazwa_urzadzenia: "x",
        opis_awarii: `${ZNACZNIK} zablokowany`,
        krytycznosc_skutku: "Niska",
      });
      expect(error).not.toBeNull();
    });
  }
});

describe("ostatni admin", () => {
  it("nie można zdegradować ostatniego aktywnego admina", async () => {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("rola", "admin")
      .eq("status", "aktywny");
    expect(count, "Projekt testowy musi mieć dokładnie jednego aktywnego admina").toBe(1);
    const { error } = await admin.from("profiles").update({ rola: "technik" }).eq("id", id.admin);
    expect(error?.message).toContain("ostatniego");
  });
});
```

- [ ] **Step 2: Uruchom, potwierdź FAIL**

Run: `npm run test:rls`
Expected: FAIL (m.in. brak tabeli `profiles`; `przygotujKonta` rzuca błąd w `beforeAll`).

- [ ] **Step 3: Napisz migrację** `supabase/migrations/20260921120000_etap1_profiles_rls.sql`

```sql
-- Etap 1: konta użytkowników (profiles), zamknięcie RLS, autor zgłoszenia z auth.uid().

create type public.rola_uzytkownika as enum ('pracownik', 'technik', 'kierownik', 'admin');
create type public.status_uzytkownika as enum ('aktywny', 'zablokowany');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  imie_nazwisko text not null check (char_length(btrim(imie_nazwisko)) between 2 and 120),
  rola public.rola_uzytkownika not null default 'pracownik',
  status public.status_uzytkownika not null default 'aktywny',
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- Rola bieżącego użytkownika. NULL, gdy konto jest zablokowane albo czeka na zmianę hasła
-- (wtedy żadna polityka oparta na roli nie przepuści zapytania).
create or replace function public.moja_rola()
returns public.rola_uzytkownika
language sql stable security definer set search_path = public as $$
  select p.rola from public.profiles p
  where p.id = auth.uid() and p.status = 'aktywny' and not p.must_change_password
$$;

create or replace function public.mam_role(dozwolone public.rola_uzytkownika[])
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.moja_rola() = any (dozwolone), false)
$$;

revoke all on function public.moja_rola() from public, anon;
revoke all on function public.mam_role(public.rola_uzytkownika[]) from public, anon;
grant execute on function public.moja_rola() to authenticated, service_role;
grant execute on function public.mam_role(public.rola_uzytkownika[]) to authenticated, service_role;

-- Własny profil zawsze czytelny (interfejs musi wiedzieć, że trzeba zmienić hasło); admin czyta wszystkie.
create policy profiles_select_wlasny on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.mam_role(array['admin']::public.rola_uzytkownika[]));

-- Ostatni aktywny admin nie może zostać zdegradowany, zablokowany ani usunięty.
create or replace function public.profiles_pilnuj_ostatniego_admina()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pozostalo integer;
begin
  if old.rola = 'admin' and old.status = 'aktywny'
     and (tg_op = 'DELETE' or new.rola <> 'admin' or new.status <> 'aktywny') then
    select count(*) into pozostalo from public.profiles
      where rola = 'admin' and status = 'aktywny' and id <> old.id;
    if pozostalo = 0 then
      raise exception 'Nie można zdegradować, zablokować ani usunąć ostatniego aktywnego administratora';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger profiles_ostatni_admin
  before update or delete on public.profiles
  for each row execute function public.profiles_pilnuj_ostatniego_admina();

-- awarie: autor z konta zamiast wyboru z listy pracowników.
alter table public.awarie add column zglaszajacy_nazwa text;
update public.awarie a set zglaszajacy_nazwa = p.imie_nazwisko
  from public.pracownicy p where a.osoba_zglaszajaca_id = p.id;
drop table public.pracownicy cascade;
update public.awarie set osoba_zglaszajaca_id = null;
alter table public.awarie rename column osoba_zglaszajaca_id to zglaszajacy_id;
alter table public.awarie
  add constraint awarie_zglaszajacy_id_fkey foreign key (zglaszajacy_id)
  references public.profiles (id) on delete set null;

-- Autora ustawia baza. Wartości od klienta są ignorowane, a przy edycji autor jest niezmienny.
create or replace function public.awarie_pilnuj_zglaszajacego()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.zglaszajacy_id := auth.uid();
      select imie_nazwisko into new.zglaszajacy_nazwa from public.profiles where id = auth.uid();
    else
      new.zglaszajacy_id := old.zglaszajacy_id;
      new.zglaszajacy_nazwa := old.zglaszajacy_nazwa;
    end if;
  end if;
  return new;
end
$$;

create trigger awarie_zglaszajacy
  before insert or update on public.awarie
  for each row execute function public.awarie_pilnuj_zglaszajacego();

-- Zamknięcie RLS: koniec z dostępem anonimowym.
drop policy "awarie_read_all" on public.awarie;
drop policy "awarie_insert_all" on public.awarie;
drop policy "awarie_update_all" on public.awarie;
drop policy "urzadzenia_read_all" on public.urzadzenia;

revoke all on public.awarie from anon, authenticated;
grant select, insert, update on public.awarie to authenticated;
revoke all on public.urzadzenia from anon, authenticated;
grant select on public.urzadzenia to authenticated;

create policy awarie_select on public.awarie for select to authenticated using (
  public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[])
  or (public.moja_rola() is not null and zglaszajacy_id = auth.uid())
);
create policy awarie_insert on public.awarie for insert to authenticated
  with check (public.moja_rola() is not null);
create policy awarie_update on public.awarie for update to authenticated
  using (public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[]))
  with check (public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[]));

create policy urzadzenia_select on public.urzadzenia for select to authenticated
  using (public.moja_rola() is not null);
```

- [ ] **Step 4: Zastosuj migrację na projekcie testowym (czynność użytkownika)**

`! npx supabase db push` (projekt testowy jest podłączony z zadania 1). Expected: `Applying migration 20260921120000_etap1_profiles_rls.sql... Finished supabase db push.`
Następnie poproś użytkownika o sprawdzenie w panelu testowego projektu, że w **Authentication → Sign In / Providers** rejestracja nadal jest wyłączona.

- [ ] **Step 5: Zregeneruj typy z projektu testowego**

```bash
npx supabase gen types typescript --project-id <REF_PROJEKTU_TESTOWEGO> --schema public > src/integrations/supabase/types.ts
```
Expected: plik zawiera `profiles`, `rola_uzytkownika`, `zglaszajacy_id`, a nie zawiera `pracownicy`. Plik przestaje mieć nagłówek „automatycznie generowany"; dopisz na jego początku komentarz `// Wygenerowano: npx supabase gen types typescript --project-id <ref> --schema public`.

- [ ] **Step 6: Uruchom testy RLS.** Run: `npm run test:rls` — Expected: PASS (wszystkie testy `macierz.test.ts`). Jeśli test „nie może się zarejestrować" pada, rejestracja nie jest wyłączona w projekcie testowym: wróć do kroku 4.

- [ ] **Step 7: Popraw specyfikację (kolumna `email`).** W `docs/superpowers/specs/2026-09-21-rozbudowa-obsluga-awarii-design.md`:
  - w sekcji 5, w opisie `profiles`, zmień `- **`profiles`**: `id` (= `auth.users.id`), `imie_nazwisko`,` na `- **`profiles`**: `id` (= `auth.users.id`), `email` (kopia informacyjna z chwili utworzenia konta), `imie_nazwisko`,`;
  - w sekcji 7 zmień zdanie „Kolumny e-mail z arkuszy są pomijane (adresy żyją tylko w Supabase Auth)." na „Kolumny e-mail z arkuszy są pomijane (adres konta pochodzi z `profiles.email`)."

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260921120000_etap1_profiles_rls.sql tests/rls/macierz.test.ts src/integrations/supabase/types.ts docs/superpowers/specs/2026-09-21-rozbudowa-obsluga-awarii-design.md
git commit -m "Add profiles, role-based RLS and author triggers with RLS matrix tests" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Dostosowanie istniejącego kodu do nowego schematu

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/queries.ts`, `src/lib/offline.ts`, `src/routes/index.tsx`, `src/routes/awarie.$id.tsx`, `src/routes/eksport.tsx`
- Test: `npm run typecheck` (bez nowych błędów), `npm test`

**Interfaces:**
- Consumes: `czyDuplikat` z zadania 2; zregenerowane typy z zadania 3.
- Produces: `Awaria` z polami `zglaszajacy_id: string | null` i `zglaszajacy_nazwa: string | null`; brak `Pracownik` i `pracownicyQuery`.

- [ ] **Step 1: `src/lib/types.ts`**: usuń typ `Pracownik`, a w `Awaria` zamień pole `osoba_zglaszajaca_id: string | null;` na

```ts
  zglaszajacy_id: string | null;
  zglaszajacy_nazwa: string | null;
```

- [ ] **Step 2: `src/lib/queries.ts`**: usuń import typu `Pracownik` i cały blok `pracownicyQuery`. Import ma wyglądać tak:

```ts
import type { AwariaLokalna, Urzadzenie } from "./types";
```

- [ ] **Step 3: `src/routes/index.tsx`** (zgłoszenie): usuń import `pracownicyQuery`, zapytanie `pracownicy`, stan `osoba`, cały blok `<div>` z polem „Osoba zgłaszająca" oraz wymóg osoby w walidacji. Zmiany:
  - import: `import { urzadzeniaQuery } from "@/lib/queries";`
  - usuń `const { data: pracownicy = [] } = useQuery(pracownicyQuery);` i `const [osoba, setOsoba] = useState("");`
  - walidacja: `if (!urzadzenie || !opis.trim()) { toast.error("Uzupełnij urządzenie i opis awarii."); return; }`
  - w obiekcie przekazywanym do `zapiszAwarie` zamień `osoba_zglaszajaca_id: osoba,` na

```ts
      zglaszajacy_id: null, // ustawia baza z konta (trigger), wartość od klienta jest ignorowana
      zglaszajacy_nazwa: null,
```

- [ ] **Step 4: `src/routes/awarie.$id.tsx`**: usuń import i użycie `pracownicyQuery`; zamień linię z `const osoba = ...` na

```ts
  const osoba = awaria.zglaszajacy_nazwa ?? "—";
```
oraz import na `import { awarieQuery } from "@/lib/queries";`.

- [ ] **Step 5: `src/routes/eksport.tsx`**: usuń import i zapytanie `pracownicyQuery`; import `import { awarieQuery } from "@/lib/queries";`; zamień pole autora w wierszu na `pole(a.zglaszajacy_nazwa),`.

- [ ] **Step 6: `src/lib/offline.ts`**: (a) dodaj import `import { czyDuplikat } from "./kolejka-bledy";`; (b) w `syncQueue` przed `syncing = true;` sprawdź sesję, a wstawienie zmień z `upsert` na `insert` z tolerancją duplikatu:

```ts
export async function syncQueue(): Promise<number> {
  if (syncing || typeof navigator === "undefined" || !navigator.onLine) return 0;
  const { data: sesja } = await supabase.auth.getSession();
  if (!sesja.session) return 0; // bez zalogowania kolejka czeka, nic nie ginie
  syncing = true;
  let done = 0;
  try {
    const ops = await getQueue();
    for (const op of ops) {
      if (op.type === "insert") {
        const { error } = await supabase.from("awarie").insert(op.payload);
        if (error && !czyDuplikat(error)) break;
      } else {
        const { id, ...rest } = op.payload;
        const { error } = await supabase.from("awarie").update(rest).eq("id", id);
        if (error) break;
      }
      await remove(op.opId);
      done++;
    }
  } finally {
    syncing = false;
    if (done > 0) window.dispatchEvent(new Event("queue-changed"));
  }
  return done;
}
```
Powód `insert` zamiast `upsert`: `upsert` wymaga też polityki UPDATE, której pracownik nie ma.

- [ ] **Step 7: Sprawdź**

Run: `npm run typecheck && npm test`
Expected: brak nowych błędów typów względem stanu wyjściowego; testy jednostkowe zielone. Jeśli w `src/integrations/supabase/types.ts` pojawią się błędy zaczynające się od nieznanych flag, zostaw plik w wersji wygenerowanej.

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/queries.ts src/lib/offline.ts src/routes/index.tsx src/routes/awarie.\$id.tsx src/routes/eksport.tsx
git commit -m "Adapt app code to profiles schema and make queue sync auth-aware" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Logika kont po stronie serwera

**Files:**
- Create: `src/lib/uzytkownicy.schemas.ts`, `src/lib/uzytkownicy.server.ts`, `src/lib/uzytkownicy.functions.ts`
- Test: `tests/rls/uzytkownicy.server.test.ts`

**Interfaces:**
- Consumes: `generujHasloTymczasowe`, `noweHasloSchema` (`haslo.ts`); `ROLE`, `Rola` (`uprawnienia.ts`); `requireSupabaseAuth` (istniejący, daje `context.userId`); `Database` (typy).
- Produces:
  - `type Wynik<T> = { ok: true; dane: T } | { ok: false; komunikat: string }` (w `uzytkownicy.schemas.ts`)
  - Schematy Zod: `nowyUzytkownikSchema`, `idUzytkownikaSchema`, `zmianaProfiluSchema`, `noweHasloWejscieSchema`
  - Serwer (`uzytkownicy.server.ts`): `class BladBiznesowy extends Error`; `wymagajAdmina(admin, aktorId)`; `utworzKonto(admin, aktorId, wej) => { id, email, hasloTymczasowe }`; `resetujHaslo(admin, aktorId, userId) => { hasloTymczasowe }`; `zmienRoleLubStatus(admin, aktorId, wej)`; `zmienWlasneHaslo(admin, userId, noweHaslo)`; `czyHasloPasuje(email, haslo)`; `bezpiecznie(fn) => Promise<Wynik<T>>`
  - Funkcje serwerowe (klient): `utworzKontoFn`, `resetujHasloFn`, `zmienRoleLubStatusFn`, `zmienWlasneHasloFn` (wszystkie zwracają `Wynik<...>`).

- [ ] **Step 1: Utwórz `src/lib/uzytkownicy.schemas.ts`**

```ts
import { z } from "zod";
import { noweHasloSchema } from "./haslo";
import { ROLE } from "./uprawnienia";

export type Wynik<T> = { ok: true; dane: T } | { ok: false; komunikat: string };

export const nowyUzytkownikSchema = z.object({
  email: z.string().trim().toLowerCase().email("Podaj poprawny adres e-mail.").max(200),
  imieNazwisko: z.string().trim().min(2, "Podaj imię i nazwisko.").max(120),
  rola: z.enum(ROLE),
});

export const idUzytkownikaSchema = z.object({ userId: z.string().uuid() });

export const zmianaProfiluSchema = z.object({
  userId: z.string().uuid(),
  rola: z.enum(ROLE).optional(),
  status: z.enum(["aktywny", "zablokowany"]).optional(),
});

export const noweHasloWejscieSchema = z.object({ noweHaslo: noweHasloSchema });

export type NowyUzytkownik = z.infer<typeof nowyUzytkownikSchema>;
export type ZmianaProfilu = z.infer<typeof zmianaProfiluSchema>;
```

- [ ] **Step 2: Napisz testy** `tests/rls/uzytkownicy.server.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { klientAdmin, przygotujKonta, type KluczKonta } from "../wspolne/srodowisko";
import {
  BladBiznesowy,
  czyHasloPasuje,
  resetujHaslo,
  utworzKonto,
  zmienRoleLubStatus,
  zmienWlasneHaslo,
} from "@/lib/uzytkownicy.server";

const admin = klientAdmin();
let ids: Record<KluczKonta, string>;
const utworzone: string[] = [];

const nowyEmail = () => `nowy-${crypto.randomUUID()}@example.test`;

async function nowyUzytkownik(rola: "pracownik" | "technik" = "technik") {
  const email = nowyEmail();
  const konto = await utworzKonto(admin, ids.admin, { email, imieNazwisko: "Nowy Użytkownik", rola });
  utworzone.push(konto.id);
  return { ...konto, email };
}

beforeAll(async () => {
  ids = await przygotujKonta();
});

afterAll(async () => {
  for (const id of utworzone) await admin.auth.admin.deleteUser(id);
});

describe("utworzKonto", () => {
  it("tworzy konto z hasłem tymczasowym i wymuszoną zmianą hasła", async () => {
    const konto = await nowyUzytkownik("technik");
    const { data: profil } = await admin.from("profiles").select("*").eq("id", konto.id).single();
    expect(profil).toMatchObject({
      rola: "technik",
      status: "aktywny",
      must_change_password: true,
      email: konto.email,
      imie_nazwisko: "Nowy Użytkownik",
    });
    expect(await czyHasloPasuje(konto.email, konto.hasloTymczasowe)).toBe(true);
  });
  it("odrzuca zajęty e-mail", async () => {
    const konto = await nowyUzytkownik();
    await expect(
      utworzKonto(admin, ids.admin, { email: konto.email, imieNazwisko: "Duplikat", rola: "pracownik" }),
    ).rejects.toThrow("Konto o tym adresie e-mail już istnieje.");
  });
  it("odmawia komuś, kto nie jest adminem", async () => {
    await expect(
      utworzKonto(admin, ids.technik, { email: nowyEmail(), imieNazwisko: "X Y", rola: "pracownik" }),
    ).rejects.toThrow(BladBiznesowy);
  });
  it("odmawia nieistniejącemu aktorowi", async () => {
    await expect(
      utworzKonto(admin, crypto.randomUUID(), { email: nowyEmail(), imieNazwisko: "X Y", rola: "pracownik" }),
    ).rejects.toThrow("Brak uprawnień.");
  });
});

describe("zmienWlasneHaslo", () => {
  it("odrzuca nowe hasło identyczne z dotychczasowym", async () => {
    const konto = await nowyUzytkownik();
    await zmienWlasneHaslo(admin, konto.id, "Pierwsze-haslo-123");
    await expect(zmienWlasneHaslo(admin, konto.id, "Pierwsze-haslo-123")).rejects.toThrow(
      "Nowe hasło musi różnić się od dotychczasowego.",
    );
  });
  it("odrzuca hasło krótsze niż 12 znaków", async () => {
    const konto = await nowyUzytkownik();
    await expect(zmienWlasneHaslo(admin, konto.id, "krotkie")).rejects.toThrow(
      "Hasło musi mieć co najmniej 12 znaków.",
    );
  });
  it("ustawia hasło i zdejmuje wymuszenie zmiany", async () => {
    const konto = await nowyUzytkownik();
    await zmienWlasneHaslo(admin, konto.id, "Moje-nowe-haslo-9");
    const { data } = await admin.from("profiles").select("must_change_password").eq("id", konto.id).single();
    expect(data?.must_change_password).toBe(false);
    expect(await czyHasloPasuje(konto.email, "Moje-nowe-haslo-9")).toBe(true);
    expect(await czyHasloPasuje(konto.email, konto.hasloTymczasowe)).toBe(false);
  });
});

describe("resetujHaslo", () => {
  it("ustawia nowe hasło tymczasowe i wymusza zmianę hasła", async () => {
    const konto = await nowyUzytkownik();
    await zmienWlasneHaslo(admin, konto.id, "Moje-nowe-haslo-9");
    const { hasloTymczasowe } = await resetujHaslo(admin, ids.admin, konto.id);
    expect(await czyHasloPasuje(konto.email, hasloTymczasowe)).toBe(true);
    expect(await czyHasloPasuje(konto.email, "Moje-nowe-haslo-9")).toBe(false);
    const { data } = await admin.from("profiles").select("must_change_password").eq("id", konto.id).single();
    expect(data?.must_change_password).toBe(true);
  });
});

describe("zmienRoleLubStatus", () => {
  it("blokada odbiera możliwość logowania, odblokowanie ją przywraca", async () => {
    const konto = await nowyUzytkownik();
    await zmienRoleLubStatus(admin, ids.admin, { userId: konto.id, status: "zablokowany" });
    expect(await czyHasloPasuje(konto.email, konto.hasloTymczasowe)).toBe(false);
    await zmienRoleLubStatus(admin, ids.admin, { userId: konto.id, status: "aktywny" });
    expect(await czyHasloPasuje(konto.email, konto.hasloTymczasowe)).toBe(true);
  });
  it("zmienia rolę", async () => {
    const konto = await nowyUzytkownik("pracownik");
    await zmienRoleLubStatus(admin, ids.admin, { userId: konto.id, rola: "kierownik" });
    const { data } = await admin.from("profiles").select("rola").eq("id", konto.id).single();
    expect(data?.rola).toBe("kierownik");
  });
  it("nie pozwala zdegradować ostatniego aktywnego admina", async () => {
    await expect(zmienRoleLubStatus(admin, ids.admin, { userId: ids.admin, rola: "technik" })).rejects.toThrow(
      "ostatniego aktywnego administratora",
    );
  });
  it("odmawia nie-adminowi", async () => {
    const konto = await nowyUzytkownik();
    await expect(
      zmienRoleLubStatus(admin, ids.technik, { userId: konto.id, rola: "admin" }),
    ).rejects.toThrow("Brak uprawnień.");
  });
});
```
- [ ] **Step 3: Uruchom, potwierdź FAIL.** Run: `npm run test:rls -- tests/rls/uzytkownicy.server.test.ts` — Expected: FAIL (brak modułu `uzytkownicy.server`).

- [ ] **Step 4: Zaimplementuj `src/lib/uzytkownicy.server.ts`**

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { generujHasloTymczasowe, noweHasloSchema } from "./haslo";
import type { Wynik, NowyUzytkownik, ZmianaProfilu } from "./uzytkownicy.schemas";

type Admin = SupabaseClient<Database>;

/** Błąd, którego komunikat wolno pokazać użytkownikowi. */
export class BladBiznesowy extends Error {
  constructor(komunikat: string) {
    super(komunikat);
    this.name = "BladBiznesowy";
  }
}

/** Rola admina jest sprawdzana w bazie, nie w tokenie: blokada działa od razu. */
export async function wymagajAdmina(admin: Admin, aktorId: string): Promise<void> {
  const { data, error } = await admin
    .from("profiles")
    .select("rola, status, must_change_password")
    .eq("id", aktorId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.rola !== "admin" || data.status !== "aktywny" || data.must_change_password) {
    throw new BladBiznesowy("Brak uprawnień.");
  }
}

/** Sprawdza, czy para e-mail i hasło pozwala się zalogować (klucz publishable, bez zapisu sesji). */
export async function czyHasloPasuje(email: string, haslo: string): Promise<boolean> {
  const url = process.env["SUPABASE_URL"];
  const klucz = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !klucz) throw new Error("Brak SUPABASE_URL lub SUPABASE_PUBLISHABLE_KEY");
  const klient = createClient<Database>(url, klucz, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await klient.auth.signInWithPassword({ email, password: haslo });
  return error === null;
}

export async function utworzKonto(admin: Admin, aktorId: string, wej: NowyUzytkownik) {
  await wymagajAdmina(admin, aktorId);
  const haslo = generujHasloTymczasowe();
  const { data, error } = await admin.auth.admin.createUser({
    email: wej.email,
    password: haslo,
    email_confirm: true,
  });
  if (error || !data.user) {
    if (error?.code === "email_exists") throw new BladBiznesowy("Konto o tym adresie e-mail już istnieje.");
    console.error("utworzKonto: createUser", error?.code);
    throw new BladBiznesowy("Nie udało się utworzyć konta.");
  }
  const { error: bladProfilu } = await admin.from("profiles").insert({
    id: data.user.id,
    email: wej.email,
    imie_nazwisko: wej.imieNazwisko,
    rola: wej.rola,
    status: "aktywny",
    must_change_password: true,
  });
  if (bladProfilu) {
    await admin.auth.admin.deleteUser(data.user.id); // nie zostawiamy konta bez profilu
    console.error("utworzKonto: insert profiles", bladProfilu.code);
    throw new BladBiznesowy("Nie udało się utworzyć profilu użytkownika.");
  }
  return { id: data.user.id, email: wej.email, hasloTymczasowe: haslo };
}

export async function resetujHaslo(admin: Admin, aktorId: string, userId: string) {
  await wymagajAdmina(admin, aktorId);
  const haslo = generujHasloTymczasowe();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: haslo });
  if (error) {
    console.error("resetujHaslo: updateUserById", error.code);
    throw new BladBiznesowy("Nie udało się zresetować hasła.");
  }
  // Wymuszenie zmiany działa od razu: RLS odcina dane, dopóki użytkownik nie ustawi własnego hasła,
  // nawet jeśli jego dotychczasowy token dostępu jeszcze nie wygasł.
  const { error: bladProfilu } = await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
  if (bladProfilu) throw new BladBiznesowy("Nie udało się zresetować hasła.");
  return { hasloTymczasowe: haslo };
}

export async function zmienRoleLubStatus(admin: Admin, aktorId: string, wej: ZmianaProfilu) {
  await wymagajAdmina(admin, aktorId);
  const zapis: { rola?: NonNullable<ZmianaProfilu["rola"]>; status?: NonNullable<ZmianaProfilu["status"]> } = {};
  if (wej.rola) zapis.rola = wej.rola;
  if (wej.status) zapis.status = wej.status;
  if (Object.keys(zapis).length === 0) throw new BladBiznesowy("Brak zmian do zapisania.");

  const { error } = await admin.from("profiles").update(zapis).eq("id", wej.userId);
  if (error) {
    if (error.message.includes("ostatniego aktywnego administratora")) {
      throw new BladBiznesowy("Nie można zdegradować ani zablokować ostatniego aktywnego administratora.");
    }
    console.error("zmienRoleLubStatus: update", error.code);
    throw new BladBiznesowy("Nie udało się zapisać zmian.");
  }
  if (wej.status) {
    // Blokada w Auth zatrzymuje odświeżanie tokenu; RLS odcina dane natychmiast.
    const { error: bladBanu } = await admin.auth.admin.updateUserById(wej.userId, {
      ban_duration: wej.status === "zablokowany" ? "876000h" : "none",
    });
    if (bladBanu) console.error("zmienRoleLubStatus: ban", bladBanu.code);
  }
}

export async function zmienWlasneHaslo(admin: Admin, userId: string, noweHaslo: string): Promise<void> {
  const parsed = noweHasloSchema.safeParse(noweHaslo);
  if (!parsed.success) throw new BladBiznesowy(parsed.error.issues[0]?.message ?? "Nieprawidłowe hasło.");

  const { data: profil } = await admin.from("profiles").select("status").eq("id", userId).maybeSingle();
  if (!profil || profil.status !== "aktywny") throw new BladBiznesowy("Brak uprawnień.");

  const { data: uzytkownik, error } = await admin.auth.admin.getUserById(userId);
  if (error || !uzytkownik.user?.email) throw new BladBiznesowy("Nie udało się zmienić hasła.");
  if (await czyHasloPasuje(uzytkownik.user.email, noweHaslo)) {
    throw new BladBiznesowy("Nowe hasło musi różnić się od dotychczasowego.");
  }

  const { error: bladHasla } = await admin.auth.admin.updateUserById(userId, { password: noweHaslo });
  if (bladHasla) {
    console.error("zmienWlasneHaslo: updateUserById", bladHasla.code);
    throw new BladBiznesowy("Nie udało się zmienić hasła.");
  }
  const { error: bladFlagi } = await admin.from("profiles").update({ must_change_password: false }).eq("id", userId);
  if (bladFlagi) throw new BladBiznesowy("Nie udało się zmienić hasła.");
}

/** Zamienia wyjątek na wynik, który da się bezpiecznie przesłać do klienta. */
export async function bezpiecznie<T>(praca: () => Promise<T>): Promise<Wynik<T>> {
  try {
    return { ok: true, dane: await praca() };
  } catch (e) {
    if (e instanceof BladBiznesowy) return { ok: false, komunikat: e.message };
    console.error("Nieoczekiwany błąd funkcji serwerowej", e);
    return { ok: false, komunikat: "Wystąpił błąd serwera. Spróbuj ponownie." };
  }
}
```

- [ ] **Step 5: Uruchom testy.** Run: `npm run test:rls -- tests/rls/uzytkownicy.server.test.ts` — Expected: PASS (wszystkie testy). Jeśli test blokady pada na `czyHasloPasuje(...) === false` (logowanie po banie nadal działa), sprawdź, że `ban_duration` przyjmuje `"876000h"`; jeśli Supabase go odrzuca (`bladBanu` w logu), zamień na `"87600h"` i powtórz.

- [ ] **Step 6: Utwórz `src/lib/uzytkownicy.functions.ts`** (cienkie opakowania, bez logiki)

```ts
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  idUzytkownikaSchema,
  noweHasloWejscieSchema,
  nowyUzytkownikSchema,
  zmianaProfiluSchema,
} from "./uzytkownicy.schemas";

// Klucz service-role i logika kont ładowane dynamicznie: ten plik trafia do bundla klienta.
async function zaleznosci() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const serwer = await import("./uzytkownicy.server");
  return { admin: supabaseAdmin, ...serwer };
}

export const utworzKontoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => nowyUzytkownikSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, utworzKonto, bezpiecznie } = await zaleznosci();
    return bezpiecznie(() => utworzKonto(admin, context.userId, data));
  });

export const resetujHasloFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idUzytkownikaSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, resetujHaslo, bezpiecznie } = await zaleznosci();
    return bezpiecznie(() => resetujHaslo(admin, context.userId, data.userId));
  });

export const zmienRoleLubStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => zmianaProfiluSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, zmienRoleLubStatus, bezpiecznie } = await zaleznosci();
    return bezpiecznie(() => zmienRoleLubStatus(admin, context.userId, data));
  });

export const zmienWlasneHasloFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => noweHasloWejscieSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { admin, zmienWlasneHaslo, bezpiecznie } = await zaleznosci();
    return bezpiecznie(() => zmienWlasneHaslo(admin, context.userId, data.noweHaslo));
  });
```

- [ ] **Step 7: Sprawdź kompilację i budowanie.** Run: `npm run typecheck && npm run build` — Expected: brak nowych błędów; build nie zgłasza importu `.server` w bundlu klienta. Jeśli `inputValidator` zgłasza niezgodność typów, zostaw funkcję parsującą (jak wyżej) zamiast przekazywania schematu.

- [ ] **Step 8: Commit**

```bash
git add src/lib/uzytkownicy.schemas.ts src/lib/uzytkownicy.server.ts src/lib/uzytkownicy.functions.ts tests/rls/uzytkownicy.server.test.ts
git commit -m "Add admin-only account management: create, reset, role/status, own password" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Sesja, logowanie, zmiana hasła, powłoka aplikacji

**Files:**
- Create: `src/lib/auth.tsx`, `src/components/EkranAuth.tsx`, `src/components/MenuUzytkownika.tsx`, `src/routes/logowanie.tsx`, `src/routes/zmiana-hasla.tsx`, `src/routes/admin.uzytkownicy.tsx` (tymczasowy szkielet, pełna wersja w zadaniu 7)
- Modify: `src/components/AppShell.tsx`, `src/routes/__root.tsx`

**Interfaces:**
- Consumes: `pozycjeNawigacji`, `czyRola`, `ETYKIETY_ROL`, `Rola` (`uprawnienia.ts`); `komunikatBleduLogowania`; `zmienWlasneHasloFn`; `noweHasloSchema`; `getQueue` (`offline.ts`).
- Produces:
  - `type Profil = { id: string; email: string; imie_nazwisko: string; rola: Rola; status: "aktywny" | "zablokowany"; must_change_password: boolean }`
  - `useAuth(): { stan: "ladowanie" } | { stan: "brak" } | { stan: "zalogowany"; profil: Profil }`, każdy wariant z `odswiezProfil(): Promise<void>` i `wyloguj(): Promise<void>`
  - `<AppShell title dozwoloneRole?>`: przekierowuje niezalogowanych na `/logowanie`, a konta z wymuszoną zmianą hasła na `/zmiana-hasla`; przy braku roli pokazuje „Brak dostępu".

- [ ] **Step 1: Utwórz `src/lib/auth.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getQueue } from "@/lib/offline";
import type { Rola } from "./uprawnienia";

export type Profil = {
  id: string;
  email: string;
  imie_nazwisko: string;
  rola: Rola;
  status: "aktywny" | "zablokowany";
  must_change_password: boolean;
};

type Stan = { stan: "ladowanie" } | { stan: "brak" } | { stan: "zalogowany"; profil: Profil };
type Kontekst = Stan & { odswiezProfil: () => Promise<void>; wyloguj: () => Promise<boolean> };

const CACHE = "profil-cache-v1";
const KOLUMNY = "id, email, imie_nazwisko, rola, status, must_change_password";

// Profil w pamięci lokalnej pozwala uruchomić aplikację offline. Służy wyłącznie do wyświetlania:
// o dostępie do danych i tak decyduje RLS.
function odczytajCache(userId: string): Profil | null {
  try {
    const surowy = window.localStorage.getItem(CACHE);
    const profil = surowy ? (JSON.parse(surowy) as Profil) : null;
    return profil?.id === userId ? profil : null;
  } catch {
    return null;
  }
}
function zapiszCache(profil: Profil | null) {
  try {
    if (profil) window.localStorage.setItem(CACHE, JSON.stringify(profil));
    else window.localStorage.removeItem(CACHE);
  } catch {
    /* brak localStorage (tryb prywatny): aplikacja działa dalej */
  }
}

const AuthContext = createContext<Kontekst | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [stan, setStan] = useState<Stan>({ stan: "ladowanie" });

  const wczytaj = useCallback(
    async (userId: string | null) => {
      if (!userId) {
        zapiszCache(null);
        setStan({ stan: "brak" });
        return;
      }
      const { data, error } = await supabase.from("profiles").select(KOLUMNY).eq("id", userId).maybeSingle();
      if (error) {
        const zCache = odczytajCache(userId); // offline lub chwilowy błąd sieci
        setStan(zCache ? { stan: "zalogowany", profil: zCache } : { stan: "brak" });
        return;
      }
      if (!data || data.status !== "aktywny") {
        toast.error("Konto jest zablokowane. Skontaktuj się z administratorem.");
        await supabase.auth.signOut();
        zapiszCache(null);
        setStan({ stan: "brak" });
        return;
      }
      zapiszCache(data as Profil);
      setStan({ stan: "zalogowany", profil: data as Profil });
    },
    [],
  );

  useEffect(() => {
    let anulowane = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!anulowane) void wczytaj(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((zdarzenie, sesja) => {
      // Wywołania supabase wewnątrz tego callbacka mogą zawiesić klienta, stąd odroczenie.
      if (zdarzenie === "SIGNED_OUT") {
        setTimeout(() => {
          qc.clear();
          void wczytaj(null);
        }, 0);
      } else if (zdarzenie === "SIGNED_IN" || zdarzenie === "USER_UPDATED") {
        setTimeout(() => void wczytaj(sesja?.user.id ?? null), 0);
      }
    });
    return () => {
      anulowane = true;
      sub.subscription.unsubscribe();
    };
  }, [wczytaj, qc]);

  const odswiezProfil = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await wczytaj(data.session?.user.id ?? null);
  }, [wczytaj]);

  /** Wylogowanie zwraca false, gdy w kolejce są niezsynchronizowane zgłoszenia (nie wolno ich zgubić). */
  const wyloguj = useCallback(async () => {
    const oczekujace = (await getQueue()).length;
    if (oczekujace > 0) {
      toast.error(
        `Masz niezsynchronizowane zgłoszenia (${oczekujace}). Połącz się z internetem, poczekaj na synchronizację i wyloguj się ponownie.`,
      );
      return false;
    }
    await supabase.auth.signOut();
    return true;
  }, []);

  const wartosc = useMemo<Kontekst>(() => ({ ...stan, odswiezProfil, wyloguj }), [stan, odswiezProfil, wyloguj]);
  return <AuthContext.Provider value={wartosc}>{children}</AuthContext.Provider>;
}

export function useAuth(): Kontekst {
  const kontekst = useContext(AuthContext);
  if (!kontekst) throw new Error("useAuth musi być użyty wewnątrz AuthProvider");
  return kontekst;
}
```

- [ ] **Step 2: `src/routes/__root.tsx`**: (a) dodaj import `import { AuthProvider } from "@/lib/auth";`; (b) w `RootComponent` owiń `Outlet` i `Toaster` w `AuthProvider` wewnątrz `QueryClientProvider`:

```tsx
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster position="top-center" richColors />
      </AuthProvider>
    </QueryClientProvider>
```
(c) po polsku: w `NotFoundComponent` zamień „Page not found" na „Nie znaleziono strony", opis na „Strona, której szukasz, nie istnieje lub została przeniesiona.", a „Go home" na „Wróć na start"; w `ErrorComponent` zamień „This page didn't load" na „Nie udało się wczytać strony", opis na „Coś poszło nie tak po naszej stronie. Spróbuj odświeżyć stronę lub wrócić na start.", „Try again" na „Spróbuj ponownie", „Go home" na „Wróć na start".

- [ ] **Step 3: Utwórz `src/components/EkranAuth.tsx`** (wspólny układ ekranów logowania i zmiany hasła)

```tsx
import type { ReactNode } from "react";

export function EkranAuth({ tytul, podtytul, children }: { tytul: string; podtytul?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-md px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-70">Ewidencja awarii</p>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide">{tytul}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-6">
        {podtytul && <p className="mb-5 text-base text-muted-foreground">{podtytul}</p>}
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Utwórz `src/routes/logowanie.tsx`**

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EkranAuth } from "@/components/EkranAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { komunikatBleduLogowania } from "@/lib/auth-bledy";

export const Route = createFileRoute("/logowanie")({
  head: () => ({ meta: [{ title: "Logowanie — Ewidencja awarii urządzeń" }] }),
  component: Logowanie,
});

function Logowanie() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [haslo, setHaslo] = useState("");
  const [loguje, setLoguje] = useState(false);

  useEffect(() => {
    if (auth.stan === "zalogowany") void navigate({ to: "/" });
  }, [auth.stan, navigate]);

  async function zaloguj(e: React.FormEvent) {
    e.preventDefault();
    setLoguje(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: haslo });
    setLoguje(false);
    if (error) toast.error(komunikatBleduLogowania(error));
  }

  return (
    <EkranAuth tytul="Logowanie" podtytul="Konto zakłada administrator. Nie masz konta? Poproś go o dostęp.">
      <form onSubmit={zaloguj} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-base">E-mail</Label>
          <Input id="email" type="email" autoComplete="username" inputMode="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} className="h-14 text-base" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="haslo" className="text-base">Hasło</Label>
          <Input id="haslo" type="password" autoComplete="current-password" required value={haslo}
            onChange={(e) => setHaslo(e.target.value)} className="h-14 text-base" />
        </div>
        <Button type="submit" disabled={loguje} className="h-16 w-full text-lg font-bold">
          {loguje ? "Logowanie..." : "Zaloguj się"}
        </Button>
      </form>
    </EkranAuth>
  );
}
```

- [ ] **Step 5: Utwórz `src/routes/zmiana-hasla.tsx`**

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EkranAuth } from "@/components/EkranAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { noweHasloSchema } from "@/lib/haslo";
import { zmienWlasneHasloFn } from "@/lib/uzytkownicy.functions";

export const Route = createFileRoute("/zmiana-hasla")({
  head: () => ({ meta: [{ title: "Zmiana hasła — Ewidencja awarii urządzeń" }] }),
  component: ZmianaHasla,
});

function ZmianaHasla() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [nowe, setNowe] = useState("");
  const [powtorz, setPowtorz] = useState("");
  const [zapisuje, setZapisuje] = useState(false);

  useEffect(() => {
    if (auth.stan === "brak") void navigate({ to: "/logowanie" });
  }, [auth.stan, navigate]);

  if (auth.stan !== "zalogowany") return null;
  const wymuszona = auth.profil.must_change_password;

  async function zapisz(e: React.FormEvent) {
    e.preventDefault();
    const parsed = noweHasloSchema.safeParse(nowe);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? "Nieprawidłowe hasło.");
    if (nowe !== powtorz) return void toast.error("Hasła nie są takie same.");
    setZapisuje(true);
    try {
      const wynik = await zmienWlasneHasloFn({ data: { noweHaslo: nowe } });
      if (!wynik.ok) return void toast.error(wynik.komunikat);
      await auth.odswiezProfil();
      toast.success("Hasło zostało zmienione.");
      void navigate({ to: "/" });
    } catch {
      toast.error("Nie udało się zmienić hasła. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setZapisuje(false);
    }
  }

  return (
    <EkranAuth
      tytul="Zmiana hasła"
      podtytul={wymuszona ? "To Twoje pierwsze logowanie (lub hasło zostało zresetowane). Ustaw własne hasło, żeby korzystać z aplikacji." : "Ustaw nowe hasło."}
    >
      <form onSubmit={zapisz} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="nowe" className="text-base">Nowe hasło (min. 12 znaków)</Label>
          <Input id="nowe" type="password" autoComplete="new-password" required value={nowe}
            onChange={(e) => setNowe(e.target.value)} className="h-14 text-base" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="powtorz" className="text-base">Powtórz hasło</Label>
          <Input id="powtorz" type="password" autoComplete="new-password" required value={powtorz}
            onChange={(e) => setPowtorz(e.target.value)} className="h-14 text-base" />
        </div>
        <Button type="submit" disabled={zapisuje} className="h-16 w-full text-lg font-bold">
          {zapisuje ? "Zapisywanie..." : "Zapisz hasło"}
        </Button>
        {!wymuszona && (
          <Button type="button" variant="outline" className="h-14 w-full text-base" onClick={() => void navigate({ to: "/" })}>
            Anuluj
          </Button>
        )}
      </form>
    </EkranAuth>
  );
}
```

- [ ] **Step 6: Utwórz `src/components/MenuUzytkownika.tsx`**

```tsx
import { useNavigate } from "@tanstack/react-router";
import { KeyRound, LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { ETYKIETY_ROL } from "@/lib/uprawnienia";

export function MenuUzytkownika() {
  const auth = useAuth();
  const navigate = useNavigate();
  if (auth.stan !== "zalogowany") return null;
  const { profil } = auth;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu konta"
        className="flex size-11 items-center justify-center rounded-full bg-primary-foreground/15 active:bg-primary-foreground/30"
      >
        <User className="size-6" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <p className="text-base font-bold">{profil.imie_nazwisko}</p>
          <p className="text-xs font-normal text-muted-foreground">{ETYKIETY_ROL[profil.rola]}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="py-3 text-base" onSelect={() => void navigate({ to: "/zmiana-hasla" })}>
          <KeyRound className="size-5" /> Zmień hasło
        </DropdownMenuItem>
        <DropdownMenuItem
          className="py-3 text-base"
          onSelect={async () => {
            if (await auth.wyloguj()) void navigate({ to: "/logowanie" });
          }}
        >
          <LogOut className="size-5" /> Wyloguj
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 7: Zastąp `src/components/AppShell.tsx`**

```tsx
import { Link, useNavigate } from "@tanstack/react-router";
import { BarChart3, ClipboardPlus, Download, ListChecks, Settings, type LucideIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { czyRola, pozycjeNawigacji, type IkonaNawigacji, type Rola } from "@/lib/uprawnienia";
import { MenuUzytkownika } from "./MenuUzytkownika";
import { StatusPolaczenia } from "./StatusPolaczenia";

const IKONY: Record<IkonaNawigacji, LucideIcon> = {
  zglos: ClipboardPlus,
  lista: ListChecks,
  analizy: BarChart3,
  eksport: Download,
  admin: Settings,
};

type Props = { title: string; children: ReactNode; dozwoloneRole?: readonly Rola[] };

export function AppShell({ title, children, dozwoloneRole }: Props) {
  const auth = useAuth();
  const navigate = useNavigate();
  const wymuszonaZmiana = auth.stan === "zalogowany" && auth.profil.must_change_password;

  useEffect(() => {
    if (auth.stan === "brak") void navigate({ to: "/logowanie" });
    else if (wymuszonaZmiana) void navigate({ to: "/zmiana-hasla" });
  }, [auth.stan, wymuszonaZmiana, navigate]);

  if (auth.stan !== "zalogowany" || wymuszonaZmiana) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Wczytywanie...</div>;
  }

  const { rola } = auth.profil;
  const pozycje = pozycjeNawigacji(rola);
  const brakDostepu = dozwoloneRole !== undefined && !czyRola(rola, dozwoloneRole);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-70">Ewidencja awarii</p>
            <h1 className="truncate font-display text-2xl font-bold uppercase tracking-wide">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusPolaczenia />
            <MenuUzytkownika />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        {brakDostepu ? (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            Brak dostępu do tego widoku.
          </p>
        ) : (
          children
        )}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-2xl items-end justify-around">
          {pozycje.map(({ to, label, ikona, glowna }) => {
            const Ikona = IKONY[ikona];
            return (
              <Link
                key={`${to}-${label}`}
                to={to}
                activeOptions={{ exact: to === "/" }}
                className="flex min-h-14 min-w-16 flex-1 flex-col items-center justify-end gap-1 pb-2 text-xs font-semibold text-muted-foreground transition-colors"
                activeProps={{ className: glowna ? "text-warning" : "text-primary" }}
              >
                {glowna ? (
                  <span className="-mt-5 flex size-14 items-center justify-center rounded-full bg-warning text-warning-foreground shadow-lg">
                    <Ikona className="size-7" />
                  </span>
                ) : (
                  <Ikona className="size-6 shrink-0" />
                )}
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
```

- [ ] **Step 8: Szkielet `src/routes/admin.uzytkownicy.tsx`** (potrzebny, żeby trasa istniała w drzewie; pełna wersja w zadaniu 7)

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/admin/uzytkownicy")({
  head: () => ({ meta: [{ title: "Użytkownicy — Ewidencja awarii urządzeń" }] }),
  component: () => (
    <AppShell title="Użytkownicy" dozwoloneRole={["admin"]}>
      <p className="text-muted-foreground">Panel w budowie.</p>
    </AppShell>
  ),
});
```

- [ ] **Step 9: Wygeneruj drzewo tras i sprawdź.** Run: `npm run build && npm run typecheck && npm run lint` — Expected: build przechodzi (plugin odświeża `src/routeTree.gen.ts` o `/logowanie`, `/zmiana-hasla`, `/admin/uzytkownicy`), brak nowych błędów typów i lintu. Jeśli `activeProps` dla głównej pozycji nie kolorowałby ikony w kółku, to jest w porządku (kółko ma stały kolor); nie zmieniaj tego bez potrzeby.

- [ ] **Step 10: Ręczna weryfikacja na projekcie testowym.** Uruchom `npm run dev:test` (port 8081, projekt testowy) i w widoku telefonu (390 px) sprawdź:
  1. Wejście na `http://localhost:8081/` bez logowania przekierowuje na `/logowanie`.
  2. Logowanie kontem `test-technik@example.test` / `Test-Haslo-12345!` (konta powstają po `przygotujKonta()`; jeśli ich nie ma, uruchom raz `npm run test:rls`) wpuszcza na start, a pasek ma pozycje „Zgłoś" i „Awarie".
  3. Konto `test-zmiana-hasla@example.test` po zalogowaniu ląduje na `/zmiana-hasla` i nie wyjdzie z niej przez adres.
  4. Menu konta (ikona w nagłówku) pokazuje imię i rolę, „Zmień hasło" i „Wyloguj".
  5. Kolejne kroki (zgłoszenie awarii, lista) mogą jeszcze nie działać w pełni. Naprawa w zadaniu 8.

- [ ] **Step 11: Commit**

```bash
git add src/lib/auth.tsx src/components src/routes/logowanie.tsx src/routes/zmiana-hasla.tsx src/routes/admin.uzytkownicy.tsx src/routes/__root.tsx src/routeTree.gen.ts
git commit -m "Add auth session, login, forced password change and role-based app shell" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Panel admina „Użytkownicy"

**Files:**
- Create: `src/components/admin/HasloTymczasoweDialog.tsx`, `src/components/admin/NoweKontoSheet.tsx`, `src/components/admin/EdycjaUzytkownikaSheet.tsx`
- Modify: `src/routes/admin.uzytkownicy.tsx` (zastępuje szkielet), `src/lib/queries.ts`

**Interfaces:**
- Consumes: `utworzKontoFn`, `resetujHasloFn`, `zmienRoleLubStatusFn`, `nowyUzytkownikSchema`, `ROLE`, `ETYKIETY_ROL`, `useAuth`, `Database`.
- Produces: `profileQuery` (klucz `["profiles"]`), `type ProfilListy = Database["public"]["Tables"]["profiles"]["Row"]`, `type DaneHasla = { email: string; haslo: string }`.

- [ ] **Step 1: `src/lib/queries.ts`**: dopisz na końcu pliku

```ts
import type { Database } from "@/integrations/supabase/types";

export type ProfilListy = Database["public"]["Tables"]["profiles"]["Row"];

export const profileQuery = queryOptions({
  queryKey: ["profiles"],
  queryFn: async (): Promise<ProfilListy[]> => {
    const { data, error } = await supabase.from("profiles").select("*").order("imie_nazwisko");
    if (error) throw error;
    return data ?? [];
  },
});
```
(Przenieś linię `import type { Database ... }` na górę pliku, do pozostałych importów.)

- [ ] **Step 2: Utwórz `src/components/admin/HasloTymczasoweDialog.tsx`**

```tsx
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type DaneHasla = { email: string; haslo: string };

export function HasloTymczasoweDialog({ dane, onZamknij }: { dane: DaneHasla | null; onZamknij: () => void }) {
  async function kopiuj() {
    if (!dane) return;
    try {
      await navigator.clipboard.writeText(dane.haslo);
      toast.success("Hasło skopiowane.");
    } catch {
      toast.error("Nie udało się skopiować. Zaznacz hasło i skopiuj ręcznie.");
    }
  }

  return (
    <Dialog open={dane !== null} onOpenChange={(otwarte) => !otwarte && onZamknij()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hasło tymczasowe</DialogTitle>
          <DialogDescription>
            Konto: {dane?.email}. Hasło jest pokazane tylko raz. Przekaż je osobie. Przy pierwszym logowaniu system
            wymusi ustawienie własnego hasła.
          </DialogDescription>
        </DialogHeader>
        <p
          data-testid="haslo-tymczasowe"
          className="select-all rounded-xl bg-foreground p-4 text-center font-mono text-2xl tracking-widest text-background"
        >
          {dane?.haslo}
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-12" onClick={() => void kopiuj()}>
            Skopiuj hasło
          </Button>
          <Button className="h-12" onClick={onZamknij}>
            Zamknij
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Utwórz `src/components/admin/NoweKontoSheet.tsx`**

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ETYKIETY_ROL, ROLE, type Rola } from "@/lib/uprawnienia";
import { nowyUzytkownikSchema } from "@/lib/uzytkownicy.schemas";
import { utworzKontoFn } from "@/lib/uzytkownicy.functions";
import type { DaneHasla } from "./HasloTymczasoweDialog";

type Props = { otwarte: boolean; onZmiana: (otwarte: boolean) => void; onUtworzono: (dane: DaneHasla) => void };

export function NoweKontoSheet({ otwarte, onZmiana, onUtworzono }: Props) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [imieNazwisko, setImieNazwisko] = useState("");
  const [rola, setRola] = useState<Rola>("pracownik");
  const [pracuje, setPracuje] = useState(false);

  async function utworz(e: React.FormEvent) {
    e.preventDefault();
    const parsed = nowyUzytkownikSchema.safeParse({ email, imieNazwisko, rola });
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? "Sprawdź dane.");
    setPracuje(true);
    try {
      const wynik = await utworzKontoFn({ data: parsed.data });
      if (!wynik.ok) return void toast.error(wynik.komunikat);
      onUtworzono({ email: wynik.dane.email, haslo: wynik.dane.hasloTymczasowe });
      onZmiana(false);
      setEmail("");
      setImieNazwisko("");
      setRola("pracownik");
      await qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch {
      toast.error("Nie udało się utworzyć konta. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setPracuje(false);
    }
  }

  return (
    <Sheet open={otwarte} onOpenChange={onZmiana}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nowe konto</SheetTitle>
          <SheetDescription>Aplikacja wygeneruje hasło tymczasowe i pokaże je raz.</SheetDescription>
        </SheetHeader>
        <form onSubmit={utworz} className="space-y-4 px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="nowy-email" className="text-base">E-mail (login)</Label>
            <Input id="nowy-email" type="email" inputMode="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} className="h-14 text-base" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nowy-imie" className="text-base">Imię i nazwisko</Label>
            <Input id="nowy-imie" required value={imieNazwisko}
              onChange={(e) => setImieNazwisko(e.target.value)} className="h-14 text-base" />
          </div>
          <div className="space-y-2">
            <Label className="text-base">Rola</Label>
            <div className="grid grid-cols-2 gap-2">
              {ROLE.map((r) => (
                <Button key={r} type="button" aria-pressed={rola === r}
                  variant={rola === r ? "default" : "outline"} className="h-14 text-base"
                  onClick={() => setRola(r)}>
                  {ETYKIETY_ROL[r]}
                </Button>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={pracuje} className="h-16 w-full text-lg font-bold">
            {pracuje ? "Tworzenie..." : "Utwórz konto"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Utwórz `src/components/admin/EdycjaUzytkownikaSheet.tsx`**

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ProfilListy } from "@/lib/queries";
import { ETYKIETY_ROL, ROLE, type Rola } from "@/lib/uprawnienia";
import { resetujHasloFn, zmienRoleLubStatusFn } from "@/lib/uzytkownicy.functions";
import type { DaneHasla } from "./HasloTymczasoweDialog";

type Props = {
  profil: ProfilListy | null;
  wlasneId: string;
  onZamknij: () => void;
  onHaslo: (dane: DaneHasla) => void;
};

export function EdycjaUzytkownikaSheet({ profil, wlasneId, onZamknij, onHaslo }: Props) {
  const qc = useQueryClient();
  const [pracuje, setPracuje] = useState(false);
  const wlasne = profil?.id === wlasneId;

  async function wykonaj(praca: () => Promise<void>) {
    setPracuje(true);
    try {
      await praca();
      await qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch {
      toast.error("Operacja nie powiodła się. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setPracuje(false);
    }
  }

  const zmienRole = (rola: Rola) =>
    wykonaj(async () => {
      if (!profil) return;
      const wynik = await zmienRoleLubStatusFn({ data: { userId: profil.id, rola } });
      if (!wynik.ok) return void toast.error(wynik.komunikat);
      toast.success(`Rola zmieniona na: ${ETYKIETY_ROL[rola]}.`);
      onZamknij();
    });

  const zmienStatus = (status: "aktywny" | "zablokowany") =>
    wykonaj(async () => {
      if (!profil) return;
      const wynik = await zmienRoleLubStatusFn({ data: { userId: profil.id, status } });
      if (!wynik.ok) return void toast.error(wynik.komunikat);
      toast.success(status === "zablokowany" ? "Konto zablokowane." : "Konto odblokowane.");
      onZamknij();
    });

  const resetuj = () =>
    wykonaj(async () => {
      if (!profil) return;
      const wynik = await resetujHasloFn({ data: { userId: profil.id } });
      if (!wynik.ok) return void toast.error(wynik.komunikat);
      onZamknij();
      onHaslo({ email: profil.email, haslo: wynik.dane.hasloTymczasowe });
    });

  return (
    <Sheet open={profil !== null} onOpenChange={(otwarte) => !otwarte && onZamknij()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{profil?.imie_nazwisko}</SheetTitle>
          <SheetDescription>{profil?.email}</SheetDescription>
        </SheetHeader>
        {profil && (
          <div className="space-y-5 px-4 pb-6">
            {wlasne && (
              <p className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">
                To Twoje konto. Roli ani statusu nie zmieniasz tutaj, żeby nie odciąć sobie dostępu.
              </p>
            )}
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Rola</p>
              <div className="grid grid-cols-2 gap-2">
                {ROLE.map((r) => (
                  <Button key={r} type="button" disabled={pracuje || wlasne || profil.rola === r}
                    variant={profil.rola === r ? "default" : "outline"} className="h-14 text-base"
                    onClick={() => void zmienRole(r)}>
                    {ETYKIETY_ROL[r]}
                  </Button>
                ))}
              </div>
            </div>

            {profil.status === "aktywny" ? (
              <Button variant="destructive" disabled={pracuje || wlasne} className="h-14 w-full text-base"
                onClick={() => void zmienStatus("zablokowany")}>
                Zablokuj konto
              </Button>
            ) : (
              <Button disabled={pracuje} className="h-14 w-full text-base" onClick={() => void zmienStatus("aktywny")}>
                Odblokuj konto
              </Button>
            )}

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={pracuje} className="h-14 w-full text-base">
                  Resetuj hasło
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Zresetować hasło?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Użytkownik dostanie nowe hasło tymczasowe, a dotychczasowe przestanie działać. Przy najbliższym
                    logowaniu będzie musiał ustawić własne.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Anuluj</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void resetuj()}>Resetuj</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 5: Zastąp `src/routes/admin.uzytkownicy.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EdycjaUzytkownikaSheet } from "@/components/admin/EdycjaUzytkownikaSheet";
import { HasloTymczasoweDialog, type DaneHasla } from "@/components/admin/HasloTymczasoweDialog";
import { NoweKontoSheet } from "@/components/admin/NoweKontoSheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { profileQuery, type ProfilListy } from "@/lib/queries";
import { ETYKIETY_ROL } from "@/lib/uprawnienia";

export const Route = createFileRoute("/admin/uzytkownicy")({
  head: () => ({ meta: [{ title: "Użytkownicy — Ewidencja awarii urządzeń" }] }),
  component: Uzytkownicy,
});

function Uzytkownicy() {
  const auth = useAuth();
  const { data: profile = [], isLoading } = useQuery(profileQuery);
  const [nowe, setNowe] = useState(false);
  const [wybrany, setWybrany] = useState<ProfilListy | null>(null);
  const [haslo, setHaslo] = useState<DaneHasla | null>(null);
  const wlasneId = auth.stan === "zalogowany" ? auth.profil.id : "";

  return (
    <AppShell title="Użytkownicy" dozwoloneRole={["admin"]}>
      <Button className="mb-4 h-14 w-full text-base font-bold" onClick={() => setNowe(true)}>
        <UserPlus className="size-5" /> Nowe konto
      </Button>

      {isLoading && <p className="text-muted-foreground">Wczytywanie...</p>}
      <div className="space-y-3">
        {profile.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setWybrany(p)}
            className={`w-full rounded-2xl border border-border bg-card p-4 text-left active:bg-accent ${
              p.status === "zablokowany" ? "opacity-60" : ""
            }`}
          >
            <p className="text-base font-bold">{p.imie_nazwisko}</p>
            <p className="truncate text-sm text-muted-foreground">{p.email}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
                {ETYKIETY_ROL[p.rola]}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  p.status === "aktywny"
                    ? "bg-success text-success-foreground"
                    : "bg-destructive text-destructive-foreground"
                }`}
              >
                {p.status === "aktywny" ? "Aktywny" : "Zablokowany"}
              </span>
              {p.must_change_password && (
                <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-warning-foreground">
                  Zmiana hasła wymagana
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      <NoweKontoSheet otwarte={nowe} onZmiana={setNowe} onUtworzono={setHaslo} />
      <EdycjaUzytkownikaSheet
        profil={wybrany}
        wlasneId={wlasneId}
        onZamknij={() => setWybrany(null)}
        onHaslo={setHaslo}
      />
      <HasloTymczasoweDialog dane={haslo} onZamknij={() => setHaslo(null)} />
    </AppShell>
  );
}
```

- [ ] **Step 6: Sprawdź.** Run: `npm run typecheck && npm run lint && npm run build` — Expected: brak nowych błędów. Uruchom `npm run dev:test`, zaloguj się jako `test-admin@example.test`, wejdź w „Admin" i sprawdź ręcznie na 390 px: lista pokazuje 7 kont testowych z rolami i statusami, „Nowe konto" tworzy konto i pokazuje hasło raz, próba utworzenia konta z zajętym e-mailem pokazuje toast „Konto o tym adresie e-mail już istnieje.", a „Resetuj hasło" pyta o potwierdzenie. Konta utworzone w tym kroku usuń z panelu testowego projektu (Authentication → Users).

- [ ] **Step 7: Commit**

```bash
git add src/components/admin src/routes/admin.uzytkownicy.tsx src/lib/queries.ts src/routeTree.gen.ts
git commit -m "Add admin users panel: create accounts, edit role and status, reset password" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Role w istniejących ekranach

**Files:**
- Modify: `src/routes/index.tsx`, `src/routes/awarie.index.tsx`, `src/routes/awarie.$id.tsx`, `src/routes/dashboard.tsx`, `src/routes/eksport.tsx`

**Interfaces:**
- Consumes: `useAuth`, `czyRola`, `AppShell` z `dozwoloneRole`.

- [ ] **Step 1: `src/routes/dashboard.tsx`**: do jedynego `<AppShell ...>` w pliku dodaj prop `dozwoloneRole={["kierownik", "admin"]}`.

- [ ] **Step 2: `src/routes/eksport.tsx`**: zamień `<AppShell title="Eksport danych">` na

```tsx
    <AppShell title="Eksport danych" dozwoloneRole={["kierownik", "admin"]}>
```

- [ ] **Step 3: `src/routes/index.tsx`**: dodaj import `import { useAuth } from "@/lib/auth";`, w komponencie `Zgloszenie` na początku `const auth = useAuth();`, a w formularzu, tuż nad polem „Urządzenie" (na miejscu usuniętego pola osoby), wiersz:

```tsx
        {auth.stan === "zalogowany" && (
          <p className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">
            Zgłasza: <span className="font-semibold">{auth.profil.imie_nazwisko}</span>
          </p>
        )}
```

- [ ] **Step 4: `src/routes/awarie.index.tsx`**: dodaj import `useAuth`, w `Lista` `const auth = useAuth();` i zamień `<AppShell title="Lista awarii">` na

```tsx
    <AppShell title={auth.stan === "zalogowany" && auth.profil.rola === "pracownik" ? "Moje awarie" : "Lista awarii"}>
```

- [ ] **Step 5: `src/routes/awarie.$id.tsx`**: dodaj importy `useAuth` i `czyRola`; na początku `Szczegoly` (przed wczesnymi `return`) dodaj

```tsx
  const auth = useAuth();
  const mozeZamykac = auth.stan === "zalogowany" && czyRola(auth.profil.rola, ["technik", "kierownik", "admin"]);
```
i zamień warunek formularza zamknięcia `{awaria.status === "Otwarta" && (` na `{awaria.status === "Otwarta" && mozeZamykac && (`. (Egzekwuje to RLS; interfejs tylko nie pokazuje pracownikowi przycisku, który by nie zadziałał.)

- [ ] **Step 6: Sprawdź.** Run: `npm run typecheck && npm run lint && npm run build && npm test`. Ręcznie (`npm run dev:test`, 390 px): pracownik widzi tylko własne awarie pod tytułem „Moje awarie", nie widzi formularza zamknięcia i po wpisaniu `/dashboard` dostaje „Brak dostępu"; technik zamyka awarię; kierownik widzi Analizy i Eksport.

- [ ] **Step 7: Commit**

```bash
git add src/routes
git commit -m "Apply role checks to existing screens and show reporter from account" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Skrypt pierwszego administratora

**Files:**
- Create: `scripts/utworz-admina.ts`

**Interfaces:**
- Consumes: `generujHasloTymczasowe` (`src/lib/haslo.ts`).
- Produces: `node scripts/utworz-admina.ts <email> "<Imię Nazwisko>"` zakłada pierwszego admina w bazie z `.env` i wypisuje hasło tymczasowe. Odmawia, gdy aktywny admin już istnieje.

- [ ] **Step 1: Utwórz `scripts/utworz-admina.ts`**

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types.ts";
import { generujHasloTymczasowe } from "../src/lib/haslo.ts";

const [emailWejscie, imieNazwisko] = process.argv.slice(2);
if (!emailWejscie || !imieNazwisko) {
  console.error('Użycie: node scripts/utworz-admina.ts <email> "<Imię Nazwisko>"');
  process.exit(1);
}

try {
  process.loadEnvFile(".env");
} catch {
  console.error("Brak pliku .env z SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const url = process.env["SUPABASE_URL"];
const klucz = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !klucz) {
  console.error("W .env brakuje SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const email = emailWejscie.trim().toLowerCase();
const admin = createClient<Database>(url, klucz, { auth: { persistSession: false, autoRefreshToken: false } });

const { count, error: bladLiczenia } = await admin
  .from("profiles")
  .select("id", { count: "exact", head: true })
  .eq("rola", "admin")
  .eq("status", "aktywny");
if (bladLiczenia) throw bladLiczenia;
if ((count ?? 0) > 0) {
  console.error("Aktywny administrator już istnieje. Kolejne konta zakładaj w panelu Admin.");
  process.exit(1);
}

const haslo = generujHasloTymczasowe();
const { data, error } = await admin.auth.admin.createUser({ email, password: haslo, email_confirm: true });
if (error || !data.user) throw error ?? new Error("Nie udało się utworzyć konta.");

const { error: bladProfilu } = await admin.from("profiles").insert({
  id: data.user.id,
  email,
  imie_nazwisko: imieNazwisko.trim(),
  rola: "admin",
  status: "aktywny",
  must_change_password: true,
});
if (bladProfilu) {
  await admin.auth.admin.deleteUser(data.user.id);
  throw bladProfilu;
}

console.log(`Utworzono administratora ${email}.`);
console.log(`Hasło tymczasowe (pokazane raz, zmiana wymuszona przy logowaniu): ${haslo}`);
```

- [ ] **Step 2: Sprawdź kompilację i komunikat użycia.**
Run: `npm run typecheck && node scripts/utworz-admina.ts`
Expected: brak błędów typów; drugie polecenie wypisuje `Użycie: node scripts/utworz-admina.ts <email> "<Imię Nazwisko>"` i kończy się kodem 1. (Właściwe uruchomienie jest w zadaniu 11 na produkcji, bo test na projekcie testowym złamałby założenie „jeden admin" testów RLS.)

- [ ] **Step 3: Commit**

```bash
git add scripts/utworz-admina.ts
git commit -m "Add bootstrap script for the first administrator" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Test end-to-end (telefon)

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/konta-i-zgloszenie.spec.ts`

**Interfaces:**
- Consumes: `tests/wspolne/srodowisko.ts`; `data-testid="haslo-tymczasowe"` z `HasloTymczasoweDialog`; skrypt `npm run dev:test` (port 8081, projekt testowy).

- [ ] **Step 1: Utwórz `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:8081", trace: "retain-on-failure" },
  projects: [{ name: "telefon", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run dev:test",
    url: "http://localhost:8081",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
```

- [ ] **Step 2: Utwórz `tests/e2e/konta-i-zgloszenie.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { HASLO_TESTOWE, KONTA, klientAdmin, przygotujKonta, url } from "../wspolne/srodowisko";

const ZNACZNIK = `E2E-${Date.now()}`;
const EMAIL = `e2e-${Date.now()}@example.test`;
const NOWE_HASLO = "E2E-nowe-haslo-42";

test.beforeAll(async () => {
  await przygotujKonta();
});

test.afterAll(async () => {
  const admin = klientAdmin();
  await admin.from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
  const { data } = await admin.from("profiles").select("id").eq("email", EMAIL).maybeSingle();
  if (data) await admin.auth.admin.deleteUser(data.id);
});

test("konto z wymuszoną zmianą hasła nie wejdzie do aplikacji bez ustawienia hasła", async ({ page }) => {
  await page.goto("/logowanie");
  await page.getByLabel("E-mail").fill(KONTA.zmianaHasla.email);
  await page.getByLabel("Hasło").fill(HASLO_TESTOWE);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page).toHaveURL(/\/zmiana-hasla/);
  await page.goto("/awarie");
  await expect(page).toHaveURL(/\/zmiana-hasla/);
});

test("admin zakłada konto, użytkownik zmienia hasło i zgłasza awarię", async ({ page }) => {
  const hosty = new Set<string>();
  page.on("request", (r) => {
    const host = new URL(r.url()).host;
    if (host.endsWith("supabase.co")) hosty.add(host);
  });

  // Niezalogowany trafia na logowanie.
  await page.goto("/");
  await expect(page).toHaveURL(/\/logowanie/);

  // Admin zakłada konto technika.
  await page.getByLabel("E-mail").fill(KONTA.admin.email);
  await page.getByLabel("Hasło").fill(HASLO_TESTOWE);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.getByRole("link", { name: "Admin" }).click();
  await expect(page.getByRole("heading", { name: "Użytkownicy" })).toBeVisible();
  await page.getByRole("button", { name: "Nowe konto" }).click();
  await page.getByLabel("E-mail (login)").fill(EMAIL);
  await page.getByLabel("Imię i nazwisko").fill("Ewa E2E");
  await page.getByRole("button", { name: "Technik", exact: true }).click();
  await page.getByRole("button", { name: "Utwórz konto" }).click();
  const haslo = ((await page.getByTestId("haslo-tymczasowe").textContent()) ?? "").trim();
  expect(haslo).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
  await page.getByRole("button", { name: "Zamknij" }).click();

  // Wylogowanie.
  await page.getByRole("button", { name: "Menu konta" }).click();
  await page.getByRole("menuitem", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie/);

  // Nowy użytkownik: logowanie hasłem tymczasowym i wymuszona zmiana hasła.
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Hasło").fill(haslo);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page).toHaveURL(/\/zmiana-hasla/);
  await page.getByLabel("Nowe hasło (min. 12 znaków)").fill(NOWE_HASLO);
  await page.getByLabel("Powtórz hasło").fill(NOWE_HASLO);
  await page.getByRole("button", { name: "Zapisz hasło" }).click();
  await expect(page.getByRole("button", { name: "Zgłoś awarię" })).toBeVisible();

  // Zgłoszenie awarii i widoczność na liście.
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: /HVAC-01/ }).click();
  await page.getByLabel("Opis awarii").fill(`${ZNACZNIK} pompa nie startuje`);
  await page.getByRole("button", { name: "Zgłoś awarię" }).click();
  await expect(page).toHaveURL(/\/awarie/);
  await expect(page.getByText(`${ZNACZNIK} pompa nie startuje`)).toBeVisible();

  // Zabezpieczenie: cały ruch szedł do projektu testowego.
  expect([...hosty]).toEqual([new URL(url()).host]);
});
```

- [ ] **Step 3: Uruchom.** Run: `npm run test:e2e` — Expected: 2 testy PASS. Przy pierwszym uruchomieniu serwer kompiluje aplikację, więc trwa to do kilku minut. Jeśli test pada na `getByRole("combobox")` (więcej niż jeden element), zawęź selektor do formularza: `page.locator("form").getByRole("combobox")`. Jeśli pada na przekierowaniu po zapisie hasła, sprawdź w logach serwera, czy funkcja `zmienWlasneHasloFn` zwróciła `ok: true`.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests/e2e
git commit -m "Add mobile e2e test for account creation, forced password change and reporting" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Bramka jakości, dokumentacja i wdrożenie bazy

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `roadmap.md`, `.env.example` (bez zmian, jeśli niepotrzebne)

- [ ] **Step 1: Pełna bramka automatyczna**

```bash
npm run lint && npm run typecheck && npm test && npm run test:rls && npm run test:e2e && npm run build
npm audit --omit=dev
```
Expected: wszystko zielone. Lint i typy porównaj ze stanem wyjściowym z zadania 1 (`stan-wyjsciowy-etap-1.md`): brak nowych błędów. `npm audit`: zapisz wynik; podatności wysokie i krytyczne napraw (`npm audit fix`, jeśli bezpieczne) albo opisz wyjątek w commicie.

- [ ] **Step 2: Przegląd kodu i bezpieczeństwa.** Wywołaj skille `code-review` oraz `security-review` na zmianach gałęzi `etap-1-uzytkownicy` względem `main`. Naprawiaj znaleziska (każde osobnym commitem `fix:`), a odrzucone opisz w commicie z uzasadnieniem. Szczególną uwagę poświęć: politykom RLS (`awarie_update` z `WITH CHECK`), funkcjom `SECURITY DEFINER` (ustalony `search_path`), tym, że `uzytkownicy.server.ts` nie trafia do bundla klienta, oraz komunikatom błędów bez szczegółów wewnętrznych.

- [ ] **Step 3: Ręczna ścieżka na telefonie** (`npm run dev:test`, widok 390 px lub prawdziwy telefon w tej samej sieci): (1) logowanie hasłem tymczasowym i wymuszona zmiana hasła, (2) zgłoszenie awarii jako pracownik, (3) przyjęcie i zamknięcie jako technik, (4) blokada konta przez admina i próba logowania, (5) tryb offline: wyłącz sieć, zgłoś awarię, włącz sieć i sprawdź, że zsynchronizowała się i pojawia się na liście, (6) próba wylogowania z niezsynchronizowanym zgłoszeniem daje komunikat. Zrób zrzuty ekranu i zapisz je poza repozytorium. Poprawki wynikające z testu ręcznego rób w osobnych commitach.

- [ ] **Step 4: Dokumentacja.** Zaktualizuj:
  - `CLAUDE.md`: w „Commands" dopisz `npm test`, `npm run test:rls`, `npm run test:e2e`, `npm run typecheck`, `npm run dev:test`; w „Environment" dopisz `.env.test` (projekt testowy, nigdy produkcyjne klucze); w „Supabase integration" zamień zdanie, że `auth-middleware.ts` nie jest podłączony, na opis, że jest używany przez funkcje serwerowe kont (`src/lib/uzytkownicy.functions.ts`); w „Data model" zastąp `pracownicy` opisem `profiles` (rola, status, `must_change_password`, `email`) i opisem funkcji `moja_rola()`/`mam_role()`; usuń akapit o „celowo otwartym RLS" i zastąp opisem zamkniętego RLS oraz roli `anon` bez uprawnień; w „Roadmap discipline" zaznacz, że kroki 1 i 2 z `roadmap.md` są zrobione, a dalsze etapy idą wg planu nadrzędnego.
  - `README.md`: sekcja „Tabele" (`profiles` zamiast `pracownicy`, nowe pola `awarie`), „Ekrany" (logowanie, zmiana hasła, Użytkownicy), „Rozwój lokalny" (komendy testów, projekt testowy).
  - `roadmap.md`: pozycje 1 i 2 przenieś do „Gotowe" z odnośnikiem do specyfikacji.

- [ ] **Step 5: Commit dokumentacji i tag**

```bash
git add CLAUDE.md README.md roadmap.md
git commit -m "Document stage 1: auth, roles, closed RLS and test commands" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git tag etap-1-gotowy
```

- [ ] **Step 6: Wdrożenie bazy na produkcję (WYMAGA OSOBNEJ ZGODY UŻYTKOWNIKA).** Zapytaj użytkownika, czy działa już publiczna instancja aplikacji. Jeśli tak, stara wersja przestanie działać po migracji (korzysta z dostępu anonimowego i tabeli `pracownicy`), więc migrację trzeba zgrać z wdrożeniem nowej wersji w krótkim oknie. Po uzyskaniu zgody:
  1. **Kopia zapasowa:** w panelu produkcyjnego Supabase (Table Editor) wyeksportuj do CSV tabele `awarie`, `urzadzenia`, `pracownicy` i zapisz poza repozytorium.
  2. `! npx supabase link --project-ref fujutpwdtnnooeusivdr` (zapyta o hasło bazy).
  3. `! npx supabase migration list`. Jeśli migracja `20260905165410` nie jest oznaczona jako zastosowana zdalnie, ale tabele istnieją (baza pochodzi z Lovable), wykonaj `! npx supabase migration repair --status applied 20260905165410`, żeby `db push` nie próbował jej powtórzyć.
  4. `! npx supabase db push` (zastosuje `20260921120000_etap1_profiles_rls.sql`).
  5. W panelu produkcyjnym wyłącz **Authentication → Sign In / Providers → Allow new users to sign up**.
  6. Załóż pierwszego admina: `node scripts/utworz-admina.ts <email_użytkownika> "<Imię Nazwisko>"` i przekaż użytkownikowi hasło tymczasowe.
  7. Sprawdź produkcję: logowanie admina i zmiana hasła, założenie konta technika w panelu, zgłoszenie i zamknięcie awarii. Poproś użytkownika o ręczne uruchomienie przepływu n8n `sync-urzadzenia`: webhook używa klucza service-role, więc RLS go nie dotyczy, ale to szybki dowód, że integracja żyje.
  8. Historyczne awarie mają teraz `zglaszajacy_nazwa` z dawnych `pracownicy` i `zglaszajacy_id = NULL`. Sprawdź to na liście awarii jako admin.

- [ ] **Step 6a: Push.** Nie wypychaj zmian na GitHub bez osobnej, jawnej zgody użytkownika (`CLAUDE.md`, sekcja „Git"). Po zgodzie: `git push origin etap-1-uzytkownicy --tags` i zaproponuj scalenie gałęzi.

- [ ] **Step 7: Przypomnienie o kolejnym etapie.** Zapytaj użytkownika, czy przechodzimy do planu etapu 2 (obsługa awarii), i przypomnij, że opcjonalne zdjęcia wrócą po etapie 2.

---

## Self-Review (spec coverage, stan po napisaniu planu)

**Pokrycie specyfikacji dla etapu 1 (sekcja 3, punkt 1):**
- Supabase Auth, `profiles`, zamknięcie RLS: zadanie 3. Wyłączona publiczna rejestracja: zadania 1 i 11 (ustawienie w panelu) oraz test „nie może się zarejestrować".
- Ekrany logowania i zmiany hasła, panel „Użytkownicy", zgłoszenie z `auth.uid()`: zadania 3 (trigger), 6, 7, 4.
- Usunięcie `pracownicy`, polskie 404/błąd: zadania 3 i 6.
- Uprawnienia sekcji 4 dla etapu 1 (podgląd własnych awarii przez pracownika, technik+ zmienia i zamyka, analizy i eksport dla kierownika i admina, zarządzanie użytkownikami tylko admin): zadania 3 i 8.
- Ostatni admin (trigger), autor z `auth.uid()`, hasła tymczasowe z CSPRNG, zmiana hasła przez funkcję serwerową (min. 12 znaków, różne od dotychczasowego, jednoczesne zdjęcie flagi): zadania 3 i 5.
- Kolejka offline działa zalogowana, sesja wymagana: zadanie 4. Świadomie odłożone do etapu 2: lista „Do sprawdzenia" dla konfliktów biznesowych.
- Tworzenie kont, reset hasła, blokada (ban w Auth), unieważnienie: zadanie 5. Uwaga: token dostępu żyje do wygaśnięcia, ale RLS sprawdza status i `must_change_password` w bazie przy każdym zapytaniu, więc blokada i reset działają od razu.
- Testy: jednostkowe (zadanie 2), macierz RLS i logika kont (zadania 3 i 5), E2E na telefonie (zadanie 10), bramka i przegląd bezpieczeństwa (zadanie 11).

**Poza zakresem etapu 1 (zgodnie ze specyfikacją):** statusy awarii, numeracja `AWR-…`, historia i komentarze (etap 2), urządzenia i harmonogram, usunięcie webhooka (etap 3), powiadomienia (etap 4), nagłówki bezpieczeństwa (etap 6).

**Spójność nazw:** `zglaszajacy_id`/`zglaszajacy_nazwa` (SQL, typy, kod), `moja_rola`/`mam_role` (SQL), `Wynik<T>` z `{ ok, dane | komunikat }` (schemas, server, funkcje, komponenty), `BladBiznesowy`, `czyHasloPasuje`, `przygotujKonta`/`KONTA`/`HASLO_TESTOWE` (helper, testy RLS, E2E), `DaneHasla` (dialog, sheety, trasa), `dozwoloneRole` (AppShell i ekrany), `profileQuery`/`ProfilListy` (queries, komponenty admina).
