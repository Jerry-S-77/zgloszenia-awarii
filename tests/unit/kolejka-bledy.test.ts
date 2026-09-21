import { describe, expect, it } from "vitest";
import { czyBladSieci, czyDuplikat } from "@/lib/kolejka-bledy";

describe("czyDuplikat", () => {
  it("rozpoznaje naruszenie unikalności Postgresa (23505)", () => {
    expect(czyDuplikat({ code: "23505" })).toBe(true);
  });
  it("inne błędy i brak błędu to nie duplikat", () => {
    expect(czyDuplikat({ code: "42501" })).toBe(false);
    expect(czyDuplikat(null)).toBe(false);
    expect(czyDuplikat(undefined)).toBe(false);
  });
});

describe("czyBladSieci", () => {
  it("błąd bez kodu to problem z siecią", () => {
    expect(czyBladSieci({ message: "coś poszło nie tak" })).toBe(true);
  });
  it("komunikat o nieudanym pobraniu to problem z siecią", () => {
    expect(czyBladSieci({ message: "TypeError: Failed to fetch" })).toBe(true);
    expect(czyBladSieci({ code: undefined, message: "Load failed" })).toBe(true);
  });
  it("błędy z kodem Postgresa/PostgREST to nie problem z siecią", () => {
    expect(czyBladSieci({ code: "42501" })).toBe(false);
    expect(czyBladSieci({ code: "23514" })).toBe(false);
    expect(czyBladSieci({ code: "PGRST301", message: "JWT expired" })).toBe(false);
  });
  it("kod ma pierwszeństwo nad komunikatem tylko gdy komunikat nie wskazuje sieci", () => {
    expect(czyBladSieci({ code: "42501", message: "permission denied" })).toBe(false);
  });
  it("brak błędu to nie problem z siecią", () => {
    expect(czyBladSieci(null)).toBe(false);
    expect(czyBladSieci(undefined)).toBe(false);
  });
});
