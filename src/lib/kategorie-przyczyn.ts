/** Słownik kategorii przyczyn awarii (enum `kategoria_przyczyny` w bazie), w kolejności wyświetlania. */
export const KATEGORIE_PRZYCZYN = [
  "mechaniczna",
  "elektryczna",
  "automatyka",
  "media",
  "obsluga",
  "inna",
] as const;

export type KategoriaPrzyczyny = (typeof KATEGORIE_PRZYCZYN)[number];

export const ETYKIETY_KATEGORII: Record<KategoriaPrzyczyny, string> = {
  mechaniczna: "Mechaniczna",
  elektryczna: "Elektryczna",
  automatyka: "Automatyka i sterowanie",
  media: "Media (powietrze, woda, para, HVAC)",
  obsluga: "Błąd obsługi",
  inna: "Inna",
};

/** Krótsze etykiety do wykresów i przycisków. */
export const KROTKIE_ETYKIETY_KATEGORII: Record<KategoriaPrzyczyny, string> = {
  mechaniczna: "Mechaniczna",
  elektryczna: "Elektryczna",
  automatyka: "Automatyka",
  media: "Media",
  obsluga: "Obsługa",
  inna: "Inna",
};

export const BEZ_KATEGORII = "Nie określono";
