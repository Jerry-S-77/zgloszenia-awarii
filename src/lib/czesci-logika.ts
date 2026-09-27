/** Części zamienne przy awarii — czysta logika (etykiety, kolejny etap, agregacja historii urządzenia). */

export const STATUSY_CZESCI = ["potrzebna", "zamowiona", "dostarczona"] as const;
export type StatusCzesci = (typeof STATUSY_CZESCI)[number];

export const ETYKIETY_STATUSU_CZESCI: Record<StatusCzesci, string> = {
  potrzebna: "Potrzebna",
  zamowiona: "Zamówiona",
  dostarczona: "Dostarczona",
};

/** Etykieta przycisku przejścia do następnego etapu; null, gdy część już dotarła. */
export function nastepnyEtap(status: StatusCzesci): { na: StatusCzesci; etykieta: string } | null {
  if (status === "potrzebna") return { na: "zamowiona", etykieta: "Oznacz jako zamówioną" };
  if (status === "zamowiona") return { na: "dostarczona", etykieta: "Oznacz jako dostarczoną" };
  return null;
}

/** Nazwa do wyświetlenia: bez spacji na brzegach i podwójnych spacji w środku. */
export function ladnaNazwa(nazwa: string): string {
  return nazwa.trim().replace(/\s+/g, " ");
}

/** Klucz porównania nazw: bez wielkości liter i nadmiarowych spacji („Filtr  HEPA” = „filtr hepa”). */
export function kluczNazwy(nazwa: string): string {
  return ladnaNazwa(nazwa).toLocaleLowerCase("pl-PL");
}

export type CzescZAwaria = {
  nazwa: string;
  ilosc: number;
  status: StatusCzesci;
  awaria: { numer: string | null; data_awarii: string };
};

export type PozycjaHistoriiCzesci = {
  nazwa: string;
  ilosc: number;
  awarie: number;
  ostatnio: string;
};

/**
 * Historia części urządzenia: dostarczone części zsumowane po nazwie (pisownia z najnowszego wpisu),
 * najczęściej wymieniane na górze. Części jeszcze niedostarczone nie są „zużyte”, więc się nie liczą.
 */
export function historiaCzesci(czesci: readonly CzescZAwaria[]): PozycjaHistoriiCzesci[] {
  const grupy = new Map<string, PozycjaHistoriiCzesci & { numery: Set<string> }>();
  for (const c of czesci) {
    if (c.status !== "dostarczona") continue;
    const klucz = kluczNazwy(c.nazwa);
    const g = grupy.get(klucz);
    const numer = c.awaria.numer ?? c.awaria.data_awarii;
    if (!g) {
      grupy.set(klucz, {
        nazwa: ladnaNazwa(c.nazwa),
        ilosc: c.ilosc,
        awarie: 1,
        ostatnio: c.awaria.data_awarii,
        numery: new Set([numer]),
      });
      continue;
    }
    g.ilosc += c.ilosc;
    g.numery.add(numer);
    g.awarie = g.numery.size;
    if (c.awaria.data_awarii > g.ostatnio) {
      g.ostatnio = c.awaria.data_awarii;
      g.nazwa = ladnaNazwa(c.nazwa);
    }
  }
  return [...grupy.values()]
    .map(({ numery: _numery, ...p }) => p)
    .sort((a, b) => b.awarie - a.awarie || b.ilosc - a.ilosc || a.nazwa.localeCompare(b.nazwa));
}

/** Podpowiedzi nazw przy wpisywaniu: części używane wcześniej przy tym urządzeniu, bez powtórzeń. */
export function podpowiedziNazw(czesci: readonly { nazwa: string }[]): string[] {
  const widziane = new Set<string>();
  const wynik: string[] = [];
  for (const c of czesci) {
    const klucz = kluczNazwy(c.nazwa);
    if (widziane.has(klucz)) continue;
    widziane.add(klucz);
    wynik.push(ladnaNazwa(c.nazwa));
  }
  return wynik;
}

/** Dni oczekiwania od daty (ISO) do teraz, zaokrąglone w dół. */
export function dniOczekiwania(od: string, teraz = new Date()): number {
  return Math.max(0, Math.floor((teraz.getTime() - new Date(od).getTime()) / 86_400_000));
}
