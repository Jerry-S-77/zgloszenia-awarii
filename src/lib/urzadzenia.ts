import { z } from "zod";

export const STATUSY_URZADZEN = ["proponowane", "aktywne", "wycofane"] as const;
export type StatusUrzadzenia = (typeof STATUSY_URZADZEN)[number];

export const ETYKIETY_STATUSU_URZADZENIA: Record<StatusUrzadzenia, string> = {
  proponowane: "Proponowane",
  aktywne: "Aktywne",
  wycofane: "Wycofane",
};

export type AkcjaStatusu = { na: StatusUrzadzenia; etykieta: string };

/** Zmiany statusu dostępne adminowi (baza i tak sprawdza rolę). */
export function akcjeStatusu(status: StatusUrzadzenia): AkcjaStatusu[] {
  switch (status) {
    case "proponowane":
      return [
        { na: "aktywne", etykieta: "Aktywuj urządzenie" },
        { na: "wycofane", etykieta: "Wycofaj" },
      ];
    case "aktywne":
      return [{ na: "wycofane", etykieta: "Wycofaj z użycia" }];
    case "wycofane":
      return [{ na: "aktywne", etykieta: "Przywróć do użycia" }];
  }
}

export const KRYTYCZNOSCI = ["Niska", "Srednia", "Wysoka"] as const;
export type Krytycznosc = (typeof KRYTYCZNOSCI)[number];

/** „wysoka", „Średnia ", „NISKA" → wartość słownikowa; nieznana wartość → null (dane z arkuszy bywają różne). */
export function normalizujKrytycznosc(v: string | null | undefined): Krytycznosc | null {
  const klucz = (v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return KRYTYCZNOSCI.find((k) => k.toLowerCase() === klucz) ?? null;
}

const opcjonalnyTekst = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Najwyżej ${max} znaków.`)
    .transform((s) => (s === "" ? null : s));

export const urzadzenieSchema = z.object({
  nr_technologiczny: z
    .string()
    .trim()
    .min(1, "Podaj numer technologiczny.")
    .max(40, "Numer technologiczny może mieć najwyżej 40 znaków.")
    .regex(/^[A-Za-z0-9._-]+$/, "Numer: litery, cyfry, kropka, myślnik lub podkreślenie."),
  nazwa_urzadzenia: z
    .string()
    .trim()
    .min(2, "Podaj nazwę urządzenia.")
    .max(300, "Nazwa może mieć najwyżej 300 znaków."),
  kategoria: opcjonalnyTekst(200),
  lokalizacja: opcjonalnyTekst(300),
  krytycznosc: z.enum(KRYTYCZNOSCI),
  wlasciciel_id: z.string().uuid().nullable(),
  uwagi: opcjonalnyTekst(2000),
});

export type DaneUrzadzenia = z.infer<typeof urzadzenieSchema>;
