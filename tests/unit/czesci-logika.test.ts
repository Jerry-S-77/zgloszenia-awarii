import { describe, expect, it } from "vitest";
import {
  dniOczekiwania,
  historiaCzesci,
  nastepnyEtap,
  podpowiedziNazw,
  type CzescZAwaria,
} from "@/lib/czesci-logika";

const czesc = (
  nazwa: string,
  numer: string,
  data: string,
  p: Partial<CzescZAwaria> = {},
): CzescZAwaria => ({
  nazwa,
  ilosc: 1,
  status: "dostarczona",
  awaria: { numer, data_awarii: data },
  ...p,
});

describe("historiaCzesci", () => {
  it("sumuje dostarczone części po nazwie niezależnie od pisowni; niedostarczone pomija", () => {
    const h = historiaCzesci([
      czesc("Filtr HEPA", "A-1", "2026-07-01", { ilosc: 2 }),
      czesc(" filtr  hepa ", "A-2", "2026-08-01"),
      czesc("Pasek", "A-2", "2026-08-01"),
      czesc("Łożysko", "A-3", "2026-09-01", { status: "zamowiona" }),
    ]);
    expect(h).toEqual([
      { nazwa: "filtr hepa", ilosc: 3, awarie: 2, ostatnio: "2026-08-01" },
      { nazwa: "Pasek", ilosc: 1, awarie: 1, ostatnio: "2026-08-01" },
    ]);
  });

  it("kilka pozycji tej samej części w jednej awarii liczy się jako jedna awaria", () => {
    const h = historiaCzesci([
      czesc("Bezpiecznik", "A-1", "2026-07-01"),
      czesc("Bezpiecznik", "A-1", "2026-07-01"),
    ]);
    expect(h[0]).toMatchObject({ ilosc: 2, awarie: 1 });
  });
});

it("nastepnyEtap prowadzi potrzebna → zamówiona → dostarczona", () => {
  expect(nastepnyEtap("potrzebna")?.na).toBe("zamowiona");
  expect(nastepnyEtap("zamowiona")?.na).toBe("dostarczona");
  expect(nastepnyEtap("dostarczona")).toBeNull();
});

it("podpowiedziNazw usuwa powtórzenia niezależnie od wielkości liter", () => {
  expect(podpowiedziNazw([{ nazwa: "Filtr" }, { nazwa: "FILTR " }, { nazwa: "Pasek" }])).toEqual([
    "Filtr",
    "Pasek",
  ]);
});

it("dniOczekiwania liczy pełne dni", () => {
  expect(dniOczekiwania("2026-09-20T12:00:00Z", new Date("2026-09-27T11:00:00Z"))).toBe(6);
});
