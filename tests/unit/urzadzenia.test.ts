import { describe, expect, it } from "vitest";
import { akcjeStatusu, urzadzenieSchema } from "@/lib/urzadzenia";

describe("akcjeStatusu", () => {
  it("proponowane można aktywować albo wycofać", () => {
    expect(akcjeStatusu("proponowane").map((a) => a.na)).toEqual(["aktywne", "wycofane"]);
  });
  it("aktywne można tylko wycofać, wycofane tylko przywrócić", () => {
    expect(akcjeStatusu("aktywne").map((a) => a.na)).toEqual(["wycofane"]);
    expect(akcjeStatusu("wycofane").map((a) => a.na)).toEqual(["aktywne"]);
  });
});

describe("urzadzenieSchema", () => {
  const poprawne = {
    nr_technologiczny: " HVAC-07 ",
    nazwa_urzadzenia: "AHU nr 7",
    kategoria: "",
    lokalizacja: "Hala A",
    krytycznosc: "Wysoka",
    wlasciciel_id: null,
    uwagi: "",
  };

  it("przycina tekst i zamienia puste pola na null", () => {
    const wynik = urzadzenieSchema.parse(poprawne);
    expect(wynik.nr_technologiczny).toBe("HVAC-07");
    expect(wynik.kategoria).toBeNull();
    expect(wynik.uwagi).toBeNull();
  });
  it("odrzuca numer ze spacją i brak nazwy", () => {
    expect(urzadzenieSchema.safeParse({ ...poprawne, nr_technologiczny: "HVAC 07" }).success).toBe(false);
    expect(urzadzenieSchema.safeParse({ ...poprawne, nazwa_urzadzenia: " " }).success).toBe(false);
  });
  it("odrzuca nieznaną krytyczność", () => {
    expect(urzadzenieSchema.safeParse({ ...poprawne, krytycznosc: "Bardzo wysoka" }).success).toBe(false);
  });
});
