/**
 * Import rejestru urządzeń z pliku (wzór `public/wzory/wzor-importu-urzadzen.csv`). Nowy numer = nowe
 * urządzenie, istniejący = aktualizacja (puste pola zostawiają dotychczasową wartość). Baza (RPC
 * `urzadzenia_import`, tylko admin) sprawdza wszystko jeszcze raz i zapisuje całość albo nic.
 */
import { pustyWiersz, sprawdzLimit, tabela, type Komorka, type WynikImportu } from "./import-plik";
import { normalizujKrytycznosc, type Krytycznosc, type StatusUrzadzenia } from "./urzadzenia";

export type WierszUrzadzenia = {
  nr_technologiczny: string;
  nazwa_urzadzenia: string;
  kategoria?: string;
  lokalizacja?: string;
  krytycznosc?: Krytycznosc;
  wlasciciel_email?: string;
  status?: StatusUrzadzenia;
  uwagi?: string;
};

function normalizujStatus(tekst: string): StatusUrzadzenia | null {
  const t = tekst.trim().toLowerCase();
  const skroty: Record<string, StatusUrzadzenia> = {
    aktywne: "aktywne",
    aktywny: "aktywne",
    proponowane: "proponowane",
    proponowany: "proponowane",
    wycofane: "wycofane",
    wycofany: "wycofane",
  };
  return skroty[t] ?? null;
}

/**
 * `istniejace` — numery już w rejestrze (nowe urządzenie wymaga krytyczności); `emaileKont` — e-maile kont
 * (małymi literami), żeby od razu wskazać nieznanego właściciela. Oba opcjonalne; baza i tak sprawdza.
 */
export function mapujUrzadzenia(
  wiersze: Komorka[][],
  istniejace?: ReadonlySet<string>,
  emaileKont?: ReadonlySet<string>,
): WynikImportu<WierszUrzadzenia> {
  const { tabela: t, bledy } = tabela(wiersze, ["nr_technologiczny", "nazwa_urzadzenia"]);
  if (bledy.length) return { wiersze: [], bledy };
  const widziane = new Set<string>();
  const wynik: WierszUrzadzenia[] = [];
  t.dane.forEach((w, i) => {
    if (pustyWiersz(w)) return;
    const nr = i + 2;
    const numer = t.tekst(w, "nr_technologiczny");
    const nazwa = t.tekst(w, "nazwa_urzadzenia");
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(numer))
      return void bledy.push(
        `Wiersz ${nr}: numer technologiczny — do 40 znaków: litery, cyfry, kropka, myślnik, podkreślenie.`,
      );
    if (widziane.has(numer))
      return void bledy.push(`Wiersz ${nr}: numer ${numer} powtarza się w pliku.`);
    widziane.add(numer);
    if (nazwa.length < 2 || nazwa.length > 300)
      return void bledy.push(`Wiersz ${nr}: nazwa urządzenia jest wymagana (2–300 znaków).`);

    const krytTekst = t.tekst(w, "krytycznosc");
    const krytycznosc = normalizujKrytycznosc(krytTekst);
    if (krytTekst && !krytycznosc)
      return void bledy.push(`Wiersz ${nr}: krytyczność to Niska, Średnia albo Wysoka.`);
    if (!krytycznosc && istniejace && !istniejace.has(numer))
      return void bledy.push(`Wiersz ${nr}: nowe urządzenie wymaga krytyczności.`);

    const statusTekst = t.tekst(w, "status");
    const status = statusTekst ? normalizujStatus(statusTekst) : null;
    if (statusTekst && !status)
      return void bledy.push(`Wiersz ${nr}: status to proponowane, aktywne albo wycofane.`);

    const email = t.tekst(w, "wlasciciel_email").toLowerCase();
    if (email && emaileKont && !emaileKont.has(email))
      return void bledy.push(`Wiersz ${nr}: nie ma konta ${email} (właściciel).`);

    const kategoria = t.tekst(w, "kategoria");
    const lokalizacja = t.tekst(w, "lokalizacja");
    const uwagi = t.tekst(w, "uwagi");
    if (kategoria.length > 200 || lokalizacja.length > 300 || uwagi.length > 2000)
      return void bledy.push(`Wiersz ${nr}: za długa kategoria, lokalizacja lub uwagi.`);

    wynik.push({
      nr_technologiczny: numer,
      nazwa_urzadzenia: nazwa,
      ...(kategoria ? { kategoria } : {}),
      ...(lokalizacja ? { lokalizacja } : {}),
      ...(krytycznosc ? { krytycznosc } : {}),
      ...(email ? { wlasciciel_email: email } : {}),
      ...(status ? { status } : {}),
      ...(uwagi ? { uwagi } : {}),
    });
  });
  return sprawdzLimit({ wiersze: wynik, bledy });
}
