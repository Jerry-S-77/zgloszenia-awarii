import { describe, expect, it } from "vitest";
import { czyDuplikat } from "@/lib/kolejka-bledy";

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
