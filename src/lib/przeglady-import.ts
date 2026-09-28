/**
 * Import harmonogramu przeglądów z pliku (wzór `public/wzory/wzor-importu-przegladow.csv`). Przegląd jest
 * rozpoznawany po urządzeniu i typie czynności; lista kontrolna to punkty rozdzielone znakiem „|”. Baza
 * (RPC `przeglady_import`, kierownik i admin) sprawdza wszystko jeszcze raz i zapisuje całość albo nic.
 */
import {
  data,
  kluczTekstu,
  liczba,
  pustyWiersz,
  sprawdzLimit,
  tabela,
  type Komorka,
  type WynikImportu,
} from "./import-plik";
import { dodajDni } from "./przeglady";

export const MAKS_PUNKTOW = 30;

export type WierszPrzegladu = {
  nr_technologiczny: string;
  typ_czynnosci: string;
  czestotliwosc_dni?: number;
  data_ostatniego?: string;
  data_najblizszego?: string;
  wykonawca?: string;
  uwagi?: string;
  lista_kontrolna?: string[];
};

/** „Filtr | Pasek|  Łożyska ” → ["Filtr", "Pasek", "Łożyska"]. */
export function rozdzielListe(tekst: string): string[] {
  return tekst
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * `urzadzenia` — numery z rejestru (nieznane od razu w błędach); `dzis` — RRRR-MM-DD, data ostatniego
 * przeglądu nie może być późniejsza. Brak daty najbliższego = ostatni + częstotliwość (jak w bazie).
 */
export function mapujPrzeglady(
  wiersze: Komorka[][],
  dzis: string,
  urzadzenia?: ReadonlySet<string>,
): WynikImportu<WierszPrzegladu> {
  const { tabela: t, bledy } = tabela(wiersze, ["nr_technologiczny", "typ_czynnosci"]);
  if (bledy.length) return { wiersze: [], bledy };
  const widziane = new Set<string>();
  const wynik: WierszPrzegladu[] = [];
  t.dane.forEach((w, i) => {
    if (pustyWiersz(w)) return;
    const nr = i + 2;
    const numer = t.tekst(w, "nr_technologiczny");
    const typ = t.tekst(w, "typ_czynnosci");
    if (!numer) return void bledy.push(`Wiersz ${nr}: numer technologiczny jest wymagany.`);
    if (urzadzenia && !urzadzenia.has(numer))
      return void bledy.push(`Wiersz ${nr}: nie ma urządzenia ${numer}.`);
    if (!typ || typ.length > 200)
      return void bledy.push(`Wiersz ${nr}: typ czynności jest wymagany (do 200 znaków).`);
    const klucz = `${numer}|${kluczTekstu(typ)}`;
    if (widziane.has(klucz))
      return void bledy.push(`Wiersz ${nr}: przegląd ${numer} („${typ}”) powtarza się w pliku.`);
    widziane.add(klucz);

    const czest = liczba(t.tekst(w, "czestotliwosc_dni"));
    if (
      czest === null ||
      (czest !== undefined && (!Number.isInteger(czest) || czest < 1 || czest > 3650))
    )
      return void bledy.push(`Wiersz ${nr}: częstotliwość to liczba całkowita 1–3650 dni.`);
    const ostatni = data(t.komorka(w, "data_ostatniego"));
    const najblizszyZPliku = data(t.komorka(w, "data_najblizszego"));
    if (ostatni === null || najblizszyZPliku === null)
      return void bledy.push(`Wiersz ${nr}: datę wpisz jako RRRR-MM-DD albo DD.MM.RRRR.`);
    if (ostatni && ostatni > dzis)
      return void bledy.push(`Wiersz ${nr}: data ostatniego przeglądu nie może być z przyszłości.`);
    const najblizszy =
      najblizszyZPliku ?? (ostatni && czest ? dodajDni(ostatni, czest) : undefined);

    const wykonawca = t.tekst(w, "wykonawca");
    const uwagi = t.tekst(w, "uwagi");
    if (wykonawca.length > 200 || uwagi.length > 4000)
      return void bledy.push(`Wiersz ${nr}: za długi wykonawca lub uwagi.`);
    const lista = rozdzielListe(t.tekst(w, "lista_kontrolna"));
    if (lista.length > MAKS_PUNKTOW || lista.some((p) => p.length > 200))
      return void bledy.push(
        `Wiersz ${nr}: lista kontrolna — najwyżej ${MAKS_PUNKTOW} punktów po 200 znaków.`,
      );

    wynik.push({
      nr_technologiczny: numer,
      typ_czynnosci: typ,
      ...(czest !== undefined ? { czestotliwosc_dni: czest } : {}),
      ...(ostatni ? { data_ostatniego: ostatni } : {}),
      ...(najblizszy ? { data_najblizszego: najblizszy } : {}),
      ...(wykonawca ? { wykonawca } : {}),
      ...(uwagi ? { uwagi } : {}),
      ...(lista.length ? { lista_kontrolna: lista } : {}),
    });
  });
  return sprawdzLimit({ wiersze: wynik, bledy });
}
