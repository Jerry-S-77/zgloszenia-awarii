import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapujWiersze, parsujCsv } from "@/lib/magazyn-import";

describe("parsujCsv", () => {
  it("rozpoznaje średnik, cudzysłowy i BOM; pomija puste wiersze", () => {
    expect(parsujCsv('﻿a;b\r\n"x;1";"y ""z"""\r\n\r\n')).toEqual([
      ["a", "b"],
      ["x;1", 'y "z"'],
    ]);
  });
  it('cudzysłów w środku pola (np. cale: 10") jest zwykłym znakiem i nie scala wierszy', () => {
    expect(parsujCsv('a;b\nWkład 10";szt.\nZawór 3/4";szt.\n')).toEqual([
      ["a", "b"],
      ['Wkład 10"', "szt."],
      ['Zawór 3/4"', "szt."],
    ]);
  });
  it("rozpoznaje przecinek, gdy w nagłówku nie ma średników", () => {
    expect(parsujCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("mapujWiersze", () => {
  it("wzorcowy plik z aplikacji importuje się bez błędów", () => {
    const wynik = mapujWiersze(
      parsujCsv(readFileSync("public/wzory/wzor-importu-magazynu.csv", "utf8")),
    );
    expect(wynik.bledy).toEqual([]);
    expect(wynik.wiersze[0]).toEqual({
      numer_katalogowy: "HEPA-H14-610",
      nazwa: "Filtr HEPA H14 610x610x292",
      jednostka: "szt.",
      stan_minimalny: 2,
      stan_poczatkowy: 4,
      lokalizacja: "Magazyn A, regał 3",
      urzadzenia: ["HVAC-01", "HVAC-02"],
      krytyczna: true,
    });
    expect(wynik.wiersze[1]?.krytyczna).toBe(false);
  });

  it("kolejność kolumn dowolna, przecinek dziesiętny, puste pola opcjonalne", () => {
    const wynik = mapujWiersze([
      ["Nazwa", "Numer katalogowy", "Stan minimalny"],
      ["Kabel", "K-1", "2,5"],
    ]);
    expect(wynik.wiersze).toEqual([
      {
        numer_katalogowy: "K-1",
        nazwa: "Kabel",
        stan_minimalny: 2.5,
        urzadzenia: [],
        krytyczna: false,
      },
    ]);
  });

  it("zgłasza brak wymaganych kolumn, puste pola, złe liczby i powtórzone numery", () => {
    expect(mapujWiersze([["nazwa"], ["x"]]).bledy).toEqual([
      "Brak kolumny „numer_katalogowy” w nagłówku.",
    ]);
    const wynik = mapujWiersze([
      ["numer_katalogowy", "nazwa", "stan_poczatkowy"],
      ["A", "", ""],
      ["B", "Część", "-1"],
      ["C", "Część", "1"],
      ["C", "Część", "1"],
    ]);
    expect(wynik.bledy).toEqual([
      "Wiersz 2: numer katalogowy i nazwa są wymagane.",
      "Wiersz 3: stany muszą być liczbami nieujemnymi.",
      "Wiersz 5: numer C powtarza się w pliku.",
    ]);
    expect(wynik.wiersze.map((w) => w.numer_katalogowy)).toEqual(["C"]);
  });
});
