import {
  BEZ_KATEGORII,
  KATEGORIE_PRZYCZYN,
  KROTKIE_ETYKIETY_KATEGORII,
  type KategoriaPrzyczyny,
} from "./kategorie-przyczyn";

const MS_GODZINA = 3_600_000;

/** Pola awarii potrzebne do wskaźników (pasuje do wierszy z listy awarii). */
export type AwariaDoWskaznikow = {
  nr_technologiczny: string;
  data_awarii: string;
  status: string;
  czas_przestoju_h: number | null;
  kategoria_przyczyny?: KategoriaPrzyczyny | null;
};

export type Okres = { od: Date; do: Date };

/** Ostatnie `dni` dni, kończące się w chwili `teraz`. */
export function okresOstatnichDni(dni: number, teraz = new Date()): Okres {
  return { od: new Date(teraz.getTime() - dni * 24 * MS_GODZINA), do: teraz };
}

export function wOkresie<T extends { data_awarii: string }>(awarie: T[], okres: Okres): T[] {
  const od = okres.od.getTime();
  const doo = okres.do.getTime();
  return awarie.filter((a) => {
    const t = new Date(a.data_awarii).getTime();
    return t >= od && t <= doo;
  });
}

export type Wskazniki = {
  liczba: number;
  przestojH: number;
  /** Średni czas przestoju zamkniętej awarii (h); null, gdy brak zamkniętych z podanym przestojem. */
  mttrH: number | null;
  /** Średni czas między awariami (h) = (czas okresu − przestój) / liczba awarii; null, gdy brak awarii. */
  mtbfH: number | null;
};

/**
 * MTBF i MTTR jednego urządzenia (albo dowolnego zbioru awarii) w okresie. Czas pracy liczony kalendarzowo
 * (24/7), bo aplikacja nie zna planu zmian; przestój odejmowany od czasu okresu.
 */
export function wskazniki(awarie: AwariaDoWskaznikow[], okres: Okres): Wskazniki {
  const w = wOkresie(awarie, okres);
  const przestojH = w.reduce((s, a) => s + (a.czas_przestoju_h ?? 0), 0);
  const zamkniete = w.filter((a) => a.status === "zamknieta" && a.czas_przestoju_h !== null);
  const mttrH = zamkniete.length
    ? zamkniete.reduce((s, a) => s + (a.czas_przestoju_h ?? 0), 0) / zamkniete.length
    : null;
  const okresH = (okres.do.getTime() - okres.od.getTime()) / MS_GODZINA;
  const mtbfH = w.length ? Math.max(0, okresH - przestojH) / w.length : null;
  return { liczba: w.length, przestojH, mttrH, mtbfH };
}

export type WskaznikiUrzadzenia = Wskazniki & { nr_technologiczny: string };

/** Wskaźniki per urządzenie (tylko urządzenia z awariami w okresie), najmniej niezawodne (najkrótszy MTBF) pierwsze. */
export function wskaznikiUrzadzen(
  awarie: AwariaDoWskaznikow[],
  okres: Okres,
): WskaznikiUrzadzenia[] {
  const grupy = new Map<string, AwariaDoWskaznikow[]>();
  for (const a of wOkresie(awarie, okres)) {
    grupy.set(a.nr_technologiczny, [...(grupy.get(a.nr_technologiczny) ?? []), a]);
  }
  return [...grupy.entries()]
    .map(([nr, lista]) => ({ nr_technologiczny: nr, ...wskazniki(lista, okres) }))
    .sort((a, b) => (a.mtbfH ?? Infinity) - (b.mtbfH ?? Infinity));
}

export type MiaraPareto = "liczba" | "przestoj";

export type PozycjaPareto = {
  klucz: KategoriaPrzyczyny | null;
  etykieta: string;
  wartosc: number;
  /** Udział w całości, 0–100. */
  udzial: number;
  /** Suma narastająca udziałów, 0–100. */
  narastajaco: number;
};

/**
 * Pareto kategorii przyczyn zamkniętych awarii: kategorie malejąco wg liczby awarii albo godzin przestoju,
 * awarie bez kategorii jako „Nie określono” zawsze na końcu. Kategorie z zerową wartością są pomijane.
 */
export function pareto(awarie: AwariaDoWskaznikow[], miara: MiaraPareto): PozycjaPareto[] {
  const zamkniete = awarie.filter((a) => a.status === "zamknieta");
  const wartosc = (a: AwariaDoWskaznikow) => (miara === "liczba" ? 1 : (a.czas_przestoju_h ?? 0));
  const suma = zamkniete.reduce((s, a) => s + wartosc(a), 0);
  if (suma === 0) return [];
  const naKategorie = KATEGORIE_PRZYCZYN.map((k) => ({
    klucz: k as KategoriaPrzyczyny | null,
    etykieta: KROTKIE_ETYKIETY_KATEGORII[k],
    wartosc: zamkniete
      .filter((a) => a.kategoria_przyczyny === k)
      .reduce((s, a) => s + wartosc(a), 0),
  }))
    .filter((p) => p.wartosc > 0)
    .sort((a, b) => b.wartosc - a.wartosc);
  const bez = zamkniete.filter((a) => !a.kategoria_przyczyny).reduce((s, a) => s + wartosc(a), 0);
  if (bez > 0) naKategorie.push({ klucz: null, etykieta: BEZ_KATEGORII, wartosc: bez });
  let narastajaco = 0;
  return naKategorie.map((p) => {
    const udzial = (p.wartosc / suma) * 100;
    narastajaco += udzial;
    return { ...p, udzial, narastajaco: Math.min(100, narastajaco) };
  });
}

/** Czas w godzinach czytelnie: do 48 h w godzinach, dłużej w dniach. */
export function formatujCzas(godziny: number | null): string {
  if (godziny === null) return "—";
  if (godziny < 48) return `${godziny.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} h`;
  return `${(godziny / 24).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} dni`;
}
