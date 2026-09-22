import { describe, expect, it } from "vitest";
import { klasyfikujOdrzucenie } from "@/lib/offline";

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
