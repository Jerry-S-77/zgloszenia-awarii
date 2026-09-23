/**
 * Obliczenia harmonogramu przeglądów do wyświetlania. Status nie jest zapisywany w bazie — liczymy go
 * zawsze z terminu. Daty jako tekst `YYYY-MM-DD` (kolumny `date` z Supabase), arytmetyka w UTC, żeby
 * zmiana czasu letniego nie przesuwała dni.
 */

export const PROG_WKROTCE_DNI = 14;

export const STATUSY_PRZEGLADU = [
  "opozniony",
  "wkrotce",
  "zaplanowany",
  "do_uzupelnienia",
] as const;
export type StatusPrzegladu = (typeof STATUSY_PRZEGLADU)[number];

export const ETYKIETY_STATUSU_PRZEGLADU: Record<StatusPrzegladu, string> = {
  opozniony: "Opóźniony",
  wkrotce: "Wkrótce",
  zaplanowany: "Zaplanowany",
  do_uzupelnienia: "Do uzupełnienia",
};

export type TerminPrzegladu = { data_najblizszego: string | null };

/** Dzisiejsza data w strefie urządzenia (użytkownik jest w zakładzie, więc to czas lokalny). */
export function dzisLokalnie(teraz: Date = new Date()): string {
  const d = new Date(teraz);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function dodajDni(data: string, dni: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dni);
  return d.toISOString().slice(0, 10);
}

/** Liczba dni od `od` do `do_` (dodatnia, gdy `do_` jest później). */
export function roznicaDni(od: string, do_: string): number {
  return Math.round((Date.parse(`${do_}T00:00:00Z`) - Date.parse(`${od}T00:00:00Z`)) / 86_400_000);
}

export function statusPrzegladu(p: TerminPrzegladu, dzis: string): StatusPrzegladu {
  if (!p.data_najblizszego) return "do_uzupelnienia";
  const dni = roznicaDni(dzis, p.data_najblizszego);
  if (dni < 0) return "opozniony";
  if (dni <= PROG_WKROTCE_DNI) return "wkrotce";
  return "zaplanowany";
}

/** Zwierciadło triggera `przeglady_wykonania_po`: następny termin = data wykonania + częstotliwość. */
export function nastepnyTermin(
  dataWykonania: string,
  czestotliwoscDni: number | null,
): string | null {
  return czestotliwoscDni ? dodajDni(dataWykonania, czestotliwoscDni) : null;
}

/** Najpilniejsze pierwsze (najwcześniejszy termin), przeglądy bez terminu na końcu. */
export function sortujPoPilnosci<T extends TerminPrzegladu>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) => {
    if (a.data_najblizszego === b.data_najblizszego) return 0;
    if (a.data_najblizszego === null) return 1;
    if (b.data_najblizszego === null) return -1;
    return a.data_najblizszego < b.data_najblizszego ? -1 : 1;
  });
}

export const FILTRY_PRZEGLADOW = ["wszystkie", "opoznione", "30dni", "do_uzupelnienia"] as const;
export type FiltrPrzegladow = (typeof FILTRY_PRZEGLADOW)[number];

export function filtrujPrzeglady<T extends TerminPrzegladu>(
  lista: readonly T[],
  filtr: FiltrPrzegladow,
  dzis: string,
): T[] {
  switch (filtr) {
    case "wszystkie":
      return [...lista];
    case "opoznione":
      return lista.filter((p) => statusPrzegladu(p, dzis) === "opozniony");
    case "30dni":
      return lista.filter(
        (p) => p.data_najblizszego !== null && roznicaDni(dzis, p.data_najblizszego) <= 30,
      );
    case "do_uzupelnienia":
      return lista.filter((p) => p.data_najblizszego === null);
  }
}

/** „−22 dni", „dziś", „za 1 dzień", „za 6 dni" (minus typograficzny, czytelny z daleka). */
export function opisTerminu(dni: number): string {
  if (dni === 0) return "dziś";
  const n = Math.abs(dni);
  const jednostka = n === 1 ? "dzień" : "dni";
  return dni < 0 ? `−${n} ${jednostka}` : `za ${n} ${jednostka}`;
}

/** `2026-09-04` → `04.09.2026`. */
export function formatujDate(data: string | null): string {
  if (!data) return "—";
  const [r, m, d] = data.split("-");
  return `${d}.${m}.${r}`;
}

/** Kolor paska i licznika; zawsze razem z etykietą tekstową (kolor nie jest jedyną informacją). */
export const KOLOR_STATUSU: Record<StatusPrzegladu, { pasek: string; tekst: string }> = {
  opozniony: { pasek: "border-l-destructive", tekst: "text-destructive" },
  wkrotce: { pasek: "border-l-warning", tekst: "text-warning-foreground" },
  zaplanowany: { pasek: "border-l-success", tekst: "text-success" },
  do_uzupelnienia: { pasek: "border-l-muted-foreground", tekst: "text-muted-foreground" },
};
