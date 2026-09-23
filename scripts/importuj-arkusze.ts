// Jednorazowy import trzech arkuszy xlsx (dawny rejestr n8n) do bazy.
// Użycie: node scripts/importuj-arkusze.ts [--test] [--katalog <ścieżka>] [--tak]
//   domyślnie próba (nic nie zapisuje, tylko raport); --tak zapisuje; --test bierze .env.test (projekt testowy).
import { createClient } from "@supabase/supabase-js";
import { readSheet } from "read-excel-file/node";
import { join } from "node:path";
import type { Database } from "../src/integrations/supabase/types.ts";
import {
  mapujAwarie,
  mapujPrzeglad,
  mapujUrzadzenie,
  wierszeNaObiekty,
  type Komorka,
} from "./import/mapowanie.ts";
import { wymagajNieprodukcyjnego } from "../tests/wspolne/ochrona-produkcji.ts";

const argumenty = process.argv.slice(2);
const zapis = argumenty.includes("--tak");
const testowy = argumenty.includes("--test");
const indeksKatalogu = argumenty.indexOf("--katalog");
const katalog = indeksKatalogu >= 0 ? argumenty[indeksKatalogu + 1] : "@Dodatkowe dokumenty";
if (!katalog) {
  console.error("Po --katalog podaj ścieżkę.");
  process.exit(1);
}

const plikEnv = testowy ? ".env.test" : ".env";
try {
  process.loadEnvFile(plikEnv);
} catch {
  console.error(`Brak pliku ${plikEnv} z SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY.`);
  process.exit(1);
}
const url = process.env["SUPABASE_URL"];
const klucz = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !klucz) {
  console.error(`W ${plikEnv} brakuje SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY.`);
  process.exit(1);
}
if (testowy) wymagajNieprodukcyjnego(url);

console.log(`Docelowa baza: ${new URL(url).host}${testowy ? " (projekt testowy)" : ""}`);
console.log(zapis ? "Tryb: ZAPIS" : "Tryb: próba (bez zapisu; dodaj --tak, aby zapisać)");

const db = createClient<Database>(url, klucz, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function arkusz(nazwa: string) {
  const wiersze = (await readSheet(join(katalog as string, nazwa))) as Komorka[][];
  return wierszeNaObiekty(wiersze);
}

function sprawdz<T>(wynik: { data: T; error: { message: string } | null }): T {
  if (wynik.error) throw new Error(wynik.error.message);
  return wynik.data;
}

const raport: string[] = [];
const niedopasowani = new Set<string>();

const konta = sprawdz(await db.from("profiles").select("id, imie_nazwisko")) ?? [];

// 1. Urządzenia (upsert po numerze technologicznym).
const urzadzenia = (await arkusz("Urzadzenia_HPAPI_master.xlsx")).map((w) =>
  mapujUrzadzenie(w, konta),
);
const istniejace = new Set(
  (sprawdz(await db.from("urzadzenia").select("nr_technologiczny")) ?? []).map(
    (u) => u.nr_technologiczny,
  ),
);
for (const u of urzadzenia) {
  if (u.wlasciciel_nazwa && !u.wlasciciel_id) niedopasowani.add(u.wlasciciel_nazwa);
  raport.push(
    `urządzenie ${u.nr_technologiczny}: ${istniejace.has(u.nr_technologiczny) ? "aktualizacja" : "nowe"} (${u.status})`,
  );
  if (zapis) sprawdz(await db.from("urzadzenia").upsert(u, { onConflict: "nr_technologiczny" }));
}

// 2. Przeglądy: wypełnia pusty przegląd urządzenia (utworzony przy aktywacji) albo ten o tym samym typie.
const przeglady = (await arkusz("Harmonogram roczny.xlsx")).map(mapujPrzeglad);
for (const p of przeglady) {
  const obecne =
    sprawdz(
      await db
        .from("przeglady")
        .select("id, typ_czynnosci")
        .eq("nr_technologiczny", p.nr_technologiczny),
    ) ?? [];
  const cel =
    obecne.find((o) => o.typ_czynnosci !== null && o.typ_czynnosci === p.typ_czynnosci) ??
    obecne.find((o) => o.typ_czynnosci === null);
  raport.push(
    `przegląd ${p.nr_technologiczny}: ${cel ? "uzupełnienie istniejącego" : "nowy"} (termin ${p.data_najblizszego ?? "brak"})`,
  );
  if (!zapis) continue;
  if (cel) {
    const { nr_technologiczny: _nr, ...zmiany } = p;
    sprawdz(await db.from("przeglady").update(zmiany).eq("id", cel.id));
  } else {
    sprawdz(await db.from("przeglady").insert(p));
  }
}

// 3. Awarie z zachowaniem numerów; istniejący numer jest pomijany.
const awarie = (await arkusz("Awarie.xlsx")).map((w) => mapujAwarie(w, konta));
const zajete = new Set(
  (
    sprawdz(
      await db
        .from("awarie")
        .select("numer")
        .in(
          "numer",
          awarie.map((a) => a.numer),
        ),
    ) ?? []
  ).map((a) => a.numer),
);
for (const a of awarie) {
  if (a.zglaszajacy_nazwa && !a.zglaszajacy_id) niedopasowani.add(a.zglaszajacy_nazwa);
  if (zajete.has(a.numer)) {
    raport.push(`awaria ${a.numer}: POMINIĘTA — numer już istnieje w bazie`);
    continue;
  }
  raport.push(`awaria ${a.numer}: nowa (${a.status})`);
  if (zapis) sprawdz(await db.from("awarie").insert(a));
}

console.log("\nRaport:");
for (const linia of raport) console.log(`  - ${linia}`);
console.log(
  `\nUrządzenia: ${urzadzenia.length}, przeglądy: ${przeglady.length}, awarie: ${awarie.length}`,
);
if (niedopasowani.size > 0) {
  console.log(
    `Nazwiska bez pasującego konta (zostają jako tekst, bez powiązania): ${[...niedopasowani].join(", ")}`,
  );
}
console.log(zapis ? "\nZapisano." : "\nPróba zakończona, nic nie zapisano.");
