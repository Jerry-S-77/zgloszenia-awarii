/** Lista kontrolna przeglądu: punkty w harmonogramie, wyniki zapisywane przy wykonaniu (baza sprawdza to samo). */

export const MAKS_PUNKTOW = 30;
export const MAKS_DLUGOSC_PUNKTU = 200;
export const MAKS_DLUGOSC_UWAGI = 500;

export const WYNIKI = ["ok", "nok", "nd"] as const;
export type Wynik = (typeof WYNIKI)[number];

export const ETYKIETY_WYNIKU: Record<Wynik, string> = {
  ok: "OK",
  nok: "Nieprawidłowość",
  nd: "Nie dotyczy",
};

export type WynikPunktu = { tresc: string; wynik: Wynik | null; uwaga: string };
export type ZapisanyWynik = { tresc: string; wynik: Wynik; uwaga: string | null };

export function pusteWyniki(lista: readonly string[]): WynikPunktu[] {
  return lista.map((tresc) => ({ tresc, wynik: null, uwaga: "" }));
}

/** Pierwszy problem z wynikami (komunikat dla użytkownika) albo null, gdy można zapisać. */
export function bladWynikow(wyniki: readonly WynikPunktu[]): string | null {
  for (const w of wyniki) {
    if (!w.wynik) return `Oceń punkt: ${w.tresc}`;
    if (w.wynik === "nok" && !w.uwaga.trim()) return `Opisz nieprawidłowość: ${w.tresc}`;
    if (w.uwaga.trim().length > MAKS_DLUGOSC_UWAGI) {
      return `Opis punktu może mieć najwyżej ${MAKS_DLUGOSC_UWAGI} znaków.`;
    }
  }
  return null;
}

/** Wyniki w kształcie zapisywanym w bazie (bez pustych uwag). */
export function doZapisu(wyniki: readonly WynikPunktu[]): ZapisanyWynik[] {
  return wyniki.map((w) => ({
    tresc: w.tresc,
    wynik: w.wynik as Wynik,
    uwaga: w.uwaga.trim() || null,
  }));
}

/** Punkty harmonogramu po edycji: obcięte spacje, bez pustych. Zwraca błąd, gdy lista jest za długa. */
export function oczyscPunkty(punkty: readonly string[]): { punkty: string[]; blad: string | null } {
  const czyste = punkty.map((p) => p.trim()).filter((p) => p.length > 0);
  if (czyste.length > MAKS_PUNKTOW) {
    return { punkty: czyste, blad: `Lista kontrolna może mieć najwyżej ${MAKS_PUNKTOW} punktów.` };
  }
  const zaDlugi = czyste.find((p) => p.length > MAKS_DLUGOSC_PUNKTU);
  if (zaDlugi) {
    return { punkty: czyste, blad: `Punkt może mieć najwyżej ${MAKS_DLUGOSC_PUNKTU} znaków.` };
  }
  return { punkty: czyste, blad: null };
}

/** Wyniki zapisane w bazie (jsonb) w bezpiecznym kształcie do wyświetlenia. */
export function odczytajWyniki(json: unknown): ZapisanyWynik[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((e) => {
    const w = e as Partial<ZapisanyWynik> | null;
    if (!w || typeof w.tresc !== "string" || !WYNIKI.includes(w.wynik as Wynik)) return [];
    return [{ tresc: w.tresc, wynik: w.wynik as Wynik, uwaga: w.uwaga ?? null }];
  });
}
