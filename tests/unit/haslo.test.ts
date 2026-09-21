import { describe, expect, it } from "vitest";
import { generujHasloTymczasowe, noweHasloSchema } from "@/lib/haslo";

const FORMAT = /^[A-HJ-NP-Za-km-np-z2-9]{4}-[A-HJ-NP-Za-km-np-z2-9]{4}-[A-HJ-NP-Za-km-np-z2-9]{4}$/;

describe("generujHasloTymczasowe", () => {
  it("ma format XXXX-XXXX-XXXX bez znaków mylących (0 O 1 l I)", () => {
    for (let i = 0; i < 200; i++) expect(generujHasloTymczasowe()).toMatch(FORMAT);
  });
  it("generuje różne hasła", () => {
    const hasla = new Set(Array.from({ length: 50 }, generujHasloTymczasowe));
    expect(hasla.size).toBe(50);
  });
});

describe("noweHasloSchema", () => {
  it("odrzuca hasło krótsze niż 12 znaków", () => {
    const wynik = noweHasloSchema.safeParse("a".repeat(11));
    expect(wynik.success).toBe(false);
    if (!wynik.success)
      expect(wynik.error.issues[0]?.message).toBe("Hasło musi mieć co najmniej 12 znaków.");
  });
  it("akceptuje hasło 12-znakowe", () => {
    expect(noweHasloSchema.safeParse("a".repeat(12)).success).toBe(true);
  });
  it("odrzuca hasło dłuższe niż 72 znaki", () => {
    expect(noweHasloSchema.safeParse("a".repeat(73)).success).toBe(false);
  });
});
