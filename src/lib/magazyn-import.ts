/**
 * Import katalogu magazynu z pliku (CSV albo XLSX — oba sprowadzane do tablicy wierszy tekstowych).
 * Kolumny rozpoznawane po nagłówku (kolejność dowolna, wielkość liter bez znaczenia), zgodne z wzorcowym
 * plikiem `public/wzory/wzor-importu-magazynu.csv`. Walidacja tu jest dla czytelnych komunikatów przed
 * wysłaniem; baza (RPC `magazyn_import`) sprawdza wszystko jeszcze raz i importuje całość albo nic.
 */

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

export type WynikParsowania = { wiersze: WierszImportu[]; bledy: string[] };

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
  if (pole !== "" || wiersz.length > 0) {
    wiersz.push(pole);
    wiersze.push(wiersz);
  }
  return wiersze.filter((w) => w.some((p) => p.trim() !== ""));
}

function liczba(tekst: string): number | undefined | null {
  const t = tekst.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function tak(tekst: string): boolean {
  return ["tak", "t", "1", "true", "x", "yes"].includes(tekst.trim().toLowerCase());
}

/** Zamienia wiersze (pierwszy = nagłówek) na dane importu z listą błędów (numer wiersza jak w Excelu). */
export function mapujWiersze(
  wiersze: (string | number | boolean | null | undefined)[][],
): WynikParsowania {
  const bledy: string[] = [];
  const tekstowe = wiersze.map((w) =>
    w.map((p) => (p === null || p === undefined ? "" : String(p))),
  );
  const [naglowek, ...dane] = tekstowe;
  if (!naglowek) return { wiersze: [], bledy: ["Plik jest pusty."] };
  const indeks = new Map(naglowek.map((n, i) => [n.trim().toLowerCase().replace(/\s+/g, "_"), i]));
  for (const wymagana of ["numer_katalogowy", "nazwa"]) {
    if (!indeks.has(wymagana)) bledy.push(`Brak kolumny „${wymagana}” w nagłówku.`);
  }
  if (bledy.length) return { wiersze: [], bledy };
  const pole = (w: string[], k: string) => {
    const i = indeks.get(k);
    return i === undefined ? "" : (w[i] ?? "").trim();
  };
  const widziane = new Set<string>();
  const wynik: WierszImportu[] = [];
  dane.forEach((w, i) => {
    const nr = i + 2;
    const numer = pole(w, "numer_katalogowy");
    const nazwa = pole(w, "nazwa");
    if (!numer || !nazwa)
      return void bledy.push(`Wiersz ${nr}: numer katalogowy i nazwa są wymagane.`);
    if (numer.length > 100 || nazwa.length > 200) {
      return void bledy.push(`Wiersz ${nr}: numer (do 100) lub nazwa (do 200 znaków) za długie.`);
    }
    if (widziane.has(numer))
      return void bledy.push(`Wiersz ${nr}: numer ${numer} powtarza się w pliku.`);
    widziane.add(numer);
    const min = liczba(pole(w, "stan_minimalny"));
    const poczatkowy = liczba(pole(w, "stan_poczatkowy"));
    if (min === null || poczatkowy === null) {
      return void bledy.push(`Wiersz ${nr}: stany muszą być liczbami nieujemnymi.`);
    }
    const jednostka = pole(w, "jednostka");
    const lokalizacja = pole(w, "lokalizacja");
    wynik.push({
      numer_katalogowy: numer,
      nazwa,
      ...(jednostka ? { jednostka } : {}),
      ...(min !== undefined ? { stan_minimalny: min } : {}),
      ...(poczatkowy !== undefined ? { stan_poczatkowy: poczatkowy } : {}),
      ...(lokalizacja ? { lokalizacja } : {}),
      urzadzenia: pole(w, "urzadzenia")
        .split(/[,;\s]+/)
        .map((u) => u.trim())
        .filter(Boolean),
      krytyczna: tak(pole(w, "krytyczna")),
    });
  });
  if (wynik.length > 2000) bledy.push("Najwyżej 2000 wierszy w jednym imporcie.");
  return { wiersze: wynik, bledy };
}
