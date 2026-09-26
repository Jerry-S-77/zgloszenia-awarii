import { describe, expect, it } from "vitest";
import { opisCzasu } from "@/lib/czas-wzgledny";

const TERAZ = new Date("2026-09-26T12:00:00Z");
const temu = (ms: number) => new Date(TERAZ.getTime() - ms).toISOString();

describe("opisCzasu", () => {
  it("minuty i godziny", () => {
    expect(opisCzasu(temu(20_000), TERAZ)).toBe("przed chwilą");
    expect(opisCzasu(temu(5 * 60_000), TERAZ)).toBe("5 min temu");
    expect(opisCzasu(temu(2 * 3_600_000), TERAZ)).toBe("2 godz. temu");
  });
  it("dni i starsze daty", () => {
    expect(opisCzasu(temu(30 * 3_600_000), TERAZ)).toBe("wczoraj");
    expect(opisCzasu(temu(3 * 86_400_000), TERAZ)).toBe("3 dni temu");
    expect(opisCzasu(temu(10 * 86_400_000), TERAZ)).toMatch(/2026/);
  });
});
