import { describe, expect, it } from "vitest";
import { czyAktywna, czyRola, pozycjeNawigacji } from "@/lib/uprawnienia";

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

  it("pracownik: Moje, Zgłoś", () => expect(etykiety("pracownik")).toEqual(["Moje", "Zgłoś"]));
  it("technik: Zadania, Awarie, Zgłoś, Przeglądy", () =>
    expect(etykiety("technik")).toEqual(["Zadania", "Awarie", "Zgłoś", "Przeglądy"]));
  it("kierownik: Analizy zamiast Zadań", () =>
    expect(etykiety("kierownik")).toEqual(["Analizy", "Awarie", "Zgłoś", "Przeglądy"]));
  it("admin: Zgłoś pośrodku pięciu", () =>
    expect(etykiety("admin")).toEqual(["Zadania", "Awarie", "Zgłoś", "Przeglądy", "Admin"]));
  it("dokładnie jedna pozycja główna (Zgłoś)", () => {
    for (const rola of ["pracownik", "technik", "kierownik", "admin"] as const) {
      const glowne = pozycjeNawigacji(rola).filter((p) => p.glowna);
      expect(glowne).toHaveLength(1);
      expect(glowne[0]?.to).toBe("/");
    }
  });
});

describe("czyAktywna", () => {
  const admin = pozycjeNawigacji("admin");
  const pozycja = (label: string) => {
    const p = admin.find((x) => x.label === label);
    if (!p) throw new Error(label);
    return p;
  };

  it("Zgłoś tylko na stronie głównej", () => {
    expect(czyAktywna("/", pozycja("Zgłoś"))).toBe(true);
    expect(czyAktywna("/awarie", pozycja("Zgłoś"))).toBe(false);
  });
  it("Awarie także na karcie awarii", () => {
    expect(czyAktywna("/awarie/abc", pozycja("Awarie"))).toBe(true);
  });
  it("Admin na każdej podstronie /admin", () => {
    expect(czyAktywna("/admin/urzadzenia", pozycja("Admin"))).toBe(true);
    expect(czyAktywna("/administracja", pozycja("Admin"))).toBe(false);
  });
});
