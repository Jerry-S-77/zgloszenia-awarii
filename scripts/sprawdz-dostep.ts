// Audyt dostępu dla użytkownika niezalogowanego (klucz publiczny, tylko odczyt).
// Sprawdza, że żadna tabela i żadna funkcja RPC nie jest dostępna bez logowania, że nie da się
// założyć konta samodzielnie i że Storage nie ujawnia kubełków.
//   node scripts/sprawdz-dostep.ts          → baza TESTOWA (.env.test)
//   node scripts/sprawdz-dostep.ts --prod   → PRODUKCJA (.env)
// Wywołania RPC idą z poprawnymi nazwami argumentów, więc odmowę (42501) zwraca sama baza, zanim
// funkcja się wykona; przy braku odmowy skrypt zgłasza błąd.

export {};

const produkcja = process.argv.includes("--prod");
try {
  process.loadEnvFile(produkcja ? ".env" : ".env.test");
} catch {
  console.error(`Brak pliku ${produkcja ? ".env" : ".env.test"}.`);
  process.exit(1);
}

const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
const klucz =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
if (!url || !klucz) {
  console.error("Brakuje SUPABASE_URL lub SUPABASE_PUBLISHABLE_KEY.");
  process.exit(1);
}

const TABELE = [
  "awarie",
  "awarie_historia",
  "awarie_komentarze",
  "awarie_zespol",
  "numeracja_awarii",
  "powiadomienia",
  "profiles",
  "przeglady",
  "przeglady_propozycje",
  "przeglady_wykonania",
  "urzadzenia",
];

const ZERO = "00000000-0000-0000-0000-000000000000";
const FUNKCJE: Record<string, Record<string, unknown>> = {
  awaria_otwarta: { p_awaria_id: ZERO },
  mam_role: { dozwolone: ["admin"] },
  moja_rola: {},
  odbiorcy_przegladu: { p_przeglad: ZERO },
  odbiorcy_rol: { p_role: ["admin"] },
  osoba_obslugi: { p_id: ZERO },
  osoby_obslugi: {},
  powiadom: { p_uzytkownik: ZERO, p_typ: "nowa_awaria", p_tresc: "audyt", p_link: "/" },
  powiadomienia_przegladow: {},
  przeglady_decyzja: { p_propozycja_id: ZERO, p_zatwierdz: false },
  przeglady_sprawdz_progi: { p_nr: "audyt" },
  statystyki_progow_urzadzen: {},
  urzadzenia_przekraczajace_progi: {},
  widzi_awarie: { p_awaria_id: ZERO },
};
// Zwraca tylko dzisiejszą datę (Europe/Warsaw), nie czyta żadnych danych.
const DOZWOLONE_DLA_ANON = new Set(["dzis_pl"]);

const naglowki = { apikey: klucz, "content-type": "application/json" };
const bledy: string[] = [];
const wynik = (ok: boolean, opis: string) => {
  console.log(`${ok ? "OK  " : "BŁĄD"} ${opis}`);
  if (!ok) bledy.push(opis);
};

console.log(`Baza: ${new URL(url).host}${produkcja ? " (PRODUKCJA)" : " (test)"}\n`);

const ustawienia = (await (
  await fetch(`${url}/auth/v1/settings`, { headers: naglowki })
).json()) as {
  disable_signup?: boolean;
  external?: { anonymous_users?: boolean };
};
wynik(ustawienia.disable_signup === true, "rejestracja nowych kont wyłączona");
wynik(ustawienia.external?.anonymous_users !== true, "logowanie anonimowe wyłączone");

for (const tabela of TABELE) {
  const odp = await fetch(`${url}/rest/v1/${tabela}?select=*&limit=1`, { headers: naglowki });
  const tresc = await odp.text();
  const odmowa = !odp.ok && tresc.includes("42501");
  const pusto = odp.ok && tresc.trim() === "[]";
  wynik(
    odmowa || pusto,
    `tabela ${tabela}: ${odmowa ? "odmowa" : pusto ? "brak wierszy" : `${odp.status} ${tresc.slice(0, 80)}`}`,
  );
}

for (const [funkcja, argumenty] of Object.entries(FUNKCJE)) {
  if (DOZWOLONE_DLA_ANON.has(funkcja)) continue;
  const odp = await fetch(`${url}/rest/v1/rpc/${funkcja}`, {
    method: "POST",
    headers: naglowki,
    body: JSON.stringify(argumenty),
  });
  const tresc = await odp.text();
  const odmowa = !odp.ok && tresc.includes("42501");
  wynik(odmowa, `funkcja ${funkcja}: ${odmowa ? "odmowa" : `${odp.status} ${tresc.slice(0, 80)}`}`);
}

const kubelki = await fetch(`${url}/storage/v1/bucket`, {
  headers: { ...naglowki, authorization: `Bearer ${klucz}` },
});
const listaKubelkow = kubelki.ok ? ((await kubelki.json()) as unknown[]) : [];
wynik(listaKubelkow.length === 0, `Storage: ${listaKubelkow.length} widocznych kubełków`);

console.log(
  bledy.length
    ? `\n${bledy.length} problem(ów) z dostępem.`
    : "\nWszystko zamknięte dla niezalogowanych.",
);
process.exit(bledy.length ? 1 : 0);
