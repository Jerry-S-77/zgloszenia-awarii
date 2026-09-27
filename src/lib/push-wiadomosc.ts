/** Wspólne dla serwera (wysyłka) i testów: kształt wiadomości push i wybór subskrypcji. */

export type PowiadomienieDoPush = {
  id: string;
  tresc: string;
  link: string | null;
  krytyczne: boolean;
  typ: string;
};

export type WiadomoscPush = {
  id: string;
  tytul: string;
  tresc: string;
  link: string;
  krytyczne: boolean;
};

const TYTULY: Record<string, string> = {
  nowa_awaria: "Nowa awaria",
  przydzielenie: "Dodano Cię do zespołu",
  zmiana_statusu: "Zmiana statusu awarii",
  propozycja_przegladu: "Propozycja przyspieszenia przeglądu",
  przeglad_wkrotce: "Zbliża się przegląd",
  przeglad_opozniony: "Przegląd opóźniony",
  przeglad_nieprawidlowosc: "Nieprawidłowość w przeglądzie",
  czesc_dostarczona: "Część dotarła",
  niski_stan: "Niski stan magazynu",
};

/** Link tylko wewnątrz aplikacji (ścieżka od „/”), żeby push nie mógł wysłać nikogo na obcą stronę. */
function bezpiecznyLink(link: string | null): string {
  return link && /^\/(?!\/)/.test(link) ? link : "/powiadomienia";
}

export function wiadomoscPush(p: PowiadomienieDoPush): WiadomoscPush {
  return {
    id: p.id,
    tytul: `${p.krytyczne ? "⚠ " : ""}${TYTULY[p.typ] ?? "Zgłaszanie awarii"}`,
    tresc: p.tresc,
    link: bezpiecznyLink(p.link),
    krytyczne: p.krytyczne,
  };
}

/** Subskrypcje, które obejmują to powiadomienie: krytyczne idzie do wszystkich, reszta do „wszystkie”. */
export function subskrypcjeDlaPowiadomienia<T extends { tylko_krytyczne: boolean }>(
  subskrypcje: T[],
  krytyczne: boolean,
): T[] {
  return subskrypcje.filter((s) => krytyczne || !s.tylko_krytyczne);
}

/** Porównanie sekretu w stałym czasie (bez zdradzania długości wspólnego prefiksu). */
export function zgodnySekret(podany: string | null, oczekiwany: string): boolean {
  if (!podany || podany.length !== oczekiwany.length) return false;
  let roznica = 0;
  for (let i = 0; i < oczekiwany.length; i++)
    roznica |= podany.charCodeAt(i) ^ oczekiwany.charCodeAt(i);
  return roznica === 0;
}
