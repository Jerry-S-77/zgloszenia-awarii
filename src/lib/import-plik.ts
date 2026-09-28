/**
 * Wspólne narzędzia importu z plików (CSV albo XLSX sprowadzone do tablicy wierszy). Kolumny rozpoznawane po
 * nagłówku (kolejność dowolna, wielkość liter i spacje bez znaczenia), numery wierszy w błędach jak w Excelu.
 * Każdy import waliduje tu dla czytelnego podglądu, a baza sprawdza wszystko jeszcze raz.
 */

export type Komorka = string | number | boolean | Date | null | undefined;
export type WynikImportu<T> = { wiersze: T[]; bledy: string[] };

export const LIMIT_WIERSZY = 2000;

/** Błąd pliku z komunikatem dla użytkownika (pokazywany w podglądzie importu). */
export class BladPliku extends Error {}

/** Prosty parser CSV: separator `;` albo `,` (wykrywany z nagłówka), pola w cudzysłowach, BOM. */
export function parsujCsv(tekst: string): string[][] {
  const czysty = tekst.replace(/^\uFEFF/, "");
  const pierwsza = czysty.split(/\r?\n/, 1)[0] ?? "";
  const separator =
    (pierwsza.match(/;/g)?.length ?? 0) >= (pierwsza.match(/,/g)?.length ?? 0) ? ";" : ",";
  const wiersze: string[][] = [];
  let pole = "";
  let wiersz: string[] = [];
  let wCudzyslowie = false;
  for (let i = 0; i < czysty.length; i++) {
    const z = czysty[i];
    if (wCudzyslowie) {
      if (z === '"' && czysty[i + 1] === '"') {
        pole += '"';
        i++;
      } else if (z === '"') {
        wCudzyslowie = false;
      } else {
        pole += z;
      }
    } else if (z === '"' && pole === "") {
      // Cudzysłów otwiera pole tylko na jego początku (jak w Excelu); w środku, np. 10" (cale), to zwykły znak.
      wCudzyslowie = true;
    } else if (z === separator) {
      wiersz.push(pole);
      pole = "";
    } else if (z === "\n" || z === "\r") {
      if (z === "\r" && czysty[i + 1] === "\n") i++;
      wiersz.push(pole);
      wiersze.push(wiersz);
      wiersz = [];
      pole = "";
    } else {
      pole += z;
    }
  }
  if (wCudzyslowie) {
    // Bez tego reszta pliku po brakującym cudzysłowie trafiłaby po cichu do jednego pola.
    throw new BladPliku("Plik CSV ma niedomknięty cudzysłów — sprawdź pola z cudzysłowem.");
  }
  if (pole !== "" || wiersz.length > 0) {
    wiersz.push(pole);
    wiersze.push(wiersz);
  }
  return wiersze.filter((w) => w.some((p) => p.trim() !== ""));
}

/** Tabela z nagłówkiem: dostęp do pól po nazwie kolumny. */
export type Tabela = {
  dane: Komorka[][];
  ma: (kolumna: string) => boolean;
  komorka: (w: Komorka[], kolumna: string) => Komorka;
  tekst: (w: Komorka[], kolumna: string) => string;
};

function kluczNaglowka(n: Komorka): string {
  return String(n ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/** Nagłówek → tabela; brak wymaganych kolumn albo pusty plik → lista błędów. Wiersz danych `i` ma numer `i + 2`. */
export function tabela(
  wiersze: Komorka[][],
  wymagane: readonly string[],
): { tabela: Tabela; bledy: string[] } {
  const [naglowek, ...dane] = wiersze;
  const indeks = new Map((naglowek ?? []).map((n, i) => [kluczNaglowka(n), i]));
  const bledy = naglowek
    ? wymagane.filter((k) => !indeks.has(k)).map((k) => `Brak kolumny „${k}” w nagłówku.`)
    : ["Plik jest pusty."];
  const komorka = (w: Komorka[], k: string) => {
    const i = indeks.get(k);
    return i === undefined ? undefined : w[i];
  };
  return {
    bledy,
    tabela: {
      dane,
      ma: (k) => indeks.has(k),
      komorka,
      tekst: (w, k) => {
        const v = komorka(w, k);
        if (v === null || v === undefined) return "";
        if (v instanceof Date) return dataIso(v) ?? "";
        return String(v).trim();
      },
    },
  };
}

export function pustyWiersz(w: Komorka[]): boolean {
  return w.every((p) => p === null || p === undefined || String(p).trim() === "");
}

/** Liczba z pola (przecinek dziesiętny, spacje tysięcy); puste → undefined, błędna lub ujemna → null. */
export function liczba(tekst: string): number | undefined | null {
  const t = tekst.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Najwyżej 2 miejsca po przecinku — tyle przechowuje baza (numeric(12,2)); więcej zaokrągliłoby się po cichu. */
export function dwaMiejsca(n: number): boolean {
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
}

/** Wartość do wysłania: po sprawdzeniu `dwaMiejsca` usuwa ślad błędu zmiennoprzecinkowego (0,30000000000000004 → 0,3). */
export function do2Miejsc(n: number): number {
  return Math.round(n * 100) / 100;
}

export function tak(tekst: string): boolean {
  return ["tak", "t", "1", "true", "x", "yes"].includes(tekst.trim().toLowerCase());
}

function dataIso(d: Date): string | null {
  // read-excel-file zwraca daty jako północ UTC; bierzemy składowe UTC, żeby strefa nie przesunęła dnia.
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const EPOKA_EXCELA = Date.UTC(1899, 11, 30);

/** Data z komórki: Date z XLSX, numer seryjny Excela, RRRR-MM-DD albo DD.MM.RRRR; puste → undefined, zła → null. */
export function data(v: Komorka): string | undefined | null {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return undefined;
  if (v instanceof Date) return dataIso(v);
  if (typeof v === "number") {
    return v > 0 && v < 100000
      ? dataIso(new Date(EPOKA_EXCELA + Math.round(v) * 86_400_000))
      : null;
  }
  const t = String(v).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const pl = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  const [r, m, d] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : pl
      ? [Number(pl[3]), Number(pl[2]), Number(pl[1])]
      : [0, 0, 0];
  if (!r) return null;
  const wynik = new Date(Date.UTC(r, m - 1, d));
  // 31.02 itp.: Date przesuwa miesiąc — taka data jest błędna.
  return wynik.getUTCMonth() === m - 1 && wynik.getUTCDate() === d ? dataIso(wynik) : null;
}

export function sprawdzLimit<T>(wynik: WynikImportu<T>): WynikImportu<T> {
  if (wynik.wiersze.length > LIMIT_WIERSZY) {
    wynik.bledy.push(`Najwyżej ${LIMIT_WIERSZY} wierszy w jednym imporcie.`);
  }
  return wynik;
}

/** Komunikat z bazy, gdy jest po polsku i konkretny (np. „Wiersz 3: nie ma urządzenia X”); inaczej ogólny. */
export function komunikatImportu(error: { message?: string } | null, ogolny: string): Error {
  const m = error?.message ?? "";
  return new Error(/[ąćęłńóśźż]|Wiersz|wymaga/i.test(m) ? m : ogolny);
}

/** Klucz porównania tekstu jak `klucz_tekstu()` w bazie: bez wielkości liter, polskich znaków i nadmiaru spacji. */
export function kluczTekstu(tekst: string | null | undefined): string {
  return (tekst ?? "")
    .trim()
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
