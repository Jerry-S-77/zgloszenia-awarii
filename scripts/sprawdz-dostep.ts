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
  "awarie_zdjecia",
  "awarie_czesci",
  "magazyn_czesci",
  "magazyn_ruchy",
  "push_subskrypcje",
  "urzadzenia_czesci",
  "numeracja_awarii",
  "powiadomienia",
  "profiles",
  "przeglady",
  "przeglady_propozycje",
  "przeglady_wykonania",
  "urzadzenia",
];

const ZERO = "00000000-0000-0000-0000-000000000000";

// Filtr na kolumnie klucza (właściwego typu), który nie trafia w żaden wiersz: modyfikacja i usuwanie nie
// mogą niczego zmienić nawet wtedy, gdyby uprawnienia były błędnie otwarte.
const FILTR_PUSTY: Record<string, string> = {
  numeracja_awarii: "rok=eq.-1",
  urzadzenia: "nr_technologiczny=eq.AUDYT-NIE-ISTNIEJE",
  urzadzenia_czesci: `czesc_id=eq.${ZERO}`,
  awarie_zespol: `awaria_id=eq.${ZERO}`,
};
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
  lista_kontrolna_poprawna: { p_lista: ["audyt"] },
  magazyn_przyjecie: { p_czesc: ZERO, p_ilosc: 1 },
  magazyn_korekta: { p_czesc: ZERO, p_nowy_stan: 1, p_uwagi: "audyt" },
  magazyn_pobierz_do_awarii: { p_czesc: ZERO, p_awaria: ZERO, p_ilosc: 1 },
  magazyn_import: { p_wiersze: [] },
  push_usun_subskrypcje: { p_endpoint: "https://audyt.invalid/x", p_token: ZERO },
  awaria_otwarta_z_blokada: { p_awaria_id: ZERO },
  liczba_pl: { p: 1 },
  push_zapisz_subskrypcje: { p_endpoint: "https://audyt.invalid/x", p_p256dh: "x", p_auth: "x" },
  zdjecie_awaria_id: { p_nazwa: `${ZERO}/${ZERO}.jpg` },
  zdjecia_inne_pliki: { p_nazwa: `${ZERO}/${ZERO}.jpg` },
  urzadzenia_import: { p_wiersze: [] },
  przeglady_import: { p_wiersze: [] },
  magazyn_inwentaryzacja: { p_wiersze: [] },
  magazyn_dostawa: { p_wiersze: [] },
  magazyn_id_czesci: { p_numer: "audyt", p_wiersz: 1 },
  klucz_tekstu: { p: "audyt" },
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
  // Zapis: pusty wiersz musi zostać odrzucony na poziomie uprawnień (42501), zanim baza sprawdzi dane.
  const zapis = await fetch(`${url}/rest/v1/${tabela}`, {
    method: "POST",
    headers: { ...naglowki, prefer: "return=minimal" },
    body: "{}",
  });
  const trescZapisu = await zapis.text();
  const odmowaZapisu = !zapis.ok && trescZapisu.includes("42501");
  wynik(
    odmowaZapisu,
    `tabela ${tabela} (zapis): ${odmowaZapisu ? "odmowa" : `${zapis.status} ${trescZapisu.slice(0, 80)}`}`,
  );
  const filtr = FILTR_PUSTY[tabela] ?? `id=eq.${ZERO}`;
  for (const [metoda, opis] of [
    ["PATCH", "zmiana"],
    ["DELETE", "usuwanie"],
  ] as const) {
    const odpZmiany = await fetch(`${url}/rest/v1/${tabela}?${filtr}`, {
      method: metoda,
      headers: { ...naglowki, prefer: "return=minimal" },
      ...(metoda === "PATCH" ? { body: "{}" } : {}),
    });
    const trescZmiany = await odpZmiany.text();
    const odmowaZmiany = !odpZmiany.ok && trescZmiany.includes("42501");
    wynik(
      odmowaZmiany,
      `tabela ${tabela} (${opis}): ${odmowaZmiany ? "odmowa" : `${odpZmiany.status} ${trescZmiany.slice(0, 80)}`}`,
    );
  }
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

const plikiZdjec = await fetch(`${url}/storage/v1/object/list/zdjecia-awarii`, {
  method: "POST",
  headers: { ...naglowki, authorization: `Bearer ${klucz}` },
  body: JSON.stringify({ prefix: "", limit: 10 }),
});
const listaZdjec = plikiZdjec.ok ? ((await plikiZdjec.json()) as unknown[]) : [];
wynik(
  listaZdjec.length === 0,
  `Storage: ${listaZdjec.length} plików zdjęć widocznych bez logowania`,
);

// Wysłanie pliku do kubełka zdjęć bez logowania musi zostać odrzucone.
const wysylka = await fetch(`${url}/storage/v1/object/zdjecia-awarii/${ZERO}/${ZERO}.jpg`, {
  method: "POST",
  headers: { apikey: klucz, authorization: `Bearer ${klucz}`, "content-type": "image/jpeg" },
  body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
});
wynik(
  !wysylka.ok,
  `Storage: wysłanie zdjęcia bez logowania ${wysylka.ok ? "PRZYJĘTE" : "odrzucone"}`,
);

console.log(
  bledy.length
    ? `\n${bledy.length} problem(ów) z dostępem.`
    : "\nWszystko zamknięte dla niezalogowanych.",
);
process.exit(bledy.length ? 1 : 0);
