import { describe, expect, it } from "vitest";
import {
  bladWynikow,
  doZapisu,
  oczyscPunkty,
  odczytajWyniki,
  pusteWyniki,
} from "@/lib/lista-kontrolna";

describe("wyniki listy kontrolnej", () => {
  it("wymaga oceny każdego punktu i opisu nieprawidłowości", () => {
    const w = pusteWyniki(["Filtr", "Ciśnienie"]);
    expect(bladWynikow(w)).toBe("Oceń punkt: Filtr");
    w[0] = { tresc: "Filtr", wynik: "nok", uwaga: "  " };
    w[1] = { tresc: "Ciśnienie", wynik: "ok", uwaga: "" };
    expect(bladWynikow(w)).toBe("Opisz nieprawidłowość: Filtr");
    w[0] = { tresc: "Filtr", wynik: "nok", uwaga: " zatkany " };
    expect(bladWynikow(w)).toBeNull();
    expect(doZapisu(w)).toEqual([
      { tresc: "Filtr", wynik: "nok", uwaga: "zatkany" },
      { tresc: "Ciśnienie", wynik: "ok", uwaga: null },
    ]);
  });
});

describe("punkty harmonogramu", () => {
  it("obcina spacje i pomija puste; pilnuje limitów", () => {
    expect(oczyscPunkty([" A ", "", "B"])).toEqual({ punkty: ["A", "B"], blad: null });
    expect(oczyscPunkty(Array.from({ length: 31 }, (_, i) => `P${i}`)).blad).toContain("30");
    expect(oczyscPunkty(["x".repeat(201)]).blad).toContain("200");
  });
});

it("odczyt zapisanych wyników pomija wpisy o złym kształcie", () => {
  expect(
    odczytajWyniki([{ tresc: "A", wynik: "ok", uwaga: null }, { tresc: "B", wynik: "zle" }, null]),
  ).toEqual([{ tresc: "A", wynik: "ok", uwaga: null }]);
  expect(odczytajWyniki("nie tablica")).toEqual([]);
});
