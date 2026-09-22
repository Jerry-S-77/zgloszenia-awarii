import { describe, expect, it } from "vitest";
import { zdalneLubZCache } from "@/lib/awarie-cache";
import type { AwariaLokalna } from "@/lib/types";

const awaria = (id: string, dodatki: Partial<AwariaLokalna> = {}): AwariaLokalna => ({
  id,
  nr_technologiczny: "HVAC-01",
  nazwa_urzadzenia: "AHU",
  data_awarii: "2026-09-21T10:00:00.000Z",
  opis_awarii: id,
  przyczyna: null,
  czas_przestoju_h: null,
  krytycznosc_skutku: "Niska",
  zglaszajacy_id: null,
  zglaszajacy_nazwa: null,
  status: "zgloszona",
  data_zamkniecia: null,
  numer: "AWR-2026-001",
  wersja: 1,
  przypisany_technik_id: null,
  ...dodatki,
});

describe("zdalneLubZCache", () => {
  it("udane pobranie ma pierwszeństwo, także puste", () => {
    const pobrane = [awaria("a")];
    expect(zdalneLubZCache(pobrane, [awaria("b")])).toBe(pobrane);
    expect(zdalneLubZCache([], [awaria("b")])).toEqual([]);
  });
  it("nieudane pobranie: wiersze z poprzedniego pobrania, bez znacznika _pending", () => {
    const wynik = zdalneLubZCache(null, [awaria("a"), awaria("b", { _pending: true })]);
    expect(wynik.map((r) => r.id)).toEqual(["a", "b"]);
    expect(wynik.every((r) => r._pending === undefined)).toBe(true);
  });
  it("nieudane pobranie i brak pamięci: pusta lista", () => {
    expect(zdalneLubZCache(null, undefined)).toEqual([]);
  });
});
