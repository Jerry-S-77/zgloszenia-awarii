import { describe, expect, it } from "vitest";
import { bezFormuly } from "@/lib/csv";
import { mapujStatusUrzadzenia } from "../../scripts/import/mapowanie";

describe("bezFormuly (eksport CSV)", () => {
  it("poprzedza apostrofem tekst, który Excel wykonałby jako formułę", () => {
    for (const t of ['=HYPERLINK("x")', "+1+1", "-2", "@SUM(A1)", "  =1+1", "\tcmd", "\rx"]) {
      expect(bezFormuly(t), JSON.stringify(t)).toBe(`'${t}`);
    }
  });
  it("zwykły tekst zostaje bez zmian", () => {
    for (const t of ["Wyciek oleju", "Filtr H14 = wymiana", "", "12"]) {
      expect(bezFormuly(t)).toBe(t);
    }
  });
});

describe("mapujStatusUrzadzenia (import arkuszy)", () => {
  it("rozpoznaje trzy statusy", () => {
    expect(mapujStatusUrzadzenia("Aktywne")).toBe("aktywne");
    expect(mapujStatusUrzadzenia("proponowane")).toBe("proponowane");
    expect(mapujStatusUrzadzenia("Wycofane")).toBe("wycofane");
  });
  it("nieznany albo pusty status to błąd, nie ciche wycofanie urządzenia", () => {
    expect(() => mapujStatusUrzadzenia("W użyciu")).toThrow("Nieznany status urządzenia");
    expect(() => mapujStatusUrzadzenia("")).toThrow("Nieznany status urządzenia");
  });
});
