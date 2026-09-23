import type { Rola } from "./uprawnienia";

export const STATUSY_AWARII = [
  "zgloszona",
  "przyjeta",
  "w_naprawie",
  "oczekuje_na_czesc",
  "zamknieta",
] as const;
export type StatusAwarii = (typeof STATUSY_AWARII)[number];

export const ETYKIETY_STATUSOW: Record<StatusAwarii, string> = {
  zgloszona: "Zgłoszona",
  przyjeta: "Przyjęta",
  w_naprawie: "W naprawie",
  oczekuje_na_czesc: "Oczekuje na część",
  zamknieta: "Zamknięta",
};

export type Przejscie = { na: StatusAwarii; etykietaAkcji: string; role: readonly Rola[] };

const OBSLUGA: readonly Rola[] = ["technik", "kierownik", "admin"];
const DECYZJA: readonly Rola[] = ["kierownik", "admin"];

/** Zwierciadło triggera `awarie_waliduj_przejscie` (baza jest ostatnią linią obrony, to tylko UI). */
const PRZEJSCIA: Record<StatusAwarii, Przejscie[]> = {
  zgloszona: [
    { na: "przyjeta", etykietaAkcji: "Przyjmij zgłoszenie", role: OBSLUGA },
    { na: "zamknieta", etykietaAkcji: "Zamknij (odrzuć)", role: OBSLUGA },
  ],
  przyjeta: [
    { na: "w_naprawie", etykietaAkcji: "Rozpocznij naprawę", role: OBSLUGA },
    { na: "zamknieta", etykietaAkcji: "Zamknij (odrzuć)", role: OBSLUGA },
  ],
  w_naprawie: [
    { na: "oczekuje_na_czesc", etykietaAkcji: "Wstrzymaj — czeka na część", role: OBSLUGA },
    { na: "zamknieta", etykietaAkcji: "Zamknij awarię", role: OBSLUGA },
  ],
  oczekuje_na_czesc: [
    { na: "w_naprawie", etykietaAkcji: "Wznów naprawę", role: OBSLUGA },
    { na: "zamknieta", etykietaAkcji: "Zamknij awarię", role: OBSLUGA },
  ],
  zamknieta: [{ na: "w_naprawie", etykietaAkcji: "Otwórz ponownie", role: DECYZJA }],
};

/** Dozwolone kolejne statusy dla danej roli z bieżącego statusu (pusta lista = brak przejść). */
export function dozwolonePrzejscia(
  status: StatusAwarii,
  rola: Rola | null | undefined,
): Przejscie[] {
  if (!rola) return [];
  return PRZEJSCIA[status].filter((p) => p.role.includes(rola));
}

/** Cztery główne kroki osi; „oczekuje_na_czesc" to bocznik pokazywany jako odznaka na kroku „w_naprawie". */
export const OS_GLOWNA: readonly StatusAwarii[] = [
  "zgloszona",
  "przyjeta",
  "w_naprawie",
  "zamknieta",
];

export function indeksNaOsi(status: StatusAwarii): number {
  const s = status === "oczekuje_na_czesc" ? "w_naprawie" : status;
  return OS_GLOWNA.indexOf(s);
}

/** Zwierciadło reguły z triggera: tylko przejście NA „zamknieta" wymaga przyczyny i czasu przestoju. */
export function wymagaDanychZamkniecia(naStatus: StatusAwarii): boolean {
  return naStatus === "zamknieta";
}
