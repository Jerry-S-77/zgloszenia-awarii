import { describe, expect, it } from "vitest";
import { dozwolonePrzejscia, indeksNaOsi, OS_GLOWNA, wymagaDanychZamkniecia } from "@/lib/statusy-awarii";

describe("dozwolonePrzejscia", () => {
  it("technik ze zgłoszonej: przyjmij albo zamknij", () => {
    const cele = dozwolonePrzejscia("zgloszona", "technik").map((p) => p.na);
    expect(cele).toEqual(["przyjeta", "zamknieta"]);
  });
  it("pracownik nie ma żadnego przejścia", () => {
    expect(dozwolonePrzejscia("zgloszona", "pracownik")).toEqual([]);
  });
  it("brak roli: brak przejść", () => {
    expect(dozwolonePrzejscia("zgloszona", null)).toEqual([]);
    expect(dozwolonePrzejscia("zgloszona", undefined)).toEqual([]);
  });
  it("w_naprawie i oczekuje_na_czesc są wzajemne", () => {
    expect(dozwolonePrzejscia("w_naprawie", "technik").map((p) => p.na)).toContain("oczekuje_na_czesc");
    expect(dozwolonePrzejscia("oczekuje_na_czesc", "technik").map((p) => p.na)).toContain("w_naprawie");
  });
  it("z zamkniętej wychodzi tylko ponowne otwarcie, tylko dla kierownika i admina", () => {
    expect(dozwolonePrzejscia("zamknieta", "technik")).toEqual([]);
    const cele = dozwolonePrzejscia("zamknieta", "kierownik").map((p) => p.na);
    expect(cele).toEqual(["w_naprawie"]);
    expect(dozwolonePrzejscia("zamknieta", "admin").map((p) => p.na)).toEqual(["w_naprawie"]);
  });
});

describe("indeksNaOsi", () => {
  it("cztery główne kroki w kolejności", () => {
    expect(OS_GLOWNA).toEqual(["zgloszona", "przyjeta", "w_naprawie", "zamknieta"]);
    expect(indeksNaOsi("zgloszona")).toBe(0);
    expect(indeksNaOsi("przyjeta")).toBe(1);
    expect(indeksNaOsi("w_naprawie")).toBe(2);
    expect(indeksNaOsi("zamknieta")).toBe(3);
  });
  it("oczekuje_na_czesc dzieli pozycję z w_naprawie (bocznik na osi)", () => {
    expect(indeksNaOsi("oczekuje_na_czesc")).toBe(indeksNaOsi("w_naprawie"));
  });
});

describe("wymagaDanychZamkniecia", () => {
  it("tylko przejście na 'zamknieta' wymaga przyczyny i czasu przestoju", () => {
    expect(wymagaDanychZamkniecia("zamknieta")).toBe(true);
    expect(wymagaDanychZamkniecia("przyjeta")).toBe(false);
    expect(wymagaDanychZamkniecia("w_naprawie")).toBe(false);
  });
});
