export const ROLE = ["pracownik", "technik", "kierownik", "admin"] as const;
export type Rola = (typeof ROLE)[number];

export const ETYKIETY_ROL: Record<Rola, string> = {
  pracownik: "Pracownik",
  technik: "Technik",
  kierownik: "Kierownik",
  admin: "Administrator",
};

export function czyRola(rola: Rola | null | undefined, dozwolone: readonly Rola[]): boolean {
  return rola != null && dozwolone.includes(rola);
}

export type Sciezka =
  "/" | "/awarie" | "/zadania" | "/dashboard" | "/eksport" | "/admin/uzytkownicy";
export type IkonaNawigacji = "zglos" | "lista" | "zadania" | "analizy" | "eksport" | "admin";
export type PozycjaNawigacji = {
  to: Sciezka;
  label: string;
  ikona: IkonaNawigacji;
  glowna: boolean;
};

const poz = (to: Sciezka, label: string, ikona: IkonaNawigacji): PozycjaNawigacji => ({
  to,
  label,
  ikona,
  glowna: false,
});

const ZGLOS: PozycjaNawigacji = {
  to: "/",
  label: "Zgłoś",
  ikona: "zglos",
  glowna: true,
};

function pozostale(rola: Rola): PozycjaNawigacji[] {
  switch (rola) {
    case "pracownik":
      return [poz("/awarie", "Moje", "lista")];
    case "technik":
      return [poz("/zadania", "Zadania", "zadania"), poz("/awarie", "Awarie", "lista")];
    case "kierownik":
      return [
        poz("/awarie", "Awarie", "lista"),
        poz("/dashboard", "Analizy", "analizy"),
        poz("/eksport", "Eksport", "eksport"),
      ];
    case "admin":
      return [
        poz("/zadania", "Zadania", "zadania"),
        poz("/awarie", "Awarie", "lista"),
        poz("/dashboard", "Analizy", "analizy"),
        poz("/eksport", "Eksport", "eksport"),
        poz("/admin/uzytkownicy", "Admin", "admin"),
      ];
  }
}

/** Przycisk „Zgłoś" trafia w środek paska: na indeks floor(liczba_pozostałych / 2). */
export function pozycjeNawigacji(rola: Rola): PozycjaNawigacji[] {
  const inne = pozostale(rola);
  const indeks = Math.floor(inne.length / 2);
  return [...inne.slice(0, indeks), ZGLOS, ...inne.slice(indeks)];
}
