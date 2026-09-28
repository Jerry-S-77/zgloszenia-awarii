import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BladPliku, data, dwaMiejsca, kluczTekstu, parsujCsv, tabela } from "@/lib/import-plik";
import { mapujDostawe, mapujInwentaryzacje } from "@/lib/magazyn-import";
import { mapujPrzeglady, rozdzielListe } from "@/lib/przeglady-import";
import { mapujUrzadzenia } from "@/lib/urzadzenia-import";

const wzor = (plik: string) => parsujCsv(readFileSync(`public/wzory/${plik}`, "utf8"));

describe("wspólne narzędzia importu", () => {
  it("nagłówek bez względu na wielkość liter i spacje; brak wymaganych kolumn to błąd", () => {
    const { tabela: t, bledy } = tabela(
      [
        [" Numer Katalogowy ", "ILOSC"],
        ["A", "2"],
      ],
      ["numer_katalogowy", "ilosc"],
    );
    expect(bledy).toEqual([]);
    expect(t.tekst(t.dane[0]!, "numer_katalogowy")).toBe("A");
    expect(tabela([["x"]], ["ilosc"]).bledy).toEqual(["Brak kolumny „ilosc” w nagłówku."]);
    expect(tabela([], ["ilosc"]).bledy).toEqual(["Plik jest pusty."]);
  });

  it("daty: ISO, polski zapis, Date z XLSX i numer seryjny Excela; błędne → null, puste → undefined", () => {
    expect(data("2026-06-15")).toBe("2026-06-15");
    expect(data("5.7.2026")).toBe("2026-07-05");
    expect(data(new Date(Date.UTC(2026, 5, 15)))).toBe("2026-06-15");
    expect(data(46188)).toBe("2026-06-15");
    expect(data("31.02.2026")).toBeNull();
    expect(data("jutro")).toBeNull();
    expect(data("")).toBeUndefined();
    expect(data(null)).toBeUndefined();
  });

  it("klucz tekstu pomija wielkość liter, polskie znaki i nadmiar spacji", () => {
    expect(kluczTekstu("  Przegląd   okresowy ")).toBe("przeglad okresowy");
    expect(kluczTekstu("PRZEGLAD OKRESOWY")).toBe("przeglad okresowy");
    expect(kluczTekstu("Łożyska")).toBe("lozyska");
  });
});

describe("parser i liczby", () => {
  it("niedomknięty cudzysłów w CSV to błąd pliku, a nie sklejone wiersze", () => {
    expect(() => parsujCsv('a;b\n"x;1\ny;2\n')).toThrow(BladPliku);
  });

  it("najwyżej 2 miejsca po przecinku (jak numeric(12,2) w bazie)", () => {
    expect(dwaMiejsca(1.25)).toBe(true);
    expect(dwaMiejsca(0.1 + 0.2)).toBe(true);
    expect(dwaMiejsca(0.001)).toBe(false);
  });

  it("liczba z XLSX z błędem zmiennoprzecinkowym trafia do bazy jako 2 miejsca", () => {
    const wynik = mapujDostawe([
      ["numer_katalogowy", "ilosc"],
      ["SPZ-1250", 0.1 + 0.2],
    ]);
    expect(wynik.wiersze).toEqual([{ numer_katalogowy: "SPZ-1250", ilosc: 0.3 }]);
  });
});

describe("import urządzeń", () => {
  it("wzorcowy plik importuje się bez błędów", () => {
    const wynik = mapujUrzadzenia(wzor("wzor-importu-urzadzen.csv"), new Set());
    expect(wynik.bledy).toEqual([]);
    expect(wynik.wiersze[0]).toEqual({
      nr_technologiczny: "HVAC-07",
      nazwa_urzadzenia: "Centrala wentylacyjna AHU nr 7",
      kategoria: "HVAC",
      lokalizacja: "Hala A",
      krytycznosc: "Wysoka",
      status: "aktywne",
    });
    expect(wynik.wiersze[2]?.status).toBeUndefined();
  });

  it("normalizuje krytyczność i status, sprawdza numer, nazwę, konto właściciela i powtórzenia", () => {
    const wynik = mapujUrzadzenia(
      [
        ["nr_technologiczny", "nazwa_urzadzenia", "krytycznosc", "status", "wlasciciel_email"],
        ["A-1", "Pompa", "średnia", "Aktywny", "Jan@Firma.pl"],
        ["B 2", "Zły numer", "Niska", "", ""],
        ["C-3", "Nowe bez krytyczności", "", "", ""],
        ["ISTNIEJE", "Aktualizacja bez krytyczności", "", "", ""],
        ["D-4", "Zła krytyczność", "pilna", "", ""],
        ["E-5", "Nieznane konto", "Niska", "", "ktos@firma.pl"],
        ["A-1", "Powtórka", "Niska", "", ""],
        ["F-6", "Zły status", "Niska", "zepsute", ""],
      ],
      new Set(["ISTNIEJE"]),
      new Set(["jan@firma.pl"]),
    );
    expect(wynik.wiersze).toEqual([
      {
        nr_technologiczny: "A-1",
        nazwa_urzadzenia: "Pompa",
        krytycznosc: "Srednia",
        status: "aktywne",
        wlasciciel_email: "jan@firma.pl",
      },
      { nr_technologiczny: "ISTNIEJE", nazwa_urzadzenia: "Aktualizacja bez krytyczności" },
    ]);
    expect(wynik.bledy).toEqual([
      "Wiersz 3: numer technologiczny — do 40 znaków: litery, cyfry, kropka, myślnik, podkreślenie.",
      "Wiersz 4: nowe urządzenie wymaga krytyczności.",
      "Wiersz 6: krytyczność to Niska, Średnia albo Wysoka.",
      "Wiersz 7: nie ma konta ktos@firma.pl (właściciel).",
      "Wiersz 8: numer A-1 powtarza się w pliku.",
      "Wiersz 9: status to proponowane, aktywne albo wycofane.",
    ]);
  });
});

describe("import harmonogramu przeglądów", () => {
  const dzis = "2026-09-28";

  it("wzorcowy plik: następny termin = ostatni + częstotliwość, lista kontrolna z „|”", () => {
    const wynik = mapujPrzeglady(wzor("wzor-importu-przegladow.csv"), dzis);
    expect(wynik.bledy).toEqual([]);
    expect(wynik.wiersze[0]).toEqual({
      nr_technologiczny: "HVAC-01",
      typ_czynnosci: "Przegląd okresowy",
      czestotliwosc_dni: 90,
      data_ostatniego: "2026-06-15",
      data_najblizszego: "2026-09-13",
      wykonawca: "Serwis wewnętrzny",
      lista_kontrolna: [
        "Filtr wstępny",
        "Filtr HEPA - spadek ciśnienia",
        "Pasek klinowy",
        "Łożyska wentylatora",
      ],
    });
    expect(wynik.wiersze[1]?.data_ostatniego).toBe("2026-07-20");
  });

  it("podana data najbliższego ma pierwszeństwo; puste pola opcjonalne", () => {
    const wynik = mapujPrzeglady(
      [
        [
          "nr_technologiczny",
          "typ_czynnosci",
          "czestotliwosc_dni",
          "data_ostatniego",
          "data_najblizszego",
        ],
        ["X-1", "Kontrola", "30", "2026-09-01", "2026-09-20"],
        ["X-1", "Inna", "", "", ""],
      ],
      dzis,
    );
    expect(wynik.bledy).toEqual([]);
    expect(wynik.wiersze[0]?.data_najblizszego).toBe("2026-09-20");
    expect(wynik.wiersze[1]).toEqual({ nr_technologiczny: "X-1", typ_czynnosci: "Inna" });
  });

  it("zgłasza nieznane urządzenie, powtórkę (także z innymi znakami), złe liczby i daty", () => {
    const wynik = mapujPrzeglady(
      [
        [
          "nr_technologiczny",
          "typ_czynnosci",
          "czestotliwosc_dni",
          "data_ostatniego",
          "lista_kontrolna",
        ],
        ["NIE-MA", "Kontrola", "", "", ""],
        ["X-1", "Przegląd okresowy", "", "", ""],
        ["X-1", "PRZEGLAD  okresowy", "", "", ""],
        ["X-1", "Zła częstotliwość", "1,5", "", ""],
        ["X-1", "Z przyszłości", "", "2026-10-01", ""],
        ["X-1", "Zła data", "", "wczoraj", ""],
        ["X-1", "", "", "", ""],
        ["X-1", "Za długa lista", "", "", Array.from({ length: 31 }, (_, i) => `p${i}`).join("|")],
      ],
      dzis,
      new Set(["X-1"]),
    );
    expect(wynik.wiersze.map((w) => w.typ_czynnosci)).toEqual(["Przegląd okresowy"]);
    expect(wynik.bledy).toEqual([
      "Wiersz 2: nie ma urządzenia NIE-MA.",
      "Wiersz 4: przegląd X-1 („PRZEGLAD  okresowy”) powtarza się w pliku.",
      "Wiersz 5: częstotliwość to liczba całkowita 1–3650 dni.",
      "Wiersz 6: data ostatniego przeglądu nie może być z przyszłości.",
      "Wiersz 7: datę wpisz jako RRRR-MM-DD albo DD.MM.RRRR.",
      "Wiersz 8: typ czynności jest wymagany (do 200 znaków).",
      "Wiersz 9: lista kontrolna — najwyżej 30 punktów po 200 znaków.",
    ]);
  });

  it("rozdziela listę kontrolną i pomija puste punkty", () => {
    expect(rozdzielListe(" a | b||c ")).toEqual(["a", "b", "c"]);
    expect(rozdzielListe("")).toEqual([]);
  });
});

describe("inwentaryzacja i dostawa", () => {
  const katalog = new Set(["HEPA-H14-610", "SPZ-1250"]);

  it("wzorcowe pliki importują się bez błędów", () => {
    expect(mapujInwentaryzacje(wzor("wzor-inwentaryzacji.csv"), katalog)).toEqual({
      wiersze: [
        { numer_katalogowy: "HEPA-H14-610", stan_faktyczny: 4 },
        {
          numer_katalogowy: "SPZ-1250",
          stan_faktyczny: 5,
          uwagi: "jeden uszkodzony, zutylizowany",
        },
      ],
      bledy: [],
    });
    expect(mapujDostawe(wzor("wzor-dostawy.csv"), katalog)).toEqual({
      wiersze: [
        { numer_katalogowy: "HEPA-H14-610", ilosc: 2, dokument: "FV 123/2026" },
        { numer_katalogowy: "SPZ-1250", ilosc: 4, dokument: "FV 123/2026" },
      ],
      bledy: [],
    });
  });

  it("inwentaryzacja: nieznana część, powtórka, brak stanu; zero jest poprawne", () => {
    const wynik = mapujInwentaryzacje(
      [
        ["numer_katalogowy", "stan_faktyczny"],
        ["HEPA-H14-610", "0"],
        ["NIE-MA", "1"],
        ["HEPA-H14-610", "2"],
        ["SPZ-1250", ""],
        ["SPZ-1250", "-1"],
      ],
      katalog,
    );
    expect(wynik.wiersze).toEqual([{ numer_katalogowy: "HEPA-H14-610", stan_faktyczny: 0 }]);
    expect(wynik.bledy).toEqual([
      "Wiersz 3: nie ma w magazynie części NIE-MA.",
      "Wiersz 4: część HEPA-H14-610 powtarza się w pliku.",
      "Wiersz 5: stan faktyczny musi być liczbą nieujemną (najwyżej 2 miejsca po przecinku).",
      // Wiersz 5 był błędny, ale numer już padł — kolejny wiersz tej części to powtórka.
      "Wiersz 6: część SPZ-1250 powtarza się w pliku.",
    ]);
  });

  it("dostawa: ta sama część może wystąpić kilka razy; ilość musi być dodatnia", () => {
    const wynik = mapujDostawe(
      [
        ["numer_katalogowy", "ilosc"],
        ["SPZ-1250", "1,5"],
        ["SPZ-1250", "2"],
        ["SPZ-1250", "0"],
        ["NIE-MA", "1"],
        ["SPZ-1250", "0,001"],
      ],
      katalog,
    );
    expect(wynik.wiersze.map((w) => w.ilosc)).toEqual([1.5, 2]);
    expect(wynik.bledy).toEqual([
      "Wiersz 4: ilość od 0,01 do 100000 (najwyżej 2 miejsca po przecinku).",
      "Wiersz 5: nie ma w magazynie części NIE-MA.",
      "Wiersz 6: ilość od 0,01 do 100000 (najwyżej 2 miejsca po przecinku).",
    ]);
  });
});
