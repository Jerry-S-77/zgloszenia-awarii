import { describe, expect, it } from "vitest";
import {
  dodajDni,
  dzisLokalnie,
  filtrujPrzeglady,
  formatujDate,
  nastepnyTermin,
  opisTerminu,
  roznicaDni,
  sortujPoPilnosci,
  statusPrzegladu,
} from "@/lib/przeglady";

const DZIS = "2026-09-21";
const p = (data_najblizszego: string | null) => ({ data_najblizszego });

describe("statusPrzegladu", () => {
  it("bez terminu: do uzupełnienia", () =>
    expect(statusPrzegladu(p(null), DZIS)).toBe("do_uzupelnienia"));
  it("termin wczoraj: opóźniony", () =>
    expect(statusPrzegladu(p("2026-09-20"), DZIS)).toBe("opozniony"));
  it("termin dziś: wkrótce", () => expect(statusPrzegladu(p(DZIS), DZIS)).toBe("wkrotce"));
  it("za 14 dni: wkrótce", () => expect(statusPrzegladu(p("2026-10-05"), DZIS)).toBe("wkrotce"));
  it("za 15 dni: zaplanowany", () =>
    expect(statusPrzegladu(p("2026-10-06"), DZIS)).toBe("zaplanowany"));
});

describe("daty", () => {
  it("dodaje dni przez granicę miesiąca i zmianę czasu", () => {
    expect(dodajDni("2026-09-21", 90)).toBe("2026-12-20");
    expect(dodajDni("2026-10-24", 2)).toBe("2026-10-26");
  });
  it("liczy różnicę dni w obie strony", () => {
    expect(roznicaDni(DZIS, "2026-08-30")).toBe(-22);
    expect(roznicaDni(DZIS, "2026-09-27")).toBe(6);
  });
  it("następny termin = wykonanie + częstotliwość, bez częstotliwości brak", () => {
    expect(nastepnyTermin(DZIS, 90)).toBe("2026-12-20");
    expect(nastepnyTermin(DZIS, null)).toBeNull();
  });
  it("dzisLokalnie zwraca YYYY-MM-DD", () => {
    expect(dzisLokalnie(new Date(2026, 8, 21, 23, 30))).toBe("2026-09-21");
  });
  it("formatuje datę po polsku", () => {
    expect(formatujDate("2026-09-04")).toBe("04.09.2026");
    expect(formatujDate(null)).toBe("—");
  });
});

describe("opisTerminu", () => {
  it("opisuje terminy przeszłe, dzisiejszy i przyszłe", () => {
    expect(opisTerminu(-22)).toBe("−22 dni");
    expect(opisTerminu(-1)).toBe("−1 dzień");
    expect(opisTerminu(0)).toBe("dziś");
    expect(opisTerminu(1)).toBe("za 1 dzień");
    expect(opisTerminu(6)).toBe("za 6 dni");
  });
});

describe("sortowanie i filtry", () => {
  const lista = [p("2026-10-30"), p(null), p("2026-08-30"), p("2026-09-27")];

  it("najpilniejsze pierwsze, bez terminu na końcu", () => {
    expect(sortujPoPilnosci(lista).map((x) => x.data_najblizszego)).toEqual([
      "2026-08-30",
      "2026-09-27",
      "2026-10-30",
      null,
    ]);
  });
  it("filtruje opóźnione, 30 dni i do uzupełnienia", () => {
    expect(filtrujPrzeglady(lista, "opoznione", DZIS)).toHaveLength(1);
    expect(filtrujPrzeglady(lista, "30dni", DZIS)).toHaveLength(2);
    expect(filtrujPrzeglady(lista, "do_uzupelnienia", DZIS)).toHaveLength(1);
    expect(filtrujPrzeglady(lista, "wszystkie", DZIS)).toHaveLength(4);
  });
});
