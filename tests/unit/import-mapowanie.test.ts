import { describe, expect, it } from "vitest";
import {
  dataZExcela,
  dopasujKonto,
  mapujAwarie,
  mapujPrzeglad,
  mapujUrzadzenie,
  normalizujNazwisko,
  wierszeNaObiekty,
} from "../../scripts/import/mapowanie.ts";

const KONTA = [
  { id: "k1", imie_nazwisko: "Anna Wiśniewska" },
  { id: "k2", imie_nazwisko: "Jan Kowalski" },
  { id: "k3", imie_nazwisko: "Jan Kowalski" },
];

describe("dataZExcela", () => {
  it("zamienia liczby seryjne Excela na daty z arkuszy", () => {
    expect(dataZExcela(46208)).toBe("2026-07-05");
    expect(dataZExcela(46269)).toBe("2026-09-04");
  });
  it("przyjmuje Date, tekst i puste komórki", () => {
    expect(dataZExcela(new Date(Date.UTC(2026, 6, 5)))).toBe("2026-07-05");
    expect(dataZExcela("2026-07-05")).toBe("2026-07-05");
    expect(dataZExcela(null)).toBeNull();
    expect(dataZExcela("")).toBeNull();
  });
  it("odrzuca nieznany format", () => {
    expect(() => dataZExcela("5 lipca")).toThrow();
  });
});

describe("dopasowanie nazwisk", () => {
  it("ignoruje polskie znaki i wielkość liter", () => {
    expect(normalizujNazwisko(" Anna  WIŚNIEWSKA ")).toBe("anna wisniewska");
    expect(normalizujNazwisko("Łukasz Dąbrowski")).toBe("lukasz dabrowski");
    expect(dopasujKonto("Anna Wisniewska", KONTA)).toBe("k1");
  });
  it("przy braku lub niejednoznaczności zwraca null", () => {
    expect(dopasujKonto("Piotr Nowak", KONTA)).toBeNull();
    expect(dopasujKonto("Jan Kowalski", KONTA)).toBeNull();
    expect(dopasujKonto(null, KONTA)).toBeNull();
  });
});

describe("mapowanie wierszy", () => {
  it("pierwszy wiersz to nagłówki, puste wiersze pomijane", () => {
    const obiekty = wierszeNaObiekty([
      ["Nr_technologiczny", "Nazwa_urzadzenia"],
      ["HVAC-01", "AHU nr 1"],
      [null, ""],
    ]);
    expect(obiekty).toEqual([{ Nr_technologiczny: "HVAC-01", Nazwa_urzadzenia: "AHU nr 1" }]);
  });

  it("urządzenie: status, właściciel i pominięty e-mail", () => {
    const u = mapujUrzadzenie(
      {
        Nr_technologiczny: "DCS-03",
        Nazwa_urzadzenia: "System DCS linia B",
        Wlasciciel: "Anna Wisniewska",
        Email_wlasciciela: "ktos@example.com",
        Status_w_rejestrze: "Proponowane",
      },
      KONTA,
    );
    expect(u.status).toBe("proponowane");
    expect(u.wlasciciel_id).toBe("k1");
    expect(u.wlasciciel_nazwa).toBe("Anna Wisniewska");
    expect(JSON.stringify(u)).not.toContain("example.com");
  });

  it("przegląd: daty i częstotliwość, przegląd do uzupełnienia bez dat", () => {
    const p = mapujPrzeglad({
      Nr_technologiczny: "HVAC-01",
      Typ_czynnosci: "Przeglad okresowy",
      Czestotliwosc_dni: 90,
      Data_ostatniego_przegladu: 46188,
      Data_najblizszego_przegladu: 46269,
    });
    expect(p.data_najblizszego).toBe("2026-09-04");
    expect(p.czestotliwosc_dni).toBe(90);
    const pusty = mapujPrzeglad({ Nr_technologiczny: "SC-07" });
    expect(pusty.data_najblizszego).toBeNull();
    expect(pusty.czestotliwosc_dni).toBeNull();
  });

  it("awaria: numer zachowany, statusy Zamknieta/Otwarta, data w południe UTC", () => {
    const z = mapujAwarie(
      {
        ID_zgloszenia: "AWR-2026-001",
        Nr_technologiczny: "HVAC-01",
        Data_awarii: 46208,
        Status: "Zamknieta",
        Data_zamkniecia: 46208,
        Czas_przestoju_h: 4,
        Osoba_zglaszajaca: "Jan Kowalski",
      },
      KONTA,
    );
    expect(z.numer).toBe("AWR-2026-001");
    expect(z.status).toBe("zamknieta");
    expect(z.data_awarii).toBe("2026-07-05T12:00:00Z");
    expect(z.data_zamkniecia).toBe("2026-07-05T12:00:00Z");
    expect(z.zglaszajacy_id).toBeNull();
    const o = mapujAwarie(
      {
        ID_zgloszenia: "AWR-2026-005",
        Nr_technologiczny: "WFI-02",
        Data_awarii: 46259,
        Status: "Otwarta",
      },
      KONTA,
    );
    expect(o.status).toBe("zgloszona");
    expect(o.data_zamkniecia).toBeNull();
  });
});
