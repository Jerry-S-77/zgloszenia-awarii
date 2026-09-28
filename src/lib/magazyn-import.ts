/**
 * Importy magazynu z pliku: katalog części, inwentaryzacja (stan faktyczny) i dostawa zbiorcza. Kolumny
 * zgodne z wzorami w `public/wzory/`. Baza (RPC `magazyn_import`, `magazyn_inwentaryzacja`,
 * `magazyn_dostawa`) sprawdza wszystko jeszcze raz i zapisuje całość albo nic.
 */
import {
  do2Miejsc,
  dwaMiejsca,
  liczba,
  pustyWiersz,
  sprawdzLimit,
  tabela,
  tak,
  type Komorka,
  type WynikImportu,
} from "./import-plik";

export { parsujCsv } from "./import-plik";

export const KOLUMNY_IMPORTU = [
  "numer_katalogowy",
  "nazwa",
  "jednostka",
  "stan_minimalny",
  "stan_poczatkowy",
  "lokalizacja",
  "urzadzenia",
  "krytyczna",
] as const;

export type WierszImportu = {
  numer_katalogowy: string;
  nazwa: string;
  jednostka?: string;
  stan_minimalny?: number;
  stan_poczatkowy?: number;
  lokalizacja?: string;
  urzadzenia: string[];
  krytyczna: boolean;
};

export type WynikParsowania = WynikImportu<WierszImportu>;

/** Katalog części: wiersze (pierwszy = nagłówek) → dane importu z listą błędów. */
export function mapujWiersze(wiersze: Komorka[][]): WynikParsowania {
  const { tabela: t, bledy } = tabela(wiersze, ["numer_katalogowy", "nazwa"]);
  if (bledy.length) return { wiersze: [], bledy };
  const widziane = new Set<string>();
  const wynik: WierszImportu[] = [];
  t.dane.forEach((w, i) => {
    if (pustyWiersz(w)) return;
    const nr = i + 2;
    const numer = t.tekst(w, "numer_katalogowy");
    const nazwa = t.tekst(w, "nazwa");
    if (!numer || !nazwa)
      return void bledy.push(`Wiersz ${nr}: numer katalogowy i nazwa są wymagane.`);
    if (numer.length > 100 || nazwa.length > 200) {
      return void bledy.push(`Wiersz ${nr}: numer (do 100) lub nazwa (do 200 znaków) za długie.`);
    }
    if (widziane.has(numer))
      return void bledy.push(`Wiersz ${nr}: numer ${numer} powtarza się w pliku.`);
    widziane.add(numer);
    const min = liczba(t.tekst(w, "stan_minimalny"));
    const poczatkowy = liczba(t.tekst(w, "stan_poczatkowy"));
    if (min === null || poczatkowy === null) {
      return void bledy.push(`Wiersz ${nr}: stany muszą być liczbami nieujemnymi.`);
    }
    if (!dwaMiejsca(min ?? 0) || !dwaMiejsca(poczatkowy ?? 0)) {
      return void bledy.push(`Wiersz ${nr}: stany — najwyżej 2 miejsca po przecinku.`);
    }
    const jednostka = t.tekst(w, "jednostka");
    const lokalizacja = t.tekst(w, "lokalizacja");
    wynik.push({
      numer_katalogowy: numer,
      nazwa,
      ...(jednostka ? { jednostka } : {}),
      ...(min !== undefined ? { stan_minimalny: do2Miejsc(min) } : {}),
      ...(poczatkowy !== undefined ? { stan_poczatkowy: do2Miejsc(poczatkowy) } : {}),
      ...(lokalizacja ? { lokalizacja } : {}),
      urzadzenia: t
        .tekst(w, "urzadzenia")
        .split(/[,;\s]+/)
        .map((u) => u.trim())
        .filter(Boolean),
      krytyczna: tak(t.tekst(w, "krytyczna")),
    });
  });
  return sprawdzLimit({ wiersze: wynik, bledy });
}

/** Uwagi inwentaryzacji trafiają do ruchu z prefiksem „Inwentaryzacja: ” (pole ma 500 znaków). */
export const MAKS_UWAG = 480;

export type WierszInwentaryzacji = {
  numer_katalogowy: string;
  stan_faktyczny: number;
  uwagi?: string;
};

/**
 * Inwentaryzacja: stan faktyczny każdej części. `znaneNumery` (katalog z aplikacji) pozwala od razu wskazać
 * numery spoza magazynu; bez niego sprawdza tylko baza.
 */
export function mapujInwentaryzacje(
  wiersze: Komorka[][],
  znaneNumery?: ReadonlySet<string>,
): WynikImportu<WierszInwentaryzacji> {
  const { tabela: t, bledy } = tabela(wiersze, ["numer_katalogowy", "stan_faktyczny"]);
  if (bledy.length) return { wiersze: [], bledy };
  const widziane = new Set<string>();
  const wynik: WierszInwentaryzacji[] = [];
  t.dane.forEach((w, i) => {
    if (pustyWiersz(w)) return;
    const nr = i + 2;
    const numer = t.tekst(w, "numer_katalogowy");
    const stan = liczba(t.tekst(w, "stan_faktyczny"));
    if (!numer) return void bledy.push(`Wiersz ${nr}: numer katalogowy jest wymagany.`);
    if (znaneNumery && !znaneNumery.has(numer))
      return void bledy.push(`Wiersz ${nr}: nie ma w magazynie części ${numer}.`);
    if (widziane.has(numer))
      return void bledy.push(`Wiersz ${nr}: część ${numer} powtarza się w pliku.`);
    widziane.add(numer);
    if (stan === undefined || stan === null || stan > 1_000_000 || !dwaMiejsca(stan))
      return void bledy.push(
        `Wiersz ${nr}: stan faktyczny musi być liczbą nieujemną (najwyżej 2 miejsca po przecinku).`,
      );
    const uwagi = t.tekst(w, "uwagi");
    if (uwagi.length > MAKS_UWAG)
      return void bledy.push(`Wiersz ${nr}: uwagi mogą mieć najwyżej ${MAKS_UWAG} znaków.`);
    wynik.push({
      numer_katalogowy: numer,
      stan_faktyczny: do2Miejsc(stan),
      ...(uwagi ? { uwagi } : {}),
    });
  });
  return sprawdzLimit({ wiersze: wynik, bledy });
}

export type WierszDostawy = { numer_katalogowy: string; ilosc: number; dokument?: string };

/** Dostawa zbiorcza: przyjęcie wielu pozycji naraz (ta sama część może wystąpić kilka razy). */
export function mapujDostawe(
  wiersze: Komorka[][],
  znaneNumery?: ReadonlySet<string>,
): WynikImportu<WierszDostawy> {
  const { tabela: t, bledy } = tabela(wiersze, ["numer_katalogowy", "ilosc"]);
  if (bledy.length) return { wiersze: [], bledy };
  const wynik: WierszDostawy[] = [];
  t.dane.forEach((w, i) => {
    if (pustyWiersz(w)) return;
    const nr = i + 2;
    const numer = t.tekst(w, "numer_katalogowy");
    const ilosc = liczba(t.tekst(w, "ilosc"));
    const dokument = t.tekst(w, "dokument");
    if (!numer) return void bledy.push(`Wiersz ${nr}: numer katalogowy jest wymagany.`);
    if (znaneNumery && !znaneNumery.has(numer))
      return void bledy.push(`Wiersz ${nr}: nie ma w magazynie części ${numer}.`);
    if (!ilosc || ilosc < 0.01 || ilosc > 100_000 || !dwaMiejsca(ilosc))
      return void bledy.push(
        `Wiersz ${nr}: ilość od 0,01 do 100000 (najwyżej 2 miejsca po przecinku).`,
      );
    if (dokument.length > 100)
      return void bledy.push(`Wiersz ${nr}: numer dokumentu może mieć najwyżej 100 znaków.`);
    wynik.push({
      numer_katalogowy: numer,
      ilosc: do2Miejsc(ilosc),
      ...(dokument ? { dokument } : {}),
    });
  });
  return sprawdzLimit({ wiersze: wynik, bledy });
}
