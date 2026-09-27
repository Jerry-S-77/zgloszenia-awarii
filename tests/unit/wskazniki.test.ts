import { describe, expect, it } from "vitest";
import {
  formatujCzas,
  okresOstatnichDni,
  pareto,
  wskazniki,
  wskaznikiUrzadzen,
  type AwariaDoWskaznikow,
} from "@/lib/wskazniki";

const TERAZ = new Date("2026-09-27T12:00:00Z");
const OKRES_10_DNI = okresOstatnichDni(10, TERAZ); // 240 h

function awaria(p: Partial<AwariaDoWskaznikow> & { dniTemu: number }): AwariaDoWskaznikow {
  return {
    nr_technologiczny: p.nr_technologiczny ?? "A-1",
    data_awarii: new Date(TERAZ.getTime() - p.dniTemu * 86_400_000).toISOString(),
    status: p.status ?? "zamknieta",
    czas_przestoju_h: p.czas_przestoju_h ?? null,
    kategoria_przyczyny: p.kategoria_przyczyny ?? null,
  };
}

describe("wskazniki", () => {
  it("MTTR to średni przestój zamkniętych awarii, MTBF = (czas okresu − przestój) / liczba", () => {
    const w = wskazniki(
      [
        awaria({ dniTemu: 1, czas_przestoju_h: 2 }),
        awaria({ dniTemu: 5, czas_przestoju_h: 6 }),
        awaria({ dniTemu: 30, czas_przestoju_h: 100 }), // poza okresem
      ],
      OKRES_10_DNI,
    );
    expect(w).toEqual({ liczba: 2, przestojH: 8, mttrH: 4, mtbfH: (240 - 8) / 2 });
  });

  it("otwarte awarie liczą się do MTBF, ale nie do MTTR; bez awarii wskaźników brak", () => {
    const w = wskazniki(
      [awaria({ dniTemu: 2, status: "w_naprawie" }), awaria({ dniTemu: 3, czas_przestoju_h: 3 })],
      OKRES_10_DNI,
    );
    expect(w.liczba).toBe(2);
    expect(w.mttrH).toBe(3);
    expect(wskazniki([], OKRES_10_DNI)).toEqual({
      liczba: 0,
      przestojH: 0,
      mttrH: null,
      mtbfH: null,
    });
  });

  it("wskaźniki per urządzenie: najkrótszy MTBF pierwszy", () => {
    const lista = wskaznikiUrzadzen(
      [
        awaria({ nr_technologiczny: "B", dniTemu: 1, czas_przestoju_h: 1 }),
        awaria({ nr_technologiczny: "A", dniTemu: 1, czas_przestoju_h: 1 }),
        awaria({ nr_technologiczny: "A", dniTemu: 2, czas_przestoju_h: 1 }),
      ],
      OKRES_10_DNI,
    );
    expect(lista.map((u) => u.nr_technologiczny)).toEqual(["A", "B"]);
  });
});

describe("pareto", () => {
  const dane = [
    awaria({ dniTemu: 1, kategoria_przyczyny: "mechaniczna", czas_przestoju_h: 1 }),
    awaria({ dniTemu: 1, kategoria_przyczyny: "mechaniczna", czas_przestoju_h: 1 }),
    awaria({ dniTemu: 1, kategoria_przyczyny: "elektryczna", czas_przestoju_h: 10 }),
    awaria({ dniTemu: 1, czas_przestoju_h: 4 }),
    awaria({ dniTemu: 1, status: "w_naprawie", kategoria_przyczyny: "media" }),
  ];

  it("wg liczby: malejąco, „Nie określono” na końcu, suma narastająca do 100%", () => {
    const p = pareto(dane, "liczba");
    expect(p.map((x) => x.etykieta)).toEqual(["Mechaniczna", "Elektryczna", "Nie określono"]);
    expect(p[0]?.udzial).toBe(50);
    expect(p.at(-1)?.narastajaco).toBeCloseTo(100);
  });

  it("wg przestoju zmienia kolejność; otwarte awarie są pomijane", () => {
    const p = pareto(dane, "przestoj");
    expect(p.map((x) => x.etykieta)).toEqual(["Elektryczna", "Mechaniczna", "Nie określono"]);
    expect(p[0]?.wartosc).toBe(10);
  });

  it("bez zamkniętych awarii pusto", () => {
    expect(pareto([awaria({ dniTemu: 1, status: "zgloszona" })], "liczba")).toEqual([]);
  });
});

it("formatujCzas: godziny do 48 h, dalej dni", () => {
  expect(formatujCzas(null)).toBe("—");
  expect(formatujCzas(3.25)).toBe("3,3 h");
  expect(formatujCzas(240)).toBe("10 dni");
});
