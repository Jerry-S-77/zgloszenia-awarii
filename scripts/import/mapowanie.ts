// Czyste mapowanie wierszy z arkuszy xlsx (dawny rejestr n8n) na rekordy bazy. Bez I/O — testowane jednostkowo.
import { normalizujKrytycznosc } from "../../src/lib/urzadzenia.ts";

export type Komorka = string | number | boolean | Date | null | undefined;
export type Wiersz = Record<string, Komorka>;
export type Konto = { id: string; imie_nazwisko: string };

const DZIEN_MS = 86_400_000;
const EPOKA_EXCELA = Date.UTC(1899, 11, 30);

/** Data z arkusza (liczba seryjna Excela, Date albo tekst `YYYY-MM-DD`) → `YYYY-MM-DD` lub null. */
export function dataZExcela(v: Komorka): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number")
    return new Date(EPOKA_EXCELA + Math.round(v) * DZIEN_MS).toISOString().slice(0, 10);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) return v.trim().slice(0, 10);
  throw new Error(`Nieznany format daty: ${String(v)}`);
}

export function tekst(v: Komorka): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function liczba(v: Komorka): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Porównanie nazwisk niezależne od wielkości liter, spacji i polskich znaków (arkusze są bez diakrytyków). */
export function normalizujNazwisko(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Id konta tylko przy jednoznacznym dopasowaniu nazwiska; inaczej null (trafia do raportu). */
export function dopasujKonto(nazwa: string | null, konta: readonly Konto[]): string | null {
  if (!nazwa) return null;
  const klucz = normalizujNazwisko(nazwa);
  const trafienia = konta.filter((k) => normalizujNazwisko(k.imie_nazwisko) === klucz);
  return trafienia.length === 1 ? (trafienia[0]?.id ?? null) : null;
}

/** Pierwszy wiersz arkusza to nagłówki; puste wiersze są pomijane. */
export function wierszeNaObiekty(wiersze: readonly (readonly Komorka[])[]): Wiersz[] {
  const [naglowki, ...dane] = wiersze;
  if (!naglowki) return [];
  const klucze = naglowki.map((n) => String(n ?? "").trim());
  return dane
    .filter((w) => w.some((k) => tekst(k) !== null))
    .map((w) => Object.fromEntries(klucze.map((k, i) => [k, w[i] ?? null])));
}

export type StatusUrzadzeniaImport = "proponowane" | "aktywne" | "wycofane";

export function mapujStatusUrzadzenia(v: Komorka): StatusUrzadzeniaImport {
  const s = normalizujNazwisko(tekst(v) ?? "");
  if (s === "aktywne") return "aktywne";
  if (s === "proponowane") return "proponowane";
  return "wycofane";
}

export function mapujUrzadzenie(w: Wiersz, konta: readonly Konto[]) {
  const nr = tekst(w["Nr_technologiczny"]);
  const nazwa = tekst(w["Nazwa_urzadzenia"]);
  if (!nr || !nazwa) throw new Error("Urządzenie bez numeru technologicznego lub nazwy");
  const wlasciciel = tekst(w["Wlasciciel"]);
  return {
    nr_technologiczny: nr,
    nazwa_urzadzenia: nazwa,
    kategoria: tekst(w["Kategoria"]),
    lokalizacja: tekst(w["Lokalizacja"]),
    krytycznosc: normalizujKrytycznosc(tekst(w["Krytycznosc"])),
    wlasciciel_nazwa: wlasciciel,
    wlasciciel_id: dopasujKonto(wlasciciel, konta),
    status: mapujStatusUrzadzenia(w["Status_w_rejestrze"]),
    uwagi: tekst(w["Uwagi"]),
  };
}

export function mapujPrzeglad(w: Wiersz) {
  const nr = tekst(w["Nr_technologiczny"]);
  if (!nr) throw new Error("Przegląd bez numeru technologicznego");
  const czestotliwosc = liczba(w["Czestotliwosc_dni"]);
  return {
    nr_technologiczny: nr,
    typ_czynnosci: tekst(w["Typ_czynnosci"]),
    czestotliwosc_dni: czestotliwosc === null ? null : Math.round(czestotliwosc),
    data_ostatniego: dataZExcela(w["Data_ostatniego_przegladu"]),
    data_najblizszego: dataZExcela(w["Data_najblizszego_przegladu"]),
    wykonawca: tekst(w["Wykonawca"]),
    uwagi: tekst(w["Uwagi"]),
  };
}

/** Arkusz ma tylko daty; południe UTC nie przesuwa dnia w żadnej europejskiej strefie. */
function znacznikCzasu(data: string | null): string | null {
  return data ? `${data}T12:00:00Z` : null;
}

export function mapujAwarie(w: Wiersz, konta: readonly Konto[]) {
  const numer = tekst(w["ID_zgloszenia"]);
  const nr = tekst(w["Nr_technologiczny"]);
  const dataAwarii = znacznikCzasu(dataZExcela(w["Data_awarii"]));
  if (!numer || !nr || !dataAwarii) throw new Error("Awaria bez numeru, urządzenia lub daty");
  const zamknieta = normalizujNazwisko(tekst(w["Status"]) ?? "") === "zamknieta";
  const osoba = tekst(w["Osoba_zglaszajaca"]);
  return {
    numer,
    nr_technologiczny: nr,
    nazwa_urzadzenia: tekst(w["Nazwa_urzadzenia"]) ?? nr,
    data_awarii: dataAwarii,
    opis_awarii: tekst(w["Opis_awarii"]) ?? "(brak opisu w arkuszu)",
    przyczyna: tekst(w["Przyczyna"]),
    czas_przestoju_h: liczba(w["Czas_przestoju_h"]),
    krytycznosc_skutku: tekst(w["Krytycznosc_skutku"]) ?? "Srednia",
    zglaszajacy_nazwa: osoba,
    zglaszajacy_id: dopasujKonto(osoba, konta),
    status: zamknieta ? ("zamknieta" as const) : ("zgloszona" as const),
    data_zamkniecia: zamknieta ? znacznikCzasu(dataZExcela(w["Data_zamkniecia"])) : null,
  };
}
