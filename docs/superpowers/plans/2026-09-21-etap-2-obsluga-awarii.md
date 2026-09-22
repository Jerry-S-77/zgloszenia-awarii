# Etap 2: obsługa awarii Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Awarie przechodzą pełną maszynę stanów (zgłoszona → przyjęta → w naprawie ⇄ oczekuje na część → zamknięta, plus skróty i ponowne otwarcie), mają numer nadawany przez bazę, wersję do wykrywania konfliktów, komentarze i historię zmian oraz widok „Zadania" dla technik+. Kolejka offline nie blokuje się już na pierwszym odrzuconym zapisie.

**Architecture:** Kontynuacja hybrydy z etapu 1. Maszyna stanów i numeracja żyją w bazie (trigery `BEFORE`/`AFTER`), bo to one, nie interfejs, muszą być ostatnią linią obrony (klient offline, kolejka, ręczne zapytania). Interfejs ma tylko równoległą kopię reguł przejść (`src/lib/statusy-awarii.ts`) do pokazania, co wolno kliknąć — baza i tak zweryfikuje ponownie. Odczyty i zapisy nadal idą przez supabase-js (kolejka offline zostaje), bez nowych funkcji serwerowych.

**Tech Stack:** TanStack Start 1.168 + React 19, Supabase (Postgres RLS + trigery), Zod 3, Vitest (jednostkowe i RLS), Playwright (E2E, viewport telefonu).

**Spec:** `docs/superpowers/specs/2026-09-21-rozbudowa-obsluga-awarii-design.md` (sekcja 6 „Obsługa awarii", przekrojowo 4, 5, 9, 10). Plan nadrzędny: `docs/superpowers/plans/2026-09-21-plan-nadrzedny-etapy.md` (bramka jakości w sekcji 3, przypomnienia w sekcji 4 obowiązują w zadaniu 8).

## Global Constraints

- Wartości statusu w bazie: `zgloszona | przyjeta | w_naprawie | oczekuje_na_czesc | zamknieta` (bez diakrytyków). Etykiety w interfejsie po polsku, z diakrytykami (`src/lib/statusy-awarii.ts`).
- Przejścia dozwolone (egzekwowane triggerem `awarie_waliduj_przejscie`, kopia w `statusy-awarii.ts` tylko do UI):
  `zgloszona→przyjeta`, `zgloszona→zamknieta`, `przyjeta→w_naprawie`, `przyjeta→zamknieta`,
  `w_naprawie⇄oczekuje_na_czesc`, `w_naprawie→zamknieta`, `oczekuje_na_czesc→zamknieta`,
  `zamknieta→w_naprawie` (tylko kierownik/admin — ponowne otwarcie).
  Wykonanie jakiegokolwiek przejścia wymaga roli technik/kierownik/admin (pracownik nigdy nie zmienia statusu).
- Zamknięcie (przejście na `zamknieta`, każdą drogą) wymaga wypełnionych `przyczyna` i `data_zamkniecia` — trigger to sprawdza. `czas_przestoju_h` zostaje polem UI (może wynosić 0), baza go nie wymusza osobno.
- Konflikt wersji: klient zawsze wysyła oczekiwaną `wersja` w `.eq("wersja", oczekiwanaWersja)`. Trigger zwiększa `wersja` przy każdym UPDATE. Zero zmienionych wierszy przy istniejącym rekordzie = konflikt wersji, nie brak uprawnień.
- Zapis z kluczem service-role (`auth.uid() is null`) pomija walidację przejść i autora — tak samo jak istniejący trigger `awarie_pilnuj_zglaszajacego` z etapu 1. Używane przez testy i skrypty, nie przez aplikację.
- Numer nadaje wyłącznie baza (`AWR-<rok>-<NNN>`, `numeracja_awarii`, blokada wiersza w UPDATE). Klient nigdy nie wysyła `numer`; zgłoszenie utworzone offline pokazuje „oczekuje na numer" aż zsynchronizuje kolejka.
- `awarie_historia`: tylko dopisywanie, wpisuje wyłącznie trigger `awarie_zapisz_historie` (żadnej polityki INSERT dla `authenticated`). `awarie_komentarze`: `authenticated` może czytać i wstawiać (widoczność jak w `awarie`), autor ustawiany triggerem z `auth.uid()`, nigdy z klienta.
- Kolejka offline: operacja odrzucona z powodu konfliktu biznesowego (0 zmienionych wierszy, albo błąd z kodem Postgresa np. `P0001` z triggera przejść) **nie przerywa** reszty kolejki — trafia do stanu `do_sprawdzenia` i zostaje w IndexedDB do ręcznego przejrzenia; tylko błąd sieci (`czyBladSieci`) przerywa pętlę (spróbujemy ponownie przy następnej synchronizacji). Wersja IndexedDB **nie** rośnie w tym etapie (rekordy bez nowych pól dostają wartości domyślne przy odczycie) — podniesienie wersji i odrzucanie nieznanych kształtów jest zadaniem etapu 6.
- Komentarze i historia NIE przechodzą przez kolejkę offline — wymagają połączenia (`wymagajSieci()`, jak `profileQuery`/`urzadzeniaQuery`). To świadome uproszczenie: spec nie wymaga offline dla komentarzy, a rozszerzanie kolejki o kolejny typ operacji byłoby nieproporcjonalnym ryzykiem w tym etapie.
- Interfejs nawigacji: w tym etapie **nie ma jeszcze** „Przeglądy" (etap 3), więc pozycja „Zadania" (technik, kierownik, admin) jest dodawana bez niej; docelowy pięcio-/czteropozycyjny pasek z sekcji 10 specu (z „Przeglądy") powstanie w etapie 3. Kierownik zgodnie ze specem nie dostaje „Zadania" (ma „Analizy" zamiast — już tak jest od etapu 1).
- CSV eksport (`eksport.tsx`) nie jest ruszany w tym etapie — używanie `numer` w `ID_zgloszenia` to zadanie etapu 3 (spec sekcja 7). Surowa wartość `status` w eksporcie zmieni się razem z bazą (nowe polskie nazwy zamiast `Otwarta`/`Zamknieta`); to efekt uboczny akceptowalny, bo eksport i tak nie jest już zgodny z arkuszem Google (CLAUDE.md).
- Każdy commit kończy się trailerem: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. **Push tylko za osobną zgodą użytkownika.**
- Testy RLS działają wyłącznie na projekcie testowym (strażnik `tests/wspolne/ochrona-produkcji.ts` z etapu 1, bez zmian).
- `tsconfig` ma `exactOptionalPropertyTypes` i `noUncheckedIndexedAccess`: kod musi je respektować.

## File Structure

Tworzone:
- `supabase/migrations/20260922100000_etap2_statusy_numeracja_wersja.sql`
- `supabase/migrations/20260922110000_etap2_historia_komentarze.sql`
- `src/lib/statusy-awarii.ts`, `tests/unit/statusy-awarii.test.ts`
- `src/lib/komentarze.ts` (zapytania i zapis komentarzy)
- `src/components/awaria/OsStatusow.tsx`, `src/components/awaria/Komentarze.tsx`, `src/components/awaria/Historia.tsx`
- `src/components/DoSprawdzenia.tsx`
- `src/routes/zadania.tsx`
- `tests/rls/obsluga-awarii.test.ts`
- `tests/unit/offline-bledy.test.ts`
- `tests/e2e/obsluga-awarii.spec.ts`

Zmieniane: `src/lib/types.ts`, `src/lib/offline.ts`, `src/lib/awarie-cache.ts`, `src/lib/queries.ts`, `src/lib/uprawnienia.ts`, `src/components/AppShell.tsx`, `src/routes/index.tsx`, `src/routes/awarie.index.tsx`, `src/routes/awarie.$id.tsx`, `src/routes/dashboard.tsx`, `src/integrations/supabase/types.ts` (regeneracja ×2), `src/routeTree.gen.ts` (auto, po dodaniu `/zadania`), `tests/unit/awarie-cache.test.ts`, `tests/rls/macierz.test.ts`, `tests/e2e/konta-i-zgloszenie.spec.ts` (nowy test zimnego startu), `CLAUDE.md`, `README.md`, `roadmap.md`.

---

### Task 1: Migracja bazy — statusy, numeracja, wersja, przypisanie

**Files:**
- Create: `supabase/migrations/20260922100000_etap2_statusy_numeracja_wersja.sql`, `tests/rls/obsluga-awarii.test.ts`
- Modify: `tests/rls/macierz.test.ts`, `src/integrations/supabase/types.ts` (regeneracja)

**Interfaces:**
- Consumes: `tests/wspolne/srodowisko.ts` (`przygotujKonta`, `klientAdmin`, `zaloguj`, `KONTA`, `KluczKonta`).
- Produces (SQL): enum `status_awarii` (`zgloszona|przyjeta|w_naprawie|oczekuje_na_czesc|zamknieta`); tabela `numeracja_awarii(rok, ostatni)`; kolumny `awarie.numer` (text, nullable aż trigger ją ustawi), `awarie.wersja` (int, default 1), `awarie.przypisany_technik_id` (uuid → `profiles`); trigery `awarie_nadaj_numer` (BEFORE INSERT), `awarie_zwieksz_wersje` (BEFORE UPDATE), `awarie_waliduj_przejscie` (BEFORE UPDATE); zaktualizowana polityka `awarie_insert`.

- [ ] **Step 1: Utwórz gałąź**

```bash
cd "D:/Claude/Code_zgłaszanie awarii" && git checkout -b etap-2-obsluga-awarii
```
Expected: `Switched to a new branch 'etap-2-obsluga-awarii'`.

- [ ] **Step 2: Napisz test RLS dla numeracji, wersji i przejść** `tests/rls/obsluga-awarii.test.ts`

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KONTA, klientAdmin, przygotujKonta, zaloguj, type KluczKonta } from "../wspolne/srodowisko";

const ZNACZNIK = `TEST-ETAP2-${crypto.randomUUID()}`;
const admin = klientAdmin();
let id: Record<KluczKonta, string>;

type StatusTestowy = "zgloszona" | "przyjeta" | "w_naprawie" | "oczekuje_na_czesc" | "zamknieta";

async function wstaw(status: StatusTestowy, nazwa: string, dodatkowe: Record<string, unknown> = {}) {
  const rekord = {
    id: crypto.randomUUID(),
    nr_technologiczny: "HVAC-01",
    nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
    opis_awarii: `${ZNACZNIK} ${nazwa}`,
    krytycznosc_skutku: "Niska",
    status,
    zglaszajacy_id: id.pracownik,
    zglaszajacy_nazwa: "Test pracownik",
    ...dodatkowe,
  };
  const { data, error } = await admin
    .from("awarie")
    .insert(rekord)
    .select("id, numer, wersja")
    .single();
  if (error) throw error;
  return data as { id: string; numer: string | null; wersja: number };
}

beforeAll(async () => {
  id = await przygotujKonta();
});

afterAll(async () => {
  await admin.from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
});

describe("numeracja i wersja przy wstawieniu", () => {
  it("nadaje numer w formacie AWR-ROK-NNN i wersję 1", async () => {
    const a = await wstaw("zgloszona", "numeracja 1");
    const rok = new Date().getFullYear();
    expect(a.numer).toMatch(new RegExp(`^AWR-${rok}-\\d{3}$`));
    expect(a.wersja).toBe(1);
  });
  it("kolejne zgłoszenia dostają rosnące numery", async () => {
    const pierwsza = await wstaw("zgloszona", "numeracja 2");
    const druga = await wstaw("zgloszona", "numeracja 3");
    const nr = (n: typeof pierwsza) => Number(n.numer?.split("-")[2]);
    expect(nr(druga)).toBe(nr(pierwsza) + 1);
  });
});

describe("przejścia statusu", () => {
  it("technik przyjmuje zgłoszoną awarię (zgloszona -> przyjeta), wersja rośnie", async () => {
    const a = await wstaw("zgloszona", "przejscie ok");
    const technik = await zaloguj(KONTA.technik.email);
    const { data, error } = await technik
      .from("awarie")
      .update({ status: "przyjeta" })
      .eq("id", a.id)
      .eq("wersja", a.wersja)
      .select("status, wersja")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("przyjeta");
    expect(data?.wersja).toBe(2);
  });

  it("odrzuca niedozwolone przejście (zgloszona -> w_naprawie)", async () => {
    const a = await wstaw("zgloszona", "przejscie zle");
    const technik = await zaloguj(KONTA.technik.email);
    const { error } = await technik
      .from("awarie")
      .update({ status: "w_naprawie" })
      .eq("id", a.id)
      .eq("wersja", a.wersja);
    expect(error?.message).toContain("Niedozwolone przejście");
  });

  it("pracownik nie zmienia statusu", async () => {
    const a = await wstaw("zgloszona", "pracownik brak praw");
    const pracownik = await zaloguj(KONTA.pracownik.email);
    const { data } = await pracownik.from("awarie").update({ status: "przyjeta" }).eq("id", a.id).select();
    expect(data).toEqual([]);
  });

  it("ponowne otwarcie zamkniętej wymaga kierownika lub admina", async () => {
    const a = await wstaw("zamknieta", "reopen", {
      przyczyna: "test",
      czas_przestoju_h: 1,
      data_zamkniecia: new Date().toISOString(),
    });
    const technik = await zaloguj(KONTA.technik.email);
    const { error: bladTechnika } = await technik
      .from("awarie")
      .update({ status: "w_naprawie" })
      .eq("id", a.id)
      .eq("wersja", a.wersja);
    expect(bladTechnika?.message).toContain("kierownika");

    const kierownik = await zaloguj(KONTA.kierownik.email);
    const { data, error } = await kierownik
      .from("awarie")
      .update({ status: "w_naprawie" })
      .eq("id", a.id)
      .eq("wersja", a.wersja)
      .select("status")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("w_naprawie");
  });

  it("zamknięcie bez przyczyny lub czasu zamknięcia jest odrzucane", async () => {
    const a = await wstaw("w_naprawie", "zamkniecie bez danych");
    const technik = await zaloguj(KONTA.technik.email);
    const { error } = await technik
      .from("awarie")
      .update({ status: "zamknieta" })
      .eq("id", a.id)
      .eq("wersja", a.wersja);
    expect(error?.message).toContain("przyczyny");
  });
});

describe("konflikt wersji", () => {
  it("zapis z nieaktualną wersją zmienia 0 wierszy zamiast nadpisać", async () => {
    const a = await wstaw("zgloszona", "konflikt wersji");
    const technik = await zaloguj(KONTA.technik.email);
    await technik.from("awarie").update({ status: "przyjeta" }).eq("id", a.id).eq("wersja", a.wersja);
    const { data } = await technik
      .from("awarie")
      .update({ status: "w_naprawie" })
      .eq("id", a.id)
      .eq("wersja", a.wersja) // baza jest już na wersji 2
      .select();
    expect(data).toEqual([]);
  });
});

describe("przypisanie technika", () => {
  it("nie da się ustawić przypisanego technika przy wstawianiu", async () => {
    const pracownik = await zaloguj(KONTA.pracownik.email);
    const { error } = await pracownik.from("awarie").insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "x",
      opis_awarii: `${ZNACZNIK} przypisanie przy wstawieniu`,
      krytycznosc_skutku: "Niska",
      przypisany_technik_id: id.technik,
    });
    expect(error?.code).toBe("42501");
  });
});
```

- [ ] **Step 3: Uruchom, potwierdź FAIL**

Run: `npm run test:rls -- obsluga-awarii`
Expected: FAIL (kolumny `numer`/`wersja`/`przypisany_technik_id` i enum `status_awarii` nie istnieją).

- [ ] **Step 4: Napisz migrację** `supabase/migrations/20260922100000_etap2_statusy_numeracja_wersja.sql`

```sql
-- Etap 2: maszyna stanów statusu, numeracja, wersja i przypisanie technika.

-- Statusy po polsku, bez diakrytyków. Mapowanie ze starych wartości tekstowych.
create type public.status_awarii as enum ('zgloszona', 'przyjeta', 'w_naprawie', 'oczekuje_na_czesc', 'zamknieta');

alter table public.awarie drop constraint awarie_status_check;
alter table public.awarie
  alter column status type public.status_awarii
  using (case status when 'Otwarta' then 'zgloszona' when 'Zamknieta' then 'zamknieta' end)::public.status_awarii,
  alter column status set default 'zgloszona';

alter table public.awarie
  add column wersja integer not null default 1,
  add column przypisany_technik_id uuid references public.profiles (id) on delete set null,
  add column numer text;

create unique index awarie_numer_key on public.awarie (numer) where numer is not null;

-- Numeracja roczna: jeden licznik na rok, blokada wiersza serializuje wstawienia tego samego roku.
create table public.numeracja_awarii (
  rok integer primary key,
  ostatni integer not null default 0
);
alter table public.numeracja_awarii enable row level security;
revoke all on public.numeracja_awarii from anon, authenticated;
grant all on public.numeracja_awarii to service_role;

create or replace function public.awarie_nadaj_numer()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rok integer := extract(year from new.data_awarii)::integer;
  v_nastepny integer;
begin
  insert into public.numeracja_awarii (rok, ostatni) values (v_rok, 0)
    on conflict (rok) do nothing;
  update public.numeracja_awarii set ostatni = ostatni + 1
    where rok = v_rok
    returning ostatni into v_nastepny;
  new.numer := format('AWR-%s-%s', v_rok, lpad(v_nastepny::text, 3, '0'));
  return new;
end
$$;

create trigger awarie_numeracja
  before insert on public.awarie
  for each row execute function public.awarie_nadaj_numer();

-- Wersja: każdy UPDATE ją zwiększa; klient porównuje oczekiwaną wersję w WHERE (optymistyczna blokada).
create or replace function public.awarie_zwieksz_wersje()
returns trigger
language plpgsql as $$
begin
  new.wersja := old.wersja + 1;
  return new;
end
$$;

create trigger awarie_wersja
  before update on public.awarie
  for each row execute function public.awarie_zwieksz_wersje();

-- Maszyna stanów. Zapis z kluczem service-role (auth.uid() is null) pomija walidację,
-- tak jak istniejący trigger awarie_pilnuj_zglaszajacego z etapu 1 (testy, skrypty).
create or replace function public.awarie_waliduj_przejscie()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  dozwolone boolean;
begin
  if new.status = old.status then
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if not public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[]) then
    raise exception 'Brak uprawnień do zmiany statusu awarii';
  end if;
  if old.status = 'zamknieta' and new.status = 'w_naprawie'
     and not public.mam_role(array['kierownik', 'admin']::public.rola_uzytkownika[]) then
    raise exception 'Ponowne otwarcie zamkniętej awarii wymaga roli kierownika lub administratora';
  end if;
  dozwolone := case
    when old.status = 'zgloszona' and new.status in ('przyjeta', 'zamknieta') then true
    when old.status = 'przyjeta' and new.status in ('w_naprawie', 'zamknieta') then true
    when old.status = 'w_naprawie' and new.status in ('oczekuje_na_czesc', 'zamknieta') then true
    when old.status = 'oczekuje_na_czesc' and new.status in ('w_naprawie', 'zamknieta') then true
    when old.status = 'zamknieta' and new.status = 'w_naprawie' then true
    else false
  end;
  if not dozwolone then
    raise exception 'Niedozwolone przejście statusu: % -> %', old.status, new.status;
  end if;
  if new.status = 'zamknieta' and (new.przyczyna is null or new.data_zamkniecia is null) then
    raise exception 'Zamknięcie awarii wymaga przyczyny i czasu przestoju';
  end if;
  return new;
end
$$;

create trigger awarie_przejscie_statusu
  before update on public.awarie
  for each row execute function public.awarie_waliduj_przejscie();

-- Nowa awaria musi startować jako 'zgloszona', bez danych zamknięcia i bez przypisania z góry.
drop policy awarie_insert on public.awarie;
create policy awarie_insert on public.awarie for insert to authenticated
  with check (
    public.moja_rola() is not null
    and status = 'zgloszona'
    and data_zamkniecia is null
    and przyczyna is null
    and czas_przestoju_h is null
    and przypisany_technik_id is null
  );
```

- [ ] **Step 5: Zastosuj migrację na projekcie testowym (czynność użytkownika)**

`! npx supabase db push`. Expected: `Applying migration 20260922100000_etap2_statusy_numeracja_wersja.sql... Finished supabase db push.`

- [ ] **Step 6: Zaktualizuj `tests/rls/macierz.test.ts` do nowych wartości statusu.** Zmień:
  - w `wstaw()`: `status: "Otwarta"` → `status: "zgloszona"`;
  - w teście „nie może zmieniać zgłoszeń": `.update({ status: "Zamknieta" })` → `.update({ status: "zamknieta" })` i `expect(po?.status).toBe("Otwarta")` → `expect(po?.status).toBe("zgloszona")`;
  - w teście „technik zamyka awarię, ale nie podmieni zgłaszającego": zamknięcie wymaga teraz przyczyny i czasu zamknięcia (nowy trigger) — zastąp treść testu:

```ts
  it("technik zamyka awarię, ale nie podmieni zgłaszającego", async () => {
    const k = await zaloguj(KONTA.technik.email);
    const { data, error } = await k
      .from("awarie")
      .update({
        status: "zamknieta",
        przyczyna: "Test",
        data_zamkniecia: new Date().toISOString(),
        zglaszajacy_id: id.technik,
        zglaszajacy_nazwa: "Podmiana",
      })
      .eq("id", awariaPracownika)
      .eq("wersja", 1)
      .select("status, zglaszajacy_id, zglaszajacy_nazwa")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("zamknieta");
    expect(data?.zglaszajacy_id).toBe(id.pracownik);
    expect(data?.zglaszajacy_nazwa).toBe("Test pracownik");
    await admin.from("awarie").update({ status: "zgloszona" }).eq("id", awariaPracownika);
  });
```

- [ ] **Step 7: Zregeneruj typy z projektu testowego**

```bash
npx supabase gen types typescript --project-id <REF_PROJEKTU_TESTOWEGO> --schema public > src/integrations/supabase/types.ts
```
Expected: plik zawiera `status_awarii`, `numeracja_awarii`, `awarie.numer`/`wersja`/`przypisany_technik_id`. Dopisz na początku plik nagłówek `// Wygenerowano: npx supabase gen types typescript --project-id <ref> --schema public` (regenerację nadpisuje, więc sprawdź że nagłówek wrócił).

- [ ] **Step 8: Uruchom testy RLS.** Run: `npm run test:rls` — Expected: PASS (`macierz.test.ts` i `obsluga-awarii.test.ts`).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260922100000_etap2_statusy_numeracja_wersja.sql tests/rls/obsluga-awarii.test.ts tests/rls/macierz.test.ts src/integrations/supabase/types.ts
git commit -m "Add status machine, numbering and version columns for awarie" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Migracja bazy — historia i komentarze

**Files:**
- Create: `supabase/migrations/20260922110000_etap2_historia_komentarze.sql`
- Modify: `tests/rls/obsluga-awarii.test.ts`, `src/integrations/supabase/types.ts` (regeneracja)

**Interfaces:**
- Produces (SQL): enum `typ_historii_awarii`; tabele `awarie_historia(id, awaria_id, autor_id, typ, dane, created_at)` i `awarie_komentarze(id, awaria_id, autor_id, tresc, created_at)`; funkcja `widzi_awarie(uuid) returns boolean`; trigery `awarie_zapisz_historie` (AFTER INSERT OR UPDATE na `awarie`), `komentarze_pilnuj_autora` (BEFORE INSERT na `awarie_komentarze`).

- [ ] **Step 1: Dopisz testy RLS dla historii i komentarzy** do `tests/rls/obsluga-awarii.test.ts` (na końcu pliku, przed ostatnią zamykającą klamrą nic nie trzeba zmieniać — to nowe bloki `describe`)

```ts
describe("historia", () => {
  it("utworzenie i zmiana statusu zapisują wpisy historii, autor z konta", async () => {
    const a = await wstaw("zgloszona", "historia");
    const technik = await zaloguj(KONTA.technik.email);
    await technik.from("awarie").update({ status: "przyjeta" }).eq("id", a.id).eq("wersja", a.wersja);
    const { data, error } = await admin
      .from("awarie_historia")
      .select("typ, autor_id, dane")
      .eq("awaria_id", a.id)
      .order("created_at");
    expect(error).toBeNull();
    expect(data?.map((w) => w.typ)).toEqual(["utworzenie", "zmiana_statusu"]);
    expect(data?.[1]?.autor_id).toBe(id.technik);
    expect(data?.[1]?.dane).toMatchObject({ z: "zgloszona", na: "przyjeta" });
  });
  it("pracownik czyta historię własnej awarii, ale nie cudzej", async () => {
    const a = await wstaw("zgloszona", "historia widocznosc");
    const pracownik = await zaloguj(KONTA.pracownik.email);
    const { data: wlasna } = await pracownik.from("awarie_historia").select("id").eq("awaria_id", a.id);
    expect((wlasna ?? []).length).toBeGreaterThan(0);

    const cudza = await wstaw("zgloszona", "historia cudza", { zglaszajacy_id: id.pracownik2 });
    const { data: obca } = await pracownik.from("awarie_historia").select("id").eq("awaria_id", cudza.id);
    expect(obca).toEqual([]);
  });
  it("nikt nie wstawia ani nie zmienia historii bezpośrednio", async () => {
    const a = await wstaw("zgloszona", "historia bez ingerencji");
    const technik = await zaloguj(KONTA.technik.email);
    const { error } = await technik
      .from("awarie_historia")
      .insert({ awaria_id: a.id, typ: "edycja", dane: {} });
    expect(error?.code).toBe("42501");
  });
});

describe("komentarze", () => {
  it("zgłaszający dodaje komentarz do własnej awarii, autor z konta", async () => {
    const a = await wstaw("zgloszona", "komentarz wlasny");
    const pracownik = await zaloguj(KONTA.pracownik.email);
    const { data, error } = await pracownik
      .from("awarie_komentarze")
      .insert({ awaria_id: a.id, tresc: "Nadal awaria." })
      .select("autor_id, tresc")
      .single();
    expect(error).toBeNull();
    expect(data?.autor_id).toBe(id.pracownik);
  });
  it("pracownik nie komentuje cudzej awarii, technik może", async () => {
    const cudza = await wstaw("zgloszona", "komentarz cudzy", { zglaszajacy_id: id.pracownik2 });
    const pracownik = await zaloguj(KONTA.pracownik.email);
    const { error: bladPracownika } = await pracownik
      .from("awarie_komentarze")
      .insert({ awaria_id: cudza.id, tresc: "Nie moje." });
    expect(bladPracownika?.code).toBe("42501");

    const technik = await zaloguj(KONTA.technik.email);
    const { error } = await technik
      .from("awarie_komentarze")
      .insert({ awaria_id: cudza.id, tresc: "Przyjmuję zgłoszenie." });
    expect(error).toBeNull();
  });
  it("pusty komentarz jest odrzucany", async () => {
    const a = await wstaw("zgloszona", "komentarz pusty");
    const technik = await zaloguj(KONTA.technik.email);
    const { error } = await technik.from("awarie_komentarze").insert({ awaria_id: a.id, tresc: "   " });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom, potwierdź FAIL.** Run: `npm run test:rls -- obsluga-awarii` — Expected: FAIL (brak tabel `awarie_historia`/`awarie_komentarze`).

- [ ] **Step 3: Napisz migrację** `supabase/migrations/20260922110000_etap2_historia_komentarze.sql`

```sql
-- Etap 2: historia zmian (tylko dopisywanie) i komentarze awarii.

create type public.typ_historii_awarii as enum ('utworzenie', 'zmiana_statusu', 'przypisanie', 'edycja');

create table public.awarie_historia (
  id uuid primary key default gen_random_uuid(),
  awaria_id uuid not null references public.awarie (id) on delete cascade,
  autor_id uuid references public.profiles (id) on delete set null,
  typ public.typ_historii_awarii not null,
  dane jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.awarie_historia enable row level security;
revoke all on public.awarie_historia from anon, authenticated;
grant select on public.awarie_historia to authenticated;
grant all on public.awarie_historia to service_role;
create index awarie_historia_awaria_id_idx on public.awarie_historia (awaria_id, created_at);

create table public.awarie_komentarze (
  id uuid primary key default gen_random_uuid(),
  awaria_id uuid not null references public.awarie (id) on delete cascade,
  autor_id uuid references public.profiles (id) on delete set null,
  tresc text not null check (char_length(btrim(tresc)) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.awarie_komentarze enable row level security;
revoke all on public.awarie_komentarze from anon, authenticated;
grant select, insert on public.awarie_komentarze to authenticated;
grant all on public.awarie_komentarze to service_role;
create index awarie_komentarze_awaria_id_idx on public.awarie_komentarze (awaria_id, created_at);

-- Widoczność awarii, współdzielona przez historię i komentarze: taka sama reguła jak w awarie_select.
create or replace function public.widzi_awarie(p_awaria_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.awarie a where a.id = p_awaria_id and (
      public.mam_role(array['technik', 'kierownik', 'admin']::public.rola_uzytkownika[])
      or (public.moja_rola() is not null and a.zglaszajacy_id = auth.uid())
    )
  )
$$;
revoke all on function public.widzi_awarie(uuid) from public, anon;
grant execute on function public.widzi_awarie(uuid) to authenticated, service_role;

create policy awarie_historia_select on public.awarie_historia for select to authenticated
  using (public.widzi_awarie(awaria_id));

create policy awarie_komentarze_select on public.awarie_komentarze for select to authenticated
  using (public.widzi_awarie(awaria_id));
create policy awarie_komentarze_insert on public.awarie_komentarze for insert to authenticated
  with check (public.widzi_awarie(awaria_id));

-- Autor komentarza zawsze z konta, nigdy z klienta.
create or replace function public.komentarze_pilnuj_autora()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.autor_id := auth.uid();
  end if;
  return new;
end
$$;

create trigger awarie_komentarze_autor
  before insert on public.awarie_komentarze
  for each row execute function public.komentarze_pilnuj_autora();

-- Historia: utworzenie, zmiana statusu, zmiana przypisania. Trigger AFTER widzi już finalny wiersz
-- (numer, wersja i przejście statusu są już zweryfikowane przez trigery BEFORE z poprzedniej migracji).
create or replace function public.awarie_zapisz_historie()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.awarie_historia (awaria_id, autor_id, typ, dane)
      values (new.id, auth.uid(), 'utworzenie', jsonb_build_object('status', new.status));
    return new;
  end if;
  if new.status <> old.status then
    insert into public.awarie_historia (awaria_id, autor_id, typ, dane)
      values (new.id, auth.uid(), 'zmiana_statusu', jsonb_build_object('z', old.status, 'na', new.status));
  end if;
  if new.przypisany_technik_id is distinct from old.przypisany_technik_id then
    insert into public.awarie_historia (awaria_id, autor_id, typ, dane)
      values (new.id, auth.uid(), 'przypisanie', jsonb_build_object('technik_id', new.przypisany_technik_id));
  end if;
  return new;
end
$$;

create trigger awarie_historia_zapis
  after insert or update on public.awarie
  for each row execute function public.awarie_zapisz_historie();
```

- [ ] **Step 4: Zastosuj migrację na projekcie testowym (czynność użytkownika)**

`! npx supabase db push`. Expected: `Finished supabase db push.`

- [ ] **Step 5: Zregeneruj typy** (jak w zadaniu 1, krok 7) i uruchom `npm run test:rls` — Expected: PASS (wszystkie trzy pliki RLS).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260922110000_etap2_historia_komentarze.sql tests/rls/obsluga-awarii.test.ts src/integrations/supabase/types.ts
git commit -m "Add awarie_historia and awarie_komentarze tables" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Logika czysta — maszyna stanów w interfejsie

**Files:**
- Create: `src/lib/statusy-awarii.ts`
- Test: `tests/unit/statusy-awarii.test.ts`

**Interfaces:**
- Produces: `STATUSY_AWARII`, `type StatusAwarii`, `ETYKIETY_STATUSOW: Record<StatusAwarii, string>`, `OS_GLOWNA: readonly StatusAwarii[]`, `indeksNaOsi(status): number`, `type Przejscie = { na: StatusAwarii; etykietaAkcji: string; role: readonly Rola[] }`, `dozwolonePrzejscia(status, rola): Przejscie[]`, `wymagaDanychZamkniecia(naStatus): boolean`.

- [ ] **Step 1: Napisz testy** `tests/unit/statusy-awarii.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { dozwolonePrzejscia, indeksNaOsi, OS_GLOWNA, wymagaDanychZamkniecia } from "@/lib/statusy-awarii";

describe("dozwolonePrzejscia", () => {
  it("technik ze zgłoszonej: przyjmij albo zamknij", () => {
    const cele = dozwolonePrzejscia("zgloszona", "technik").map((p) => p.na);
    expect(cele).toEqual(["przyjeta", "zamknieta"]);
  });
  it("pracownik nie ma żadnego przejścia", () => {
    expect(dozwolonePrzejscia("zgloszona", "pracownik")).toEqual([]);
  });
  it("brak roli: brak przejść", () => {
    expect(dozwolonePrzejscia("zgloszona", null)).toEqual([]);
    expect(dozwolonePrzejscia("zgloszona", undefined)).toEqual([]);
  });
  it("w_naprawie i oczekuje_na_czesc są wzajemne", () => {
    expect(dozwolonePrzejscia("w_naprawie", "technik").map((p) => p.na)).toContain("oczekuje_na_czesc");
    expect(dozwolonePrzejscia("oczekuje_na_czesc", "technik").map((p) => p.na)).toContain("w_naprawie");
  });
  it("z zamkniętej wychodzi tylko ponowne otwarcie, tylko dla kierownika i admina", () => {
    expect(dozwolonePrzejscia("zamknieta", "technik")).toEqual([]);
    const cele = dozwolonePrzejscia("zamknieta", "kierownik").map((p) => p.na);
    expect(cele).toEqual(["w_naprawie"]);
    expect(dozwolonePrzejscia("zamknieta", "admin").map((p) => p.na)).toEqual(["w_naprawie"]);
  });
});

describe("indeksNaOsi", () => {
  it("cztery główne kroki w kolejności", () => {
    expect(OS_GLOWNA).toEqual(["zgloszona", "przyjeta", "w_naprawie", "zamknieta"]);
    expect(indeksNaOsi("zgloszona")).toBe(0);
    expect(indeksNaOsi("przyjeta")).toBe(1);
    expect(indeksNaOsi("w_naprawie")).toBe(2);
    expect(indeksNaOsi("zamknieta")).toBe(3);
  });
  it("oczekuje_na_czesc dzieli pozycję z w_naprawie (bocznik na osi)", () => {
    expect(indeksNaOsi("oczekuje_na_czesc")).toBe(indeksNaOsi("w_naprawie"));
  });
});

describe("wymagaDanychZamkniecia", () => {
  it("tylko przejście na 'zamknieta' wymaga przyczyny i czasu przestoju", () => {
    expect(wymagaDanychZamkniecia("zamknieta")).toBe(true);
    expect(wymagaDanychZamkniecia("przyjeta")).toBe(false);
    expect(wymagaDanychZamkniecia("w_naprawie")).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom, potwierdź FAIL.** Run: `npx vitest run tests/unit/statusy-awarii.test.ts` — Expected: FAIL (brak modułu).

- [ ] **Step 3: Zaimplementuj `src/lib/statusy-awarii.ts`**

```ts
import type { Rola } from "./uprawnienia";

export const STATUSY_AWARII = [
  "zgloszona",
  "przyjeta",
  "w_naprawie",
  "oczekuje_na_czesc",
  "zamknieta",
] as const;
export type StatusAwarii = (typeof STATUSY_AWARII)[number];

export const ETYKIETY_STATUSOW: Record<StatusAwarii, string> = {
  zgloszona: "Zgłoszona",
  przyjeta: "Przyjęta",
  w_naprawie: "W naprawie",
  oczekuje_na_czesc: "Oczekuje na część",
  zamknieta: "Zamknięta",
};

export type Przejscie = { na: StatusAwarii; etykietaAkcji: string; role: readonly Rola[] };

const OBSLUGA: readonly Rola[] = ["technik", "kierownik", "admin"];
const DECYZJA: readonly Rola[] = ["kierownik", "admin"];

/** Zwierciadło triggera `awarie_waliduj_przejscie` (baza jest ostatnią linią obrony, to tylko UI). */
const PRZEJSCIA: Record<StatusAwarii, Przejscie[]> = {
  zgloszona: [
    { na: "przyjeta", etykietaAkcji: "Przyjmij zgłoszenie", role: OBSLUGA },
    { na: "zamknieta", etykietaAkcji: "Zamknij (odrzuć)", role: OBSLUGA },
  ],
  przyjeta: [
    { na: "w_naprawie", etykietaAkcji: "Rozpocznij naprawę", role: OBSLUGA },
    { na: "zamknieta", etykietaAkcji: "Zamknij (odrzuć)", role: OBSLUGA },
  ],
  w_naprawie: [
    { na: "oczekuje_na_czesc", etykietaAkcji: "Wstrzymaj — czeka na część", role: OBSLUGA },
    { na: "zamknieta", etykietaAkcji: "Zamknij awarię", role: OBSLUGA },
  ],
  oczekuje_na_czesc: [
    { na: "w_naprawie", etykietaAkcji: "Wznów naprawę", role: OBSLUGA },
    { na: "zamknieta", etykietaAkcji: "Zamknij awarię", role: OBSLUGA },
  ],
  zamknieta: [{ na: "w_naprawie", etykietaAkcji: "Otwórz ponownie", role: DECYZJA }],
};

/** Dozwolone kolejne statusy dla danej roli z bieżącego statusu (pusta lista = brak przejść). */
export function dozwolonePrzejscia(status: StatusAwarii, rola: Rola | null | undefined): Przejscie[] {
  if (!rola) return [];
  return PRZEJSCIA[status].filter((p) => p.role.includes(rola));
}

/** Cztery główne kroki osi; „oczekuje_na_czesc" to bocznik pokazywany jako odznaka na kroku „w_naprawie". */
export const OS_GLOWNA: readonly StatusAwarii[] = ["zgloszona", "przyjeta", "w_naprawie", "zamknieta"];

export function indeksNaOsi(status: StatusAwarii): number {
  const s = status === "oczekuje_na_czesc" ? "w_naprawie" : status;
  return OS_GLOWNA.indexOf(s);
}

/** Zwierciadło reguły z triggera: tylko przejście NA „zamknieta" wymaga przyczyny i czasu przestoju. */
export function wymagaDanychZamkniecia(naStatus: StatusAwarii): boolean {
  return naStatus === "zamknieta";
}
```

- [ ] **Step 4: Uruchom.** Run: `npx vitest run tests/unit/statusy-awarii.test.ts` — Expected: PASS (11 testów).

- [ ] **Step 5: Commit**

```bash
git add src/lib/statusy-awarii.ts tests/unit/statusy-awarii.test.ts
git commit -m "Add client-side mirror of the awarie status machine" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Dostosowanie istniejącego kodu do nowego schematu

**Files:**
- Modify: `src/lib/types.ts`, `src/routes/index.tsx`, `src/routes/awarie.index.tsx`, `src/routes/dashboard.tsx`, `tests/unit/awarie-cache.test.ts`

**Interfaces:**
- Consumes: `StatusAwarii`, `ETYKIETY_STATUSOW` z `statusy-awarii.ts` (zadanie 3).

- [ ] **Step 1: Zaktualizuj `src/lib/types.ts`**

```ts
import type { StatusAwarii } from "./statusy-awarii";

export type Urzadzenie = {
  nr_technologiczny: string;
  nazwa_urzadzenia: string;
  kategoria: string | null;
  lokalizacja: string | null;
  krytycznosc: string | null;
  wlasciciel: string | null;
  status_w_rejestrze: string;
};

export type Awaria = {
  id: string;
  nr_technologiczny: string;
  nazwa_urzadzenia: string;
  data_awarii: string;
  opis_awarii: string;
  przyczyna: string | null;
  czas_przestoju_h: number | null;
  krytycznosc_skutku: string;
  zglaszajacy_id: string | null;
  zglaszajacy_nazwa: string | null;
  status: StatusAwarii;
  data_zamkniecia: string | null;
  numer: string | null;
  wersja: number;
  przypisany_technik_id: string | null;
};

export type AwariaLokalna = Awaria & { _pending?: boolean };
```

- [ ] **Step 2: Zaktualizuj zgłoszenie** `src/routes/index.tsx`. W wywołaniu `zapiszAwarie` zmień `status: "Otwarta"` na `status: "zgloszona"`, dodaj `numer: null, wersja: 1, przypisany_technik_id: null` do wysyłanego rekordu (baza je nadpisze/zignoruje odpowiednio, ale typ `Awaria` ich teraz wymaga), i zmień tekst pod przyciskiem:

```tsx
        status: "zgloszona",
        data_zamkniecia: null,
        numer: null,
        wersja: 1,
        przypisany_technik_id: null,
```
oraz
```tsx
        <p className="text-center text-xs text-muted-foreground">
          Status zgłoszenia ustawiany automatycznie na „Zgłoszona”. Numer nada system po zapisaniu.
        </p>
```

- [ ] **Step 3: Zaktualizuj filtr statusu na liście** `src/routes/awarie.index.tsx`. Zamień blok `SelectItem` statusu:

```tsx
import { ETYKIETY_STATUSOW, STATUSY_AWARII } from "@/lib/statusy-awarii";
```
```tsx
            <SelectContent>
              <SelectItem value={WSZYSTKIE}>Każdy status</SelectItem>
              {STATUSY_AWARII.map((s) => (
                <SelectItem key={s} value={s}>
                  {ETYKIETY_STATUSOW[s]}
                </SelectItem>
              ))}
            </SelectContent>
```
i odznakę statusu na karcie (kolor: zamknięta = sukces, w trakcie/oczekuje = ostrzeżenie, zgłoszona = domyślny):

```tsx
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    a.status === "zamknieta"
                      ? "bg-success text-success-foreground"
                      : "bg-warning text-warning-foreground"
                  }`}
                >
                  {ETYKIETY_STATUSOW[a.status]}
                </span>
```
Numer zamiast surowego `nr_technologiczny` jako nagłówek karty (pokazuje „oczekuje na numer" dla wpisów z kolejki):
```tsx
                <span className="font-display text-lg font-bold">
                  {a.numer ?? "oczekuje na numer"}
                </span>
                <span className="text-sm text-muted-foreground">{a.nr_technologiczny}</span>
```

- [ ] **Step 4: Zaktualizuj kafelek „Otwarte” w `src/routes/dashboard.tsx`**

```tsx
        <Kafel
          etykieta="Otwarte"
          wartosc={awarie.filter((a) => a.status !== "zamknieta").length}
        />
```

- [ ] **Step 5: Napraw istniejący test, który konstruuje `AwariaLokalna` ręcznie** `tests/unit/awarie-cache.test.ts` — jego lokalny helper `awaria()` musi nadążać za nowym typem (pola `numer`, `wersja`, `przypisany_technik_id` są teraz wymagane, a `status: "Otwarta"` już nie należy do `StatusAwarii`):

```ts
const awaria = (id: string, dodatki: Partial<AwariaLokalna> = {}): AwariaLokalna => ({
  id,
  nr_technologiczny: "HVAC-01",
  nazwa_urzadzenia: "AHU",
  data_awarii: "2026-09-21T10:00:00.000Z",
  opis_awarii: id,
  przyczyna: null,
  czas_przestoju_h: null,
  krytycznosc_skutku: "Niska",
  zglaszajacy_id: null,
  zglaszajacy_nazwa: null,
  status: "zgloszona",
  data_zamkniecia: null,
  numer: "AWR-2026-001",
  wersja: 1,
  przypisany_technik_id: null,
  ...dodatki,
});
```
(tylko definicja helpera się zmienia; trzy istniejące testy w pliku zostają bez zmian, bo nie odwołują się do `status` wprost).

- [ ] **Step 6: Sprawdź typy i lint.** Run: `npm run typecheck && npm run lint && npm test` — Expected: 0 nowych błędów, wszystkie testy jednostkowe PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/routes/index.tsx src/routes/awarie.index.tsx src/routes/dashboard.tsx tests/unit/awarie-cache.test.ts
git commit -m "Adapt existing screens and tests to the new Polish status values" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Kolejka offline — konflikt biznesowy nieblokujący, scalanie, poprawki z etapu 1

**Files:**
- Modify: `src/lib/offline.ts`, `src/lib/awarie-cache.ts`, `src/lib/queries.ts`
- Create: `src/components/DoSprawdzenia.tsx`
- Test: `tests/unit/awarie-cache.test.ts` (rozszerzenie), `tests/unit/offline-bledy.test.ts`

**Interfaces:**
- Produces: `type StatusOperacji = "oczekuje" | "do_sprawdzenia"`; `QueueOp` z polami `status`, `powod?`, a `update` dodatkowo `oczekiwanaWersja?: number`; `getMojaKolejka()` zwraca tylko `oczekuje`; `getDoSprawdzenia(userId)`, `odrzucOperacjeDoSprawdzenia(opId)`; `class KonfliktWersjiError extends Error`; `aktualizujAwarie(id, zmiany, oczekiwanaWersja?)`; `scalAwarie(zdalne, kolejka): AwariaLokalna[]` (przeniesione z `queries.ts` do `awarie-cache.ts`); `klasyfikujOdrzucenie(blad): "siec" | "biznesowy"`.
- Consumes: `klasyfikujSesje` z `uzytkownik-cache.ts` (etap 1).

- [ ] **Step 1: Napisz testy klasyfikacji odrzucenia i scalania** `tests/unit/offline-bledy.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { klasyfikujOdrzucenie } from "@/lib/offline";

describe("klasyfikujOdrzucenie", () => {
  it("błąd bez kodu (sieć) przerywa kolejkę", () => {
    expect(klasyfikujOdrzucenie({ message: "Failed to fetch" })).toBe("siec");
  });
  it("błąd z kodem Postgresa (np. z triggera przejść) to konflikt biznesowy", () => {
    expect(klasyfikujOdrzucenie({ code: "P0001", message: "Niedozwolone przejście" })).toBe("biznesowy");
  });
  it("brak błędu (zero zmienionych wierszy, np. nieaktualna wersja) to konflikt biznesowy", () => {
    expect(klasyfikujOdrzucenie(null)).toBe("biznesowy");
  });
});
```

- [ ] **Step 2: Rozszerz testy scalania** w `tests/unit/awarie-cache.test.ts` — dopisz na końcu pliku, ponownie używając istniejącego lokalnego helpera `awaria()` (zadanie 4, krok 5) i nowego `op()`:

```ts
import { scalAwarie } from "@/lib/awarie-cache";
import type { QueueOp } from "@/lib/offline";

const op = (dane: Partial<QueueOp> & Pick<QueueOp, "type" | "payload">): QueueOp =>
  ({ opId: crypto.randomUUID(), createdAt: 0, userId: "u1", status: "oczekuje", ...dane }) as QueueOp;

describe("scalAwarie", () => {
  it("bez kolejki zwraca zdalne posortowane malejąco po dacie", () => {
    const a = awaria("a", { data_awarii: "2026-09-20T10:00:00.000Z" });
    const b = awaria("b", { data_awarii: "2026-09-21T10:00:00.000Z" });
    expect(scalAwarie([a, b], []).map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("wstawienie z kolejki dokłada się z _pending, bez duplikatu po synchronizacji", () => {
    const zdalna = awaria("a");
    const lokalna = op({ type: "insert", payload: awaria("nowa") });
    const wynik = scalAwarie([zdalna], [lokalna]);
    expect(wynik.map((a) => a.id).sort()).toEqual(["a", "nowa"]);
    expect(wynik.find((a) => a.id === "nowa")?._pending).toBe(true);
    // Po synchronizacji: to samo id istnieje już zdalnie, insert znika z kolejki -> brak duplikatu.
    const poSynchronizacji = scalAwarie([zdalna, awaria("nowa")], []);
    expect(poSynchronizacji).toHaveLength(2);
  });
  it("aktualizacja z kolejki nakłada się na wiersz zdalny i ustawia _pending", () => {
    const zdalna = awaria("a", { status: "zgloszona" });
    const zmiana = op({ type: "update", payload: { id: "a", status: "zamknieta" } });
    const [wynik] = scalAwarie([zdalna], [zmiana]);
    expect(wynik?.status).toBe("zamknieta");
    expect(wynik?._pending).toBe(true);
  });
  it("scalAwarie samo nie filtruje 'do_sprawdzenia' — ufa wejściu, filtrowanie to obowiązek wywołującego", () => {
    const zdalna = awaria("a");
    const odrzucona = op({
      type: "update",
      payload: { id: "a", status: "zamknieta" },
      status: "do_sprawdzenia",
    });
    // Ta funkcja przyjmuje każdą przekazaną operację, więc nadal ją zastosuje. Dlatego
    // getMojaKolejka MUSI filtrować do "oczekuje" PRZED wywołaniem scalAwarie (patrz krok 6 tego
    // zadania) — ten test dokumentuje kontrakt, nie zachowanie całego potoku odczytu.
    const [wynik] = scalAwarie([zdalna], [odrzucona]);
    expect(wynik?.status).toBe("zamknieta");
  });
});
```

- [ ] **Step 3: Uruchom, potwierdź FAIL.** Run: `npx vitest run tests/unit/offline-bledy.test.ts tests/unit/awarie-cache.test.ts` — Expected: FAIL (`klasyfikujOdrzucenie` i `scalAwarie` nie istnieją).

- [ ] **Step 4: Przenieś i rozszerz scalanie w `src/lib/awarie-cache.ts`**

```ts
import type { QueueOp } from "./offline";
import type { AwariaLokalna } from "./types";

/**
 * Zdalne wiersze do listy awarii: udane pobranie, a przy porażce (offline, błąd API) wiersze z
 * poprzedniego pobrania tego samego zapytania, żeby lista nie zawężała się do samej kolejki lokalnej.
 * Znacznik `_pending` zdejmujemy: wiersze oczekujące są ponownie wyprowadzane z kolejki lokalnej
 * (wstawienia i zmiany), a wiersz zdalny ze zmianą w kolejce nie może przy tym zniknąć.
 */
export function zdalneLubZCache(
  pobrane: AwariaLokalna[] | null,
  cache: AwariaLokalna[] | undefined,
): AwariaLokalna[] {
  if (pobrane) return pobrane;
  return (cache ?? []).map(({ _pending: _pominiety, ...reszta }) => reszta);
}

/**
 * Łączy wiersze zdalne z kolejką lokalną: wstawienia jeszcze niezsynchronizowane dokładają się do
 * listy (bez duplikatu, gdy to samo id trafiło już zdalnie), a aktualizacje z kolejki nakładają się
 * na odpowiadający wiersz. Wywołujący (queries.ts) musi wcześniej odfiltrować operacje `do_sprawdzenia`
 * (przez `getMojaKolejka`) — ta funkcja ufa, że dostała tylko aktywne operacje.
 */
export function scalAwarie(zdalne: AwariaLokalna[], kolejka: QueueOp[]): AwariaLokalna[] {
  const lokalne = kolejka
    .filter((op) => op.type === "insert")
    .map((op) => ({ ...(op.payload as AwariaLokalna), _pending: true }));
  const zmiany = kolejka.filter((op) => op.type === "update");
  const lokalneId = new Set(lokalne.map((a) => a.id));
  const wszystkie = [...lokalne, ...zdalne.filter((a) => !lokalneId.has(a.id))].map((a) => {
    const zm = zmiany.filter((z) => z.payload.id === a.id);
    return zm.length
      ? { ...a, ...Object.assign({}, ...zm.map((z) => z.payload)), _pending: true }
      : a;
  });
  return wszystkie.sort((a, b) => b.data_awarii.localeCompare(a.data_awarii));
}
```

- [ ] **Step 5: Uprość `src/lib/queries.ts`** — zamień ręczne scalanie w `awarieQuery.queryFn` na wywołanie `scalAwarie`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { scalAwarie, zdalneLubZCache } from "./awarie-cache";
import { getMojaKolejka } from "./offline";
import type { AwariaLokalna, Urzadzenie } from "./types";
```
(reszta pliku bez zmian aż do `awarieQuery`, gdzie ciało `queryFn` staje się:)
```ts
  queryFn: async ({ client, queryKey }): Promise<AwariaLokalna[]> => {
    let pobrane: AwariaLokalna[] | null = null;
    try {
      wymagajSieci();
      const { data, error } = await supabase
        .from("awarie")
        .select("*")
        .order("data_awarii", { ascending: false });
      if (error) throw error;
      pobrane = (data ?? []) as AwariaLokalna[];
    } catch {
      pobrane = null;
    }
    const zdalne = zdalneLubZCache(pobrane, client.getQueryData<AwariaLokalna[]>(queryKey));
    const kolejka = await getMojaKolejka();
    return scalAwarie(zdalne, kolejka);
  },
```

- [ ] **Step 6: Przepisz `src/lib/offline.ts`** — kolejka ze statusem operacji, nieblokujące odrzucenia, poprawka `biezacyUserId`, konflikt wersji:

```ts
import { supabase } from "@/integrations/supabase/client";
import { czyBladSieci, czyDuplikat } from "./kolejka-bledy";
import type { Awaria } from "./types";
import { klasyfikujSesje, odczytajIdZCache, wybierzUserId } from "./uzytkownik-cache";

const DB_NAME = "awarie-offline";
const DB_VERSION = 2;
const STORE = "queue";

export type StatusOperacji = "oczekuje" | "do_sprawdzenia";

// Każda operacja należy do konta, które ją zapisało: na wspólnym telefonie zgłoszenie
// jednej osoby nie może zostać wysłane (ani wyświetlone) na koncie innej.
export type QueueOp =
  | { opId: string; type: "insert"; payload: Awaria; createdAt: number; userId: string; status: StatusOperacji; powod?: string }
  | {
      opId: string;
      type: "update";
      payload: { id: string } & Partial<Awaria>;
      createdAt: number;
      userId: string;
      status: StatusOperacji;
      powod?: string;
      oczekiwanaWersja?: number;
    };

/** Operacja bez opId, daty, statusu i właściciela: te pola dokłada `zakolejkuj`. */
export type NowaOperacja =
  | { type: "insert"; payload: Awaria }
  | { type: "update"; payload: { id: string } & Partial<Awaria>; oczekiwanaWersja?: number };

export class KonfliktWersjiError extends Error {
  constructor() {
    super("Ktoś już zmienił tę awarię, odśwież.");
    this.name = "KonfliktWersjiError";
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "opId" });
      } else if (event.oldVersion < 2) {
        // Wersja 1 zapisywała operacje bez właściciela (userId): nie da się ich bezpiecznie
        // przypisać do konta, a danych produkcyjnych jeszcze nie ma, więc kolejkę czyścimy.
        req.transaction?.objectStore(STORE).clear();
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

// Offline z wygasłym tokenem getSession() zwraca null dopiero po wielu nieudanych próbach odświeżenia
// (kilkadziesiąt sekund), więc offline bierzemy id z zapisanego profilu od razu. Online sesję null
// z błędem (nieudane odświeżenie tokenu, tak jak offline) traktujemy jak nieokreśloną, nie jak
// wylogowanie: inaczej mutacje w tym oknie poszłyby anonimowo zamiast trafić do kolejki.
export async function biezacyUserId(): Promise<string | null> {
  const online = typeof navigator === "undefined" || navigator.onLine;
  const zCache = odczytajIdZCache();
  if (!online && zCache) return zCache;
  const { data, error } = await supabase.auth.getSession();
  const sesjaId = data.session?.user.id ?? null;
  if (klasyfikujSesje(sesjaId, error) === "nieokreslona" && zCache) return zCache;
  return wybierzUserId(sesjaId, online, zCache);
}

export async function enqueue(op: QueueOp) {
  await tx("readwrite", (s) => s.put(op));
  window.dispatchEvent(new Event("queue-changed"));
}

/** Dokłada do kolejki operację zalogowanego użytkownika; bez sesji nic nie zapisuje. */
async function zakolejkuj(op: NowaOperacja) {
  const userId = await biezacyUserId();
  if (!userId) throw new Error("Zaloguj się, aby zapisać zgłoszenie.");
  await enqueue({
    ...op,
    opId: crypto.randomUUID(),
    createdAt: Date.now(),
    userId,
    status: "oczekuje",
  } as QueueOp);
}

/** Cała kolejka (wszystkie konta) albo, gdy podano `userId`, tylko operacje tego konta. Rekordy
 *  zapisane przed dodaniem pola `status` (etap 1) dostają domyślnie "oczekuje". */
export async function getQueue(userId?: string): Promise<QueueOp[]> {
  if (typeof indexedDB === "undefined") return [];
  const all = await tx<QueueOp[]>("readonly", (s) => s.getAll());
  return all
    .map((op) => ({ status: "oczekuje" as const, ...op }))
    .filter((op) => userId === undefined || op.userId === userId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Aktywne operacje zalogowanego użytkownika (bez "do_sprawdzenia"); bez sesji pusta lista. */
export async function getMojaKolejka(): Promise<QueueOp[]> {
  if (typeof indexedDB === "undefined") return [];
  const userId = await biezacyUserId();
  if (!userId) return [];
  return (await getQueue(userId)).filter((op) => op.status === "oczekuje");
}

/** Operacje zalogowanego użytkownika odrzucone z powodu konfliktu biznesowego, do ręcznego przejrzenia. */
export async function getDoSprawdzenia(): Promise<QueueOp[]> {
  if (typeof indexedDB === "undefined") return [];
  const userId = await biezacyUserId();
  if (!userId) return [];
  return (await getQueue(userId)).filter((op) => op.status === "do_sprawdzenia");
}

async function remove(opId: string) {
  await tx("readwrite", (s) => s.delete(opId));
}

/** Usuwa z kolejki wszystkie operacje danego konta (np. przy świadomym wylogowaniu). */
export async function usunOperacjeUzytkownika(userId: string): Promise<void> {
  const ops = await getQueue(userId);
  for (const op of ops) await remove(op.opId);
  if (ops.length > 0) window.dispatchEvent(new Event("queue-changed"));
}

/** Odrzuca (usuwa) wpis z listy „Do sprawdzenia" po ręcznym przejrzeniu przez użytkownika. */
export async function odrzucOperacjeDoSprawdzenia(opId: string): Promise<void> {
  await remove(opId);
  window.dispatchEvent(new Event("queue-changed"));
}

async function oznaczDoSprawdzenia(opId: string, powod: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    const req = store.get(opId);
    req.onsuccess = () => {
      const op = req.result as QueueOp | undefined;
      if (!op) return resolve();
      const zapis = store.put({ ...op, status: "do_sprawdzenia", powod });
      zapis.onsuccess = () => resolve();
      zapis.onerror = () => reject(zapis.error);
    };
    req.onerror = () => reject(req.error);
  });
  window.dispatchEvent(new Event("queue-changed"));
}

/**
 * Rozróżnia błąd sieci (operacja wraca do kolejki, spróbujemy ponownie) od odrzucenia biznesowego
 * (nieaktualna wersja — zero zmienionych wierszy, `blad` jest wtedy `null` — albo wyjątek z
 * triggera/RLS, np. niedozwolone przejście statusu): to drugie trafia do "Do sprawdzenia" i NIE
 * blokuje reszty kolejki.
 */
export function klasyfikujOdrzucenie(
  blad: { code?: string | undefined; message?: string | undefined } | null | undefined,
): "siec" | "biznesowy" {
  return blad && czyBladSieci(blad) ? "siec" : "biznesowy";
}

function opisOdrzucenia(
  blad: { message?: string | undefined } | null | undefined,
  brakWierszy: boolean,
): string {
  if (blad?.message) return blad.message;
  if (brakWierszy) return "Zgłoszenie zostało już zmienione albo nie istnieje.";
  return "Zapis został odrzucony.";
}

let syncing = false;

/** Konflikt biznesowy nie przerywa pętli: trafia do "Do sprawdzenia", a reszta kolejki idzie dalej. */
export async function syncQueue(): Promise<number> {
  if (syncing || typeof navigator === "undefined" || !navigator.onLine) return 0;
  const userId = await biezacyUserId();
  if (!userId) return 0;
  syncing = true;
  let done = 0;
  try {
    const ops = (await getQueue(userId)).filter((op) => op.status === "oczekuje");
    for (const op of ops) {
      let blad: { code?: string; message?: string } | null = null;
      let brakWierszy = false;
      if (op.type === "insert") {
        const { error } = await supabase.from("awarie").insert(op.payload);
        if (error && !czyDuplikat(error)) blad = error;
      } else {
        const { id, ...rest } = op.payload;
        let zapytanie = supabase.from("awarie").update(rest).eq("id", id);
        if (op.oczekiwanaWersja !== undefined) {
          zapytanie = zapytanie.eq("wersja", op.oczekiwanaWersja);
        }
        const { data, error } = await zapytanie.select("id");
        if (error) blad = error;
        else if (!data || data.length === 0) brakWierszy = true;
      }
      if (!blad && !brakWierszy) {
        await remove(op.opId);
        done++;
        continue;
      }
      if (klasyfikujOdrzucenie(blad) === "siec") break;
      await oznaczDoSprawdzenia(op.opId, opisOdrzucenia(blad, brakWierszy));
    }
  } finally {
    syncing = false;
    window.dispatchEvent(new Event("queue-changed"));
  }
  return done;
}

function powodBledu(blad: { code?: string | undefined }): string {
  return blad.code === "42501"
    ? "brak uprawnień lub konto jest zablokowane."
    : "serwer odrzucił zapis. Spróbuj ponownie lub skontaktuj się z administratorem.";
}

/**
 * Zapisuje zgłoszenie: online -> prosto do bazy, offline lub przy błędzie sieci -> kolejka
 * lokalna. Odmowa serwera (RLS, ograniczenia) rzuca błąd zamiast trafiać do kolejki, bo
 * ponawianie takiej operacji nigdy by się nie udało.
 */
export async function zapiszAwarie(rekord: Awaria): Promise<"zsynchronizowano" | "lokalnie"> {
  if (navigator.onLine) {
    const { error } = await supabase.from("awarie").insert(rekord);
    if (!error || czyDuplikat(error)) return "zsynchronizowano";
    if (!czyBladSieci(error)) {
      throw new Error(`Nie udało się zapisać zgłoszenia: ${powodBledu(error)}`);
    }
  }
  await zakolejkuj({ type: "insert", payload: rekord });
  return "lokalnie";
}

/**
 * `oczekiwanaWersja`, gdy podana, chroni przed nadpisaniem cudzej zmiany: zero zmienionych wierszy
 * przy istniejącym rekordzie online rzuca `KonfliktWersjiError` zamiast ogólnego błędu.
 */
export async function aktualizujAwarie(
  id: string,
  zmiany: Partial<Awaria>,
  oczekiwanaWersja?: number,
): Promise<"zsynchronizowano" | "lokalnie"> {
  if (navigator.onLine) {
    let zapytanie = supabase.from("awarie").update(zmiany).eq("id", id);
    if (oczekiwanaWersja !== undefined) zapytanie = zapytanie.eq("wersja", oczekiwanaWersja);
    const { data, error } = await zapytanie.select("id");
    if (!error) {
      if (data && data.length > 0) return "zsynchronizowano";
      if (oczekiwanaWersja !== undefined) {
        const { data: istnieje } = await supabase.from("awarie").select("id").eq("id", id).maybeSingle();
        if (istnieje) throw new KonfliktWersjiError();
      }
      throw new Error("Nie udało się zapisać zmiany: brak uprawnień lub zgłoszenie nie istnieje.");
    }
    if (!czyBladSieci(error)) {
      throw new Error(`Nie udało się zapisać zmiany: ${powodBledu(error)}`);
    }
  }
  await zakolejkuj({ type: "update", payload: { id, ...zmiany }, oczekiwanaWersja });
  return "lokalnie";
}
```

- [ ] **Step 7: Uruchom testy jednostkowe.** Run: `npm test` — Expected: PASS (wszystkie pliki, w tym nowe `offline-bledy.test.ts` i rozszerzony `awarie-cache.test.ts`).

- [ ] **Step 8: Zbuduj komponent „Do sprawdzenia"** `src/components/DoSprawdzenia.tsx`

```tsx
import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getDoSprawdzenia, odrzucOperacjeDoSprawdzenia, type QueueOp } from "@/lib/offline";

export function DoSprawdzenia() {
  const [otwarte, setOtwarte] = useState(false);
  const [operacje, setOperacje] = useState<QueueOp[]>([]);

  useEffect(() => {
    let anulowane = false;
    const odswiez = async () => {
      const lista = await getDoSprawdzenia();
      if (!anulowane) setOperacje(lista);
    };
    void odswiez();
    window.addEventListener("queue-changed", odswiez);
    return () => {
      anulowane = true;
      window.removeEventListener("queue-changed", odswiez);
    };
  }, []);

  if (operacje.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOtwarte(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground"
      >
        <AlertTriangle className="size-4 shrink-0" /> {operacje.length} do sprawdzenia
      </button>
      <Sheet open={otwarte} onOpenChange={setOtwarte}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Do sprawdzenia</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {operacje.map((op) => (
              <div key={op.opId} className="rounded-2xl border border-destructive/50 bg-card p-3">
                <p className="text-sm font-semibold">
                  {op.type === "insert" ? "Zgłoszenie" : `Zmiana zgłoszenia`}
                  {op.type === "update" ? ` ${op.payload.id.slice(0, 8)}` : ""}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {op.powod ?? "Zapis został odrzucony."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void odrzucOperacjeDoSprawdzenia(op.opId)}
                >
                  <X className="size-4" /> Odrzuć
                </Button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 9: Osadź komponent w nagłówku** `src/components/AppShell.tsx` — dodaj import i umieść obok `StatusPolaczenia`:

```tsx
import { DoSprawdzenia } from "./DoSprawdzenia";
```
```tsx
          <div className="flex items-center gap-2">
            <DoSprawdzenia />
            <StatusPolaczenia />
            <MenuUzytkownika />
          </div>
```

- [ ] **Step 10: Sprawdź typy, lint, build.** Run: `npm run typecheck && npm run lint && npm run build` — Expected: bez nowych błędów.

- [ ] **Step 11: Commit**

```bash
git add src/lib/offline.ts src/lib/awarie-cache.ts src/lib/queries.ts src/components/DoSprawdzenia.tsx src/components/AppShell.tsx tests/unit/offline-bledy.test.ts tests/unit/awarie-cache.test.ts
git commit -m "Make the offline queue non-blocking on business conflicts, add version-aware updates" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Serwis komentarzy i historii, przebudowa karty awarii

**Files:**
- Create: `src/lib/komentarze.ts`, `src/components/awaria/OsStatusow.tsx`, `src/components/awaria/Komentarze.tsx`, `src/components/awaria/Historia.tsx`
- Modify: `src/lib/queries.ts` (dodanie `historiaQuery`), `src/routes/awarie.$id.tsx`

**Interfaces:**
- Consumes: `dozwolonePrzejscia`, `ETYKIETY_STATUSOW`, `OS_GLOWNA`, `indeksNaOsi` (zadanie 3); `aktualizujAwarie`, `KonfliktWersjiError` (zadanie 5).
- Produces: `komentarzeQuery(awariaId)`, `dodajKomentarz(awariaId, tresc)`; `historiaQuery(awariaId)`; komponenty `<OsStatusow status przejscia />`, `<Komentarze awariaId />`, `<Historia awariaId />`.

- [ ] **Step 1: Zaimplementuj `src/lib/komentarze.ts`**

```ts
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Komentarz = Database["public"]["Tables"]["awarie_komentarze"]["Row"];

export function komentarzeQuery(awariaId: string) {
  return queryOptions({
    queryKey: ["awarie", awariaId, "komentarze"],
    queryFn: async (): Promise<Komentarz[]> => {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Brak połączenia.");
      const { data, error } = await supabase
        .from("awarie_komentarze")
        .select("*")
        .eq("awaria_id", awariaId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Komentarze wymagają połączenia (nie przechodzą przez kolejkę offline — patrz Global Constraints planu etapu 2). */
export async function dodajKomentarz(awariaId: string, tresc: string): Promise<void> {
  if (!navigator.onLine) throw new Error("Komentarze wymagają połączenia z internetem.");
  const { error } = await supabase.from("awarie_komentarze").insert({ awaria_id: awariaId, tresc });
  if (error) throw new Error("Nie udało się zapisać komentarza.");
}
```

- [ ] **Step 2: Dodaj `historiaQuery` do `src/lib/queries.ts`** (na końcu pliku)

```ts
export type WpisHistorii = Database["public"]["Tables"]["awarie_historia"]["Row"];

export function historiaQuery(awariaId: string) {
  return queryOptions({
    queryKey: ["awarie", awariaId, "historia"],
    queryFn: async (): Promise<WpisHistorii[]> => {
      wymagajSieci();
      const { data, error } = await supabase
        .from("awarie_historia")
        .select("*")
        .eq("awaria_id", awariaId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}
```

- [ ] **Step 3: Zbuduj oś statusów** `src/components/awaria/OsStatusow.tsx`

```tsx
import { CheckCircle2, Circle, PauseCircle } from "lucide-react";
import { ETYKIETY_STATUSOW, OS_GLOWNA, indeksNaOsi, type StatusAwarii } from "@/lib/statusy-awarii";

export function OsStatusow({ status }: { status: StatusAwarii }) {
  const biezacy = indeksNaOsi(status);
  return (
    <div>
      <div className="flex items-center">
        {OS_GLOWNA.map((krok, i) => (
          <div key={krok} className="flex flex-1 items-center last:flex-none">
            {i < biezacy ? (
              <CheckCircle2 className="size-6 shrink-0 text-success" />
            ) : i === biezacy ? (
              <Circle className="size-6 shrink-0 fill-primary text-primary" />
            ) : (
              <Circle className="size-6 shrink-0 text-muted-foreground" />
            )}
            {i < OS_GLOWNA.length - 1 && (
              <div className={`h-0.5 flex-1 ${i < biezacy ? "bg-success" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-4 text-center text-[11px] font-semibold text-muted-foreground">
        {OS_GLOWNA.map((krok) => (
          <span key={krok}>{ETYKIETY_STATUSOW[krok]}</span>
        ))}
      </div>
      {status === "oczekuje_na_czesc" && (
        <p className="mt-2 flex items-center justify-center gap-1 text-xs font-semibold text-warning">
          <PauseCircle className="size-4" /> Oczekuje na część
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Zbuduj listę komentarzy** `src/components/awaria/Komentarze.tsx`

```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { dodajKomentarz, komentarzeQuery } from "@/lib/komentarze";

export function Komentarze({ awariaId }: { awariaId: string }) {
  const qc = useQueryClient();
  const { data: komentarze = [], isLoading } = useQuery(komentarzeQuery(awariaId));
  const [tresc, setTresc] = useState("");
  const [zapis, setZapis] = useState(false);

  async function wyslij() {
    if (!tresc.trim()) return;
    setZapis(true);
    try {
      await dodajKomentarz(awariaId, tresc.trim());
      setTresc("");
      await qc.invalidateQueries({ queryKey: ["awarie", awariaId, "komentarze"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać komentarza.");
    } finally {
      setZapis(false);
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-bold uppercase">Komentarze</h2>
      {isLoading && <p className="text-sm text-muted-foreground">Wczytywanie...</p>}
      {!isLoading && komentarze.length === 0 && (
        <p className="text-sm text-muted-foreground">Brak komentarzy.</p>
      )}
      <div className="space-y-2">
        {komentarze.map((k) => (
          <div key={k.id} className="rounded-xl bg-muted p-3">
            <p className="text-sm">{k.tresc}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(k.created_at).toLocaleString("pl-PL")}
            </p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Textarea
          value={tresc}
          onChange={(e) => setTresc(e.target.value)}
          rows={2}
          placeholder="Dodaj komentarz..."
          className="text-base"
        />
        <Button onClick={wyslij} disabled={zapis || !tresc.trim()} className="h-12 w-full">
          {zapis ? "Zapisywanie..." : "Dodaj komentarz"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Zbuduj historię** `src/components/awaria/Historia.tsx`

```tsx
import { useQuery } from "@tanstack/react-query";
import { historiaQuery } from "@/lib/queries";
import { ETYKIETY_STATUSOW, type StatusAwarii } from "@/lib/statusy-awarii";

function opisWpisu(typ: string, dane: unknown): string {
  const d = (dane ?? {}) as Record<string, unknown>;
  if (typ === "utworzenie") return "Zgłoszenie utworzone";
  if (typ === "zmiana_statusu") {
    const z = ETYKIETY_STATUSOW[d["z"] as StatusAwarii] ?? String(d["z"]);
    const na = ETYKIETY_STATUSOW[d["na"] as StatusAwarii] ?? String(d["na"]);
    return `Status: ${z} → ${na}`;
  }
  if (typ === "przypisanie") return d["technik_id"] ? "Przypisano technika" : "Usunięto przypisanie";
  return "Edycja";
}

export function Historia({ awariaId }: { awariaId: string }) {
  const { data: wpisy = [], isLoading } = useQuery(historiaQuery(awariaId));
  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-bold uppercase">Historia</h2>
      {isLoading && <p className="text-sm text-muted-foreground">Wczytywanie...</p>}
      <div className="space-y-2">
        {wpisy.map((w) => (
          <div key={w.id} className="border-l-2 border-border pl-3">
            <p className="text-sm">{opisWpisu(w.typ, w.dane)}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(w.created_at).toLocaleString("pl-PL")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Przebuduj `src/routes/awarie.$id.tsx`**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Historia } from "@/components/awaria/Historia";
import { Komentarze } from "@/components/awaria/Komentarze";
import { OsStatusow } from "@/components/awaria/OsStatusow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { awarieQuery } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { aktualizujAwarie, KonfliktWersjiError } from "@/lib/offline";
import { dozwolonePrzejscia, ETYKIETY_STATUSOW, wymagaDanychZamkniecia, type StatusAwarii } from "@/lib/statusy-awarii";
import type { Awaria } from "@/lib/types";

export const Route = createFileRoute("/awarie/$id")({
  head: () => ({
    meta: [
      { title: "Szczegóły awarii — Ewidencja awarii urządzeń" },
      { name: "description", content: "Szczegóły zgłoszenia awarii, przejścia statusu, komentarze i historia." },
      { property: "og:title", content: "Szczegóły awarii" },
      { property: "og:description", content: "Podgląd zgłoszenia, obsługa i zamknięcie awarii urządzenia." },
    ],
  }),
  component: Szczegoly,
});

function Szczegoly() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const auth = useAuth();
  const gotowy = auth.stan === "zalogowany" && !auth.profil.must_change_password;
  const { data: awarie = [], isLoading } = useQuery({ ...awarieQuery, enabled: gotowy });

  const awaria = awarie.find((a) => a.id === id);
  const [celStatusu, setCelStatusu] = useState<StatusAwarii | null>(null);
  const [przyczyna, setPrzyczyna] = useState("");
  const [czas, setCzas] = useState("");
  const [zapis, setZapis] = useState(false);

  if (isLoading) {
    return (
      <AppShell title="Szczegóły">
        <p className="text-muted-foreground">Wczytywanie...</p>
      </AppShell>
    );
  }
  if (!awaria) {
    return (
      <AppShell title="Szczegóły">
        <p className="text-muted-foreground">Nie znaleziono zgłoszenia.</p>
      </AppShell>
    );
  }

  const rola = auth.stan === "zalogowany" ? auth.profil.rola : null;
  const przejscia = dozwolonePrzejscia(awaria.status, rola);
  const osoba = awaria.zglaszajacy_nazwa ?? "—";

  async function wykonajPrzejscie(na: StatusAwarii, dane: Partial<Awaria> = {}) {
    if (!awaria) return;
    setZapis(true);
    let wynik: Awaited<ReturnType<typeof aktualizujAwarie>>;
    try {
      wynik = await aktualizujAwarie(awaria.id, { status: na, ...dane }, awaria.wersja);
    } catch (e) {
      if (e instanceof KonfliktWersjiError) {
        toast.error(e.message);
        await qc.invalidateQueries({ queryKey: ["awarie"] });
      } else {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać zmiany.");
      }
      return;
    } finally {
      setZapis(false);
      setCelStatusu(null);
    }
    await qc.invalidateQueries();
    toast.success(
      wynik === "zsynchronizowano" ? "Zapisano i zsynchronizowano" : "Zapisano lokalnie, oczekuje na synchronizację",
    );
  }

  function klikPrzejscia(na: StatusAwarii) {
    if (wymagaDanychZamkniecia(na)) {
      setCelStatusu(na);
      return;
    }
    void wykonajPrzejscie(na);
  }

  async function potwierdzZamkniecie() {
    if (!celStatusu || !przyczyna.trim() || czas === "") {
      toast.error("Podaj przyczynę i czas przestoju.");
      return;
    }
    await wykonajPrzejscie(celStatusu, {
      przyczyna: przyczyna.trim(),
      czas_przestoju_h: Number(czas),
      data_zamkniecia: new Date().toISOString(),
    });
    setPrzyczyna("");
    setCzas("");
  }

  return (
    <AppShell title={awaria.numer ?? "oczekuje na numer"}>
      <div className="mb-5 rounded-2xl border border-border bg-card p-4">
        <OsStatusow status={awaria.status} />
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <Wiersz etykieta="Urządzenie" wartosc={`${awaria.nr_technologiczny} — ${awaria.nazwa_urzadzenia}`} />
        <Wiersz etykieta="Data awarii" wartosc={new Date(awaria.data_awarii).toLocaleString("pl-PL")} />
        <Wiersz etykieta="Zgłaszający" wartosc={osoba} />
        <Wiersz etykieta="Krytyczność skutku" wartosc={awaria.krytycznosc_skutku} />
        <Wiersz etykieta="Status" wartosc={ETYKIETY_STATUSOW[awaria.status]} />
        <Wiersz etykieta="Opis" wartosc={awaria.opis_awarii} />
        {awaria.status === "zamknieta" && (
          <>
            <Wiersz etykieta="Przyczyna" wartosc={awaria.przyczyna ?? "—"} />
            <Wiersz etykieta="Czas przestoju (h)" wartosc={String(awaria.czas_przestoju_h ?? "—")} />
            <Wiersz
              etykieta="Data zamknięcia"
              wartosc={awaria.data_zamkniecia ? new Date(awaria.data_zamkniecia).toLocaleString("pl-PL") : "—"}
            />
          </>
        )}
      </div>

      {przejscia.length > 0 && (
        <div className="mt-5 space-y-2 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-xl font-bold uppercase">Kolejny krok</h2>
          {celStatusu === null ? (
            <div className="grid gap-2">
              {przejscia.map((p) => (
                <Button
                  key={p.na}
                  onClick={() => klikPrzejscia(p.na)}
                  disabled={zapis}
                  className="h-14 w-full text-base font-bold"
                >
                  {p.etykietaAkcji}
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="przyczyna" className="text-base">
                  Przyczyna
                </Label>
                <Textarea
                  id="przyczyna"
                  rows={4}
                  value={przyczyna}
                  onChange={(e) => setPrzyczyna(e.target.value)}
                  className="text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="czas" className="text-base">
                  Czas przestoju (h)
                </Label>
                <Input
                  id="czas"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  value={czas}
                  onChange={(e) => setCzas(e.target.value)}
                  className="h-14 text-base"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setCelStatusu(null)} className="h-14">
                  Anuluj
                </Button>
                <Button onClick={potwierdzZamkniecie} disabled={zapis} className="h-14 font-bold">
                  {zapis ? "Zapisywanie..." : "Zamknij awarię"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-border bg-card p-4">
        <Komentarze awariaId={awaria.id} />
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-card p-4">
        <Historia awariaId={awaria.id} />
      </div>
    </AppShell>
  );
}

function Wiersz({ etykieta, wartosc }: { etykieta: string; wartosc: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{etykieta}</p>
      <p className="text-base">{wartosc}</p>
    </div>
  );
}
```

- [ ] **Step 7: Sprawdź typy, lint, build.** Run: `npm run typecheck && npm run lint && npm run build` — Expected: bez nowych błędów. Popraw ewentualne literówki nazw pól wynikające z regeneracji typów (np. `awarie_historia`/`awarie_komentarze` Row).

- [ ] **Step 8: Commit**

```bash
git add src/lib/komentarze.ts src/lib/queries.ts src/components/awaria src/routes/awarie.\$id.tsx
git commit -m "Rebuild the fault detail screen: status axis, transitions, comments, history" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Widok „Zadania" i nawigacja

**Files:**
- Create: `src/routes/zadania.tsx`
- Modify: `src/lib/uprawnienia.ts`, `src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `awarieQuery` (kolejka `queries.ts`), `czyRola`.
- Produces: trasa `/zadania`; `pozycjeNawigacji` zwraca dodatkową pozycję dla technik/admin.

- [ ] **Step 1: Rozszerz `src/lib/uprawnienia.ts`** — dodaj ścieżkę, ikonę i pozycję „Zadania" dla technik/admin (kierownik zostaje bez zmian, ma „Analizy" zamiast):

```ts
export type Sciezka = "/" | "/awarie" | "/zadania" | "/dashboard" | "/eksport" | "/admin/uzytkownicy";
export type IkonaNawigacji = "zglos" | "lista" | "zadania" | "analizy" | "eksport" | "admin";
```
```ts
function pozostale(rola: Rola): PozycjaNawigacji[] {
  switch (rola) {
    case "pracownik":
      return [poz("/awarie", "Moje", "lista")];
    case "technik":
      return [poz("/zadania", "Zadania", "zadania"), poz("/awarie", "Awarie", "lista")];
    case "kierownik":
      return [
        poz("/awarie", "Awarie", "lista"),
        poz("/dashboard", "Analizy", "analizy"),
        poz("/eksport", "Eksport", "eksport"),
      ];
    case "admin":
      return [
        poz("/zadania", "Zadania", "zadania"),
        poz("/awarie", "Awarie", "lista"),
        poz("/dashboard", "Analizy", "analizy"),
        poz("/eksport", "Eksport", "eksport"),
        poz("/admin/uzytkownicy", "Admin", "admin"),
      ];
  }
}
```
(`pozycjeNawigacji` wstawia „Zgłoś" na środek listy zwróconej przez `pozostale` — bez zmian; dla technika i admina środek przesuwa się automatycznie wraz z nową pozycją.)

- [ ] **Step 2: Dodaj ikonę w `src/components/AppShell.tsx`**

```tsx
import { BarChart3, ClipboardPlus, Download, ListChecks, ListTodo, Settings, type LucideIcon } from "lucide-react";
```
```tsx
const IKONY: Record<IkonaNawigacji, LucideIcon> = {
  zglos: ClipboardPlus,
  lista: ListChecks,
  zadania: ListTodo,
  analizy: BarChart3,
  eksport: Download,
  admin: Settings,
};
```

- [ ] **Step 3: Zaimplementuj `src/routes/zadania.tsx`** — trzy sekcje: do przyjęcia, przypisane do mnie, moje przeglądy w najbliższym terminie (przeglądy nie istnieją jeszcze — sekcja zostaje pusta z komentarzem do etapu 3):

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { awarieQuery } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { ETYKIETY_STATUSOW } from "@/lib/statusy-awarii";
import type { AwariaLokalna } from "@/lib/types";

export const Route = createFileRoute("/zadania")({
  head: () => ({
    meta: [
      { title: "Zadania — Ewidencja awarii urządzeń" },
      { name: "description", content: "Awarie do przyjęcia i przypisane do bieżącego technika." },
    ],
  }),
  component: Zadania,
});

function Karta({ a }: { a: AwariaLokalna }) {
  return (
    <Link
      to="/awarie/$id"
      params={{ id: a.id }}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 active:bg-accent"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-lg font-bold">{a.numer ?? "oczekuje na numer"}</span>
          <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-warning-foreground">
            {ETYKIETY_STATUSOW[a.status]}
          </span>
        </div>
        <p className="truncate text-sm text-muted-foreground">{a.nazwa_urzadzenia}</p>
        <p className="mt-1 line-clamp-2 text-sm">{a.opis_awarii}</p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function Zadania() {
  const auth = useAuth();
  const gotowy = auth.stan === "zalogowany" && !auth.profil.must_change_password;
  const { data: awarie = [], isLoading } = useQuery({ ...awarieQuery, enabled: gotowy });
  const userId = auth.stan === "zalogowany" ? auth.profil.id : null;

  const { doPrzyjecia, przypisaneDoMnie } = useMemo(
    () => ({
      doPrzyjecia: awarie.filter((a) => a.status === "zgloszona"),
      przypisaneDoMnie: awarie.filter((a) => a.przypisany_technik_id === userId && a.status !== "zamknieta"),
    }),
    [awarie, userId],
  );

  return (
    <AppShell title="Zadania" dozwoloneRole={["technik", "kierownik", "admin"]}>
      {isLoading && <p className="text-muted-foreground">Wczytywanie...</p>}

      <section className="mb-6">
        <h2 className="mb-3 font-display text-xl font-bold uppercase">Do przyjęcia</h2>
        <div className="space-y-3">
          {doPrzyjecia.map((a) => (
            <Karta key={a.id} a={a} />
          ))}
          {!isLoading && doPrzyjecia.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
              Brak zgłoszeń oczekujących na przyjęcie.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-bold uppercase">Przypisane do mnie</h2>
        <div className="space-y-3">
          {przypisaneDoMnie.map((a) => (
            <Karta key={a.id} a={a} />
          ))}
          {!isLoading && przypisaneDoMnie.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
              Brak awarii przypisanych do Ciebie.
            </p>
          )}
        </div>
      </section>
    </AppShell>
  );
}
```
(„Przeglądy w najbliższym terminie" z sekcji 10 specu dochodzi w etapie 3 razem z tabelą `przeglady`.)

- [ ] **Step 4: Sprawdź typy, lint, build.** Run: `npm run typecheck && npm run lint && npm run build` — Expected: bez nowych błędów. `npx tsc --noEmit` po dodaniu nowej trasy powinien też odświeżyć `src/routeTree.gen.ts` — jeśli dev-serwer nie zrobił tego automatycznie, uruchom `npm run dev` na chwilę i zamknij, żeby wygenerował wpis dla `/zadania`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/uprawnienia.ts src/components/AppShell.tsx src/routes/zadania.tsx src/routeTree.gen.ts
git commit -m "Add role-based Zadania screen and navigation entry" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Testy E2E, zimny start offline, bramka jakości, dokumentacja

**Files:**
- Create: `tests/e2e/obsluga-awarii.spec.ts`
- Modify: `tests/e2e/konta-i-zgloszenie.spec.ts`, `CLAUDE.md`, `README.md`, `roadmap.md`

**Interfaces:**
- Consumes: cały kod etapu 2.

- [ ] **Step 1: Napisz `tests/e2e/obsluga-awarii.spec.ts`** — ścieżka technika (przyjęcie → naprawa → zamknięcie z komentarzem i historią) i ponowne otwarcie przez kierownika:

```ts
import { expect, test, type Page } from "@playwright/test";
import { HASLO_TESTOWE, KONTA, klientAdmin, przygotujKonta, url } from "../wspolne/srodowisko";

const ZNACZNIK = `E2E2-${Date.now()}`;
const HOST_TESTOWY = new URL(url()).host;
let zablokowane: string[] = [];

test.beforeEach(async ({ page }) => {
  zablokowane = [];
  await page.route(
    (adres) => adres.hostname.endsWith(".supabase.co"),
    async (route) => {
      const host = new URL(route.request().url()).host;
      if (host === HOST_TESTOWY) await route.continue();
      else {
        zablokowane.push(host);
        await route.abort();
      }
    },
  );
});
test.afterEach(() => expect(zablokowane, "żądania do obcego projektu Supabase").toEqual([]));

async function otworz(page: Page, sciezka: string) {
  await page.goto(sciezka);
  await page.waitForFunction(
    () => {
      const maKlucz = (o: object | null, p: string) =>
        o !== null && Object.getOwnPropertyNames(o).some((k) => k.startsWith(p));
      return maKlucz(document, "__reactContainer$") && maKlucz(document.querySelector("form, button"), "__reactProps$");
    },
    undefined,
    { timeout: 15_000 },
  );
}

async function zaloguj(page: Page, email: string) {
  await otworz(page, "/logowanie");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło").fill(HASLO_TESTOWE);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

test.beforeAll(async () => {
  await przygotujKonta();
  const { error } = await klientAdmin().from("urzadzenia").upsert(
    { nr_technologiczny: "HVAC-01", nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI", status_w_rejestrze: "Aktywne" },
    { onConflict: "nr_technologiczny" },
  );
  if (error) throw error;
  await klientAdmin().from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
});
test.afterAll(() => klientAdmin().from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`));

test("technik przyjmuje, naprawia, zamyka z komentarzem; historia i numer widoczne", async ({ page }) => {
  const opis = `${ZNACZNIK} pompa głośna`;
  await zaloguj(page, KONTA.pracownik.email);
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: /HVAC-01/ }).click();
  await page.getByLabel("Opis awarii").fill(opis);
  await page.getByRole("button", { name: "Zgłoś awarię" }).click();
  await expect(page.getByText(opis)).toBeVisible();
  await page.getByRole("button", { name: "Menu konta" }).click();
  await page.getByRole("menuitem", { name: "Wyloguj" }).click();

  await zaloguj(page, KONTA.technik.email);
  await otworz(page, "/awarie");
  await page.getByText(opis).click();
  await expect(page.getByText("oczekuje na numer")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /AWR-\d{4}-\d{3}/ })).toBeVisible();

  // Oś statusów pokazuje wszystkie cztery etykiety cały czas — sprawdzamy więc rzeczywisty skutek
  // przejścia po tym, jaki przycisk kolejnego kroku się pojawia, a nie po samej etykiecie na osi.
  await page.getByRole("button", { name: "Przyjmij zgłoszenie" }).click();
  await expect(page.getByRole("button", { name: "Rozpocznij naprawę" })).toBeVisible();
  await page.getByRole("button", { name: "Rozpocznij naprawę" }).click();
  await expect(page.getByRole("button", { name: "Wstrzymaj — czeka na część" })).toBeVisible();

  await page.getByPlaceholder("Dodaj komentarz...").fill("Wymieniono uszczelkę.");
  await page.getByRole("button", { name: "Dodaj komentarz" }).click();
  await expect(page.getByText("Wymieniono uszczelkę.")).toBeVisible();

  await page.getByRole("button", { name: "Zamknij awarię" }).click();
  await page.getByLabel("Przyczyna").fill("Uszkodzona uszczelka");
  await page.getByLabel("Czas przestoju (h)").fill("1.5");
  await page.getByRole("button", { name: "Zamknij awarię" }).click();
  // Z "zamknieta" technik nie ma żadnego dalszego przejścia: sekcja znika całkowicie.
  await expect(page.getByRole("heading", { name: "Kolejny krok" })).toHaveCount(0);
  await expect(page.getByText("Status: Zgłoszona → Przyjęta")).toBeVisible();
});

test("technik nie może ponownie otworzyć zamkniętej awarii, kierownik może", async ({ page }) => {
  const opis = `${ZNACZNIK} zamknięta do reopenu`;
  const admin = klientAdmin();
  const { data: zgloszajacy } = await admin.from("profiles").select("id").eq("email", KONTA.pracownik.email).single();
  const { data: awaria } = await admin
    .from("awarie")
    .insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      opis_awarii: opis,
      krytycznosc_skutku: "Niska",
      status: "zamknieta",
      przyczyna: "Test",
      czas_przestoju_h: 1,
      data_zamkniecia: new Date().toISOString(),
      zglaszajacy_id: zgloszajacy?.id,
      zglaszajacy_nazwa: "Test pracownik",
    })
    .select("id")
    .single();
  expect(awaria).not.toBeNull();

  await zaloguj(page, KONTA.technik.email);
  await otworz(page, `/awarie/${awaria?.id}`);
  await expect(page.getByRole("button", { name: "Otwórz ponownie" })).toHaveCount(0);

  await page.getByRole("button", { name: "Menu konta" }).click();
  await page.getByRole("menuitem", { name: "Wyloguj" }).click();
  await zaloguj(page, KONTA.kierownik.email);
  await otworz(page, `/awarie/${awaria?.id}`);
  await page.getByRole("button", { name: "Otwórz ponownie" }).click();
  // Po ponownym otwarciu kierownik (jak technik) ma znów dostęp do zwykłych przejść z "w_naprawie".
  await expect(page.getByRole("button", { name: "Wstrzymaj — czeka na część" })).toBeVisible();
});
```

- [ ] **Step 2: Uruchom nowy zestaw e2e osobno.** Run: `npm run test:e2e -- obsluga-awarii` — Expected: PASS (2 testy).

- [ ] **Step 3: Dodaj brakujący test zimnego startu offline** do `tests/e2e/konta-i-zgloszenie.spec.ts` (na końcu pliku) — domyka lukę z etapu 1 (plan nadrzędny, sekcja 4): przeładowanie strony online z wygasłym tokenem, gdy `**/auth/v1/token**` jest chwilowo zablokowane, nie wyrzuca na `/logowanie`.

```ts
test("zimny start: token wygasł, odświeżenie chwilowo zablokowane — użytkownik zostaje w aplikacji", async ({
  page,
  context,
}) => {
  await otworz(page, "/logowanie");
  await page.getByLabel("E-mail").fill(KONTA.pracownik.email);
  await page.getByLabel("Hasło").fill(HASLO_TESTOWE);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page.getByRole("button", { name: "Zgłoś awarię" })).toBeVisible();

  await page.evaluate(() => {
    const klucz = Object.keys(window.localStorage).find(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
    );
    if (!klucz) throw new Error("Brak wpisu sesji Supabase w localStorage");
    const sesja = JSON.parse(window.localStorage.getItem(klucz) ?? "null");
    sesja.expires_at = Math.floor(Date.now() / 1000) - 3600;
    window.localStorage.setItem(klucz, JSON.stringify(sesja));
  });

  // Odświeżenie tokenu zablokowane: symuluje okno ok. 60 s po nieudanej próbie (cooldown auth-js).
  let odblokuj: (() => void) | null = null;
  const blokada = new Promise<void>((resolve) => (odblokuj = resolve));
  await context.route("**/auth/v1/token**", async (route) => {
    await blokada;
    await route.continue();
  });

  await page.reload();
  // Zimny start z zablokowanym odświeżeniem: profil z pamięci lokalnej trzyma ekran, bez przekierowania.
  await expect(page.getByRole("button", { name: "Zgłoś awarię" })).toBeVisible({ timeout: 5_000 });
  expect(page.url()).not.toContain("/logowanie");

  odblokuj?.();
  await context.unroute("**/auth/v1/token**");
  await expect(page.getByRole("button", { name: "Zgłoś awarię" })).toBeVisible();
  expect(page.url()).not.toContain("/logowanie");
});
```

- [ ] **Step 4: Uruchom cały zestaw e2e.** Run: `npm run test:e2e` — Expected: PASS (wszystkie pliki). Pamiętaj o przerwie 6+ minut od ostatniego `test:rls` (limit logowań Supabase Auth).

- [ ] **Step 5: Bramka jakości pełna.** Run kolejno, porównując z `docs/superpowers/plans/stan-wyjsciowy-etap-1.md`:

```bash
npm run lint
npm run typecheck
npm test
npm run test:rls
npm run test:e2e
npm run build
npm audit --omit=dev
```
Expected: lint/typecheck bez nowych błędów, wszystkie testy PASS, build przechodzi, audit bez nowych podatności wysokich/krytycznych.

- [ ] **Step 6: Przegląd kodu i bezpieczeństwa.** Uruchom `/code-review` i `/security-review` na zmianach etapu (diff względem `main`/`master`). Napraw znaleziska albo odrzuć je świadomie z uzasadnieniem w commicie zamykającym.

- [ ] **Step 7: Ręczna ścieżka na telefonie** (widok min. 390 px, `claude-in-chrome` albo devtools). Przejdź: zgłoszenie → lista → szczegóły → przyjęcie → naprawa → komentarz → zamknięcie z przyczyną → historia widoczna → (kierownik) ponowne otwarcie → widok „Zadania" dla technika i admina. Sprawdź elementy dotykowe ≥44 px i brak przewijania poziomego. Zrzuty ekranu zapisz poza repozytorium.

- [ ] **Step 8: Zaktualizuj dokumentację.** W `CLAUDE.md`: opisz maszynę stanów, numerację, wersjonowanie, `awarie_historia`/`awarie_komentarze`, kolejkę nieblokującą i widok „Zadania" (sekcja Architektura); w sekcji Roadmap discipline zaznacz etap 2 jako zrobiony. W `roadmap.md` i `README.md` dopisz stan po etapie 2 (nowe ekrany, statusy). W specyfikacji (`docs/superpowers/specs/2026-09-21-rozbudowa-obsluga-awarii-design.md`) w sekcji 6 dopisz jedno zdanie: „Zamknięcie każdą drogą wymaga przyczyny i czasu przestoju (nie tylko dedykowany komentarz); wymóg komentarza przy odrzuceniu nie jest wymuszany przez bazę." — dokumentuje świadome uproszczenie z zadania 1.

- [ ] **Step 9: Commit zamykający i tag**

```bash
git add CLAUDE.md README.md roadmap.md docs/superpowers/specs/2026-09-21-rozbudowa-obsluga-awarii-design.md tests/e2e
git commit -m "Close stage 2: fault handling, status machine, tasks view, docs" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git tag etap-2-gotowy
```

Poinformuj użytkownika, że gałąź jest gotowa do scalenia z main i że push (gałęzi i tagu) wymaga osobnej zgody.
