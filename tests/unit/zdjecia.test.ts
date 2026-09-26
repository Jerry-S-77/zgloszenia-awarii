import { describe, expect, it } from "vitest";
import { wymiaryPoZmniejszeniu } from "@/lib/zdjecia";
import { klasyfikujBladStorage, sciezkaZdjecia } from "@/lib/zdjecia-wysylka";
import { czyBladSieci } from "@/lib/kolejka-bledy";

describe("wymiaryPoZmniejszeniu", () => {
  it("zmniejsza dłuższy bok do 1600 px z zachowaniem proporcji", () => {
    expect(wymiaryPoZmniejszeniu(4000, 3000)).toEqual({ szerokosc: 1600, wysokosc: 1200 });
    expect(wymiaryPoZmniejszeniu(3000, 4000)).toEqual({ szerokosc: 1200, wysokosc: 1600 });
  });
  it("nie powiększa małych zdjęć", () => {
    expect(wymiaryPoZmniejszeniu(800, 600)).toEqual({ szerokosc: 800, wysokosc: 600 });
  });
});

describe("klasyfikujBladStorage", () => {
  it("brak błędu i plik, który już istnieje, to sukces", () => {
    expect(klasyfikujBladStorage(null)).toBeNull();
    expect(
      klasyfikujBladStorage({ status: 400, statusCode: "409", message: "Duplicate" }),
    ).toBeNull();
    expect(
      klasyfikujBladStorage({ status: 409, message: "The resource already exists" }),
    ).toBeNull();
  });
  it("odmowa serwera to błąd biznesowy (z kodem), brak odpowiedzi to błąd sieci", () => {
    const odmowa = klasyfikujBladStorage({
      status: 403,
      statusCode: "403",
      message: "new row violates row-level security policy",
    });
    expect(odmowa?.code).toBe("STORAGE_403");
    expect(czyBladSieci(odmowa)).toBe(false);
    const siec = klasyfikujBladStorage({ message: "Failed to fetch" });
    expect(czyBladSieci(siec)).toBe(true);
  });
});

it("ścieżka zdjęcia to <awaria>/<zdjęcie>.jpg", () => {
  expect(sciezkaZdjecia("a", "b")).toBe("a/b.jpg");
});
