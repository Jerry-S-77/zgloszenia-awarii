import { describe, expect, it } from "vitest";
import { czyRola, pozycjeNawigacji } from "@/lib/uprawnienia";

describe("czyRola", () => {
  it("zwraca true, gdy rola jest na liście", () => {
    expect(czyRola("admin", ["kierownik", "admin"])).toBe(true);
  });
  it("zwraca false dla roli spoza listy", () => {
    expect(czyRola("technik", ["kierownik", "admin"])).toBe(false);
  });
  it("zwraca false, gdy nie ma roli", () => {
    expect(czyRola(null, ["admin"])).toBe(false);
    expect(czyRola(undefined, ["admin"])).toBe(false);
  });
});

describe("pozycjeNawigacji", () => {
  const etykiety = (r: Parameters<typeof pozycjeNawigacji>[0]) =>
    pozycjeNawigacji(r).map((p) => p.label);

  it("pracownik: Zgłoś i Moje", () => expect(etykiety("pracownik")).toEqual(["Zgłoś", "Moje"]));
  it("technik: Zadania, Zgłoś i Awarie", () =>
    expect(etykiety("technik")).toEqual(["Zadania", "Zgłoś", "Awarie"]));
  it("kierownik: Zgłoś jest drugi z czterech", () => {
    expect(etykiety("kierownik")).toEqual(["Awarie", "Zgłoś", "Analizy", "Eksport"]);
  });
  it("admin: Zgłoś pośrodku sześciu", () => {
    expect(etykiety("admin")).toEqual([
      "Zadania",
      "Awarie",
      "Zgłoś",
      "Analizy",
      "Eksport",
      "Admin",
    ]);
  });
  it("dokładnie jedna pozycja główna (Zgłoś)", () => {
    for (const rola of ["pracownik", "technik", "kierownik", "admin"] as const) {
      const glowne = pozycjeNawigacji(rola).filter((p) => p.glowna);
      expect(glowne).toHaveLength(1);
      expect(glowne[0]?.to).toBe("/");
    }
  });
});
