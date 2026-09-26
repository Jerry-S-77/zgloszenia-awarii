import { describe, expect, it } from "vitest";
import { klasyfikujOdrzucenie, oczyscPrzestarzalePola } from "@/lib/offline";

describe("klasyfikujOdrzucenie", () => {
  it("błąd bez kodu (sieć) przerywa kolejkę", () => {
    expect(klasyfikujOdrzucenie({ message: "Failed to fetch" })).toBe("siec");
  });
  it("błąd z kodem Postgresa (np. z triggera przejść) to konflikt biznesowy", () => {
    expect(klasyfikujOdrzucenie({ code: "P0001", message: "Niedozwolone przejście" })).toBe(
      "biznesowy",
    );
  });
  it("brak błędu (zero zmienionych wierszy, np. nieaktualna wersja) to konflikt biznesowy", () => {
    expect(klasyfikujOdrzucenie(null)).toBe("biznesowy");
  });
});

describe("oczyscPrzestarzalePola (kolejka sprzed etapu 3b)", () => {
  it("zdejmuje usuniętą kolumnę z zapisu zgłoszenia", () => {
    const { pola, dawnePrzypisanie } = oczyscPrzestarzalePola(
      { opis_awarii: "x", przypisany_technik_id: null },
      undefined,
    );
    expect(pola).toEqual({ opis_awarii: "x" });
    expect(dawnePrzypisanie).toBeNull();
  });
  it("stare „Przypisz do mnie” staje się podbiciem wersji i dołączeniem do zespołu", () => {
    const { pola, dawnePrzypisanie } = oczyscPrzestarzalePola({ przypisany_technik_id: "u1" }, 3);
    expect(pola).toEqual({ wersja: 3 });
    expect(dawnePrzypisanie).toBe("u1");
  });
  it("zwykła zmiana statusu przechodzi bez zmian", () => {
    const { pola } = oczyscPrzestarzalePola({ status: "przyjeta" }, 2);
    expect(pola).toEqual({ status: "przyjeta" });
  });
});
