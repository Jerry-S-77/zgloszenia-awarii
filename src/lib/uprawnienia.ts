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
  | "/"
  | "/awarie"
  | "/zadania"
  | "/przeglady"
  | "/dashboard"
  | "/eksport"
  | "/admin/uzytkownicy"
  | "/admin/urzadzenia";
export type IkonaNawigacji =
  "zglos" | "lista" | "zadania" | "przeglady" | "analizy" | "eksport" | "admin";
export type PozycjaNawigacji = {
  to: Sciezka;
  label: string;
  ikona: IkonaNawigacji;
  glowna: boolean;
  /** Pozycja jest aktywna dla każdej ścieżki pod tym prefiksem (domyślnie: `to`). */
  prefiks?: string;
};

const poz = (
  to: Sciezka,
  label: string,
  ikona: IkonaNawigacji,
  prefiks?: string,
): PozycjaNawigacji => ({ to, label, ikona, glowna: false, ...(prefiks ? { prefiks } : {}) });

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
      return [
        poz("/zadania", "Zadania", "zadania"),
        poz("/awarie", "Awarie", "lista"),
        poz("/przeglady", "Przeglądy", "przeglady"),
      ];
    case "kierownik":
      return [
        poz("/dashboard", "Analizy", "analizy"),
        poz("/awarie", "Awarie", "lista"),
        poz("/przeglady", "Przeglądy", "przeglady"),
      ];
    case "admin":
      return [
        poz("/zadania", "Zadania", "zadania"),
        poz("/awarie", "Awarie", "lista"),
        poz("/przeglady", "Przeglądy", "przeglady"),
        poz("/admin/uzytkownicy", "Admin", "admin", "/admin"),
      ];
  }
}

/** Przycisk „Zgłoś" trafia w środek paska: na indeks ceil(liczba_pozostałych / 2). */
export function pozycjeNawigacji(rola: Rola): PozycjaNawigacji[] {
  const inne = pozostale(rola);
  const indeks = Math.ceil(inne.length / 2);
  return [...inne.slice(0, indeks), ZGLOS, ...inne.slice(indeks)];
}

/** Czy pozycja paska jest aktywna na danej ścieżce („/" tylko dokładnie, reszta z podstronami). */
export function czyAktywna(pathname: string, pozycja: PozycjaNawigacji): boolean {
  const baza = pozycja.prefiks ?? pozycja.to;
  if (baza === "/") return pathname === "/";
  return pathname === baza || pathname.startsWith(`${baza}/`);
}
