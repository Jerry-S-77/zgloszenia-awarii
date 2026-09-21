import { describe, expect, it } from "vitest";
import { klasyfikujSesje, stanPoStarcie, wybierzUserId } from "@/lib/uzytkownik-cache";

describe("wybierzUserId", () => {
  it("id z sesji ma pierwszeństwo, także offline", () => {
    expect(wybierzUserId("sesja", true, "cache")).toBe("sesja");
    expect(wybierzUserId("sesja", false, "cache")).toBe("sesja");
  });
  it("brak sesji i offline: id z pamięci lokalnej", () => {
    expect(wybierzUserId(null, false, "cache")).toBe("cache");
  });
  it("brak sesji i online: null, bez zgadywania z pamięci lokalnej", () => {
    expect(wybierzUserId(null, true, "cache")).toBeNull();
  });
  it("brak sesji, offline i brak pamięci lokalnej: null", () => {
    expect(wybierzUserId(null, false, null)).toBeNull();
  });
});

describe("stanPoStarcie", () => {
  const profil = { id: "u1" };
  it("sesja ma pierwszeństwo", () => {
    expect(stanPoStarcie("u1", true, profil)).toBe("sesja");
    expect(stanPoStarcie("u1", false, null)).toBe("sesja");
  });
  it("brak sesji, offline i profil w pamięci: stan z pamięci", () => {
    expect(stanPoStarcie(null, false, profil)).toBe("cache");
  });
  it("brak sesji i online: nigdy nie ufamy pamięci lokalnej", () => {
    expect(stanPoStarcie(null, true, profil)).toBe("brak");
  });
  it("brak sesji, offline i brak profilu w pamięci: brak", () => {
    expect(stanPoStarcie(null, false, null)).toBe("brak");
  });
});

describe("klasyfikujSesje", () => {
  it("id sesji oznacza sesję, niezależnie od błędu", () => {
    expect(klasyfikujSesje("u1", null)).toBe("sesja");
    expect(klasyfikujSesje("u1", new Error("x"))).toBe("sesja");
  });
  it("brak sesji bez błędu to brak zalogowania", () => {
    expect(klasyfikujSesje(null, null)).toBe("brak");
    expect(klasyfikujSesje(null, undefined)).toBe("brak");
  });
  it("brak sesji z błędem (nieudane odświeżenie tokenu) jest nieokreślony, nie 'brak'", () => {
    expect(klasyfikujSesje(null, new Error("fetch failed"))).toBe("nieokreslona");
    expect(klasyfikujSesje(null, { message: "retryable" })).toBe("nieokreslona");
  });
});
