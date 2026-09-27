import { describe, expect, it } from "vitest";
import { kluczNaBajty } from "@/lib/push";
import { subskrypcjeDlaPowiadomienia, wiadomoscPush, zgodnySekret } from "@/lib/push-wiadomosc";

describe("wiadomoscPush", () => {
  it("tytuł z typu powiadomienia, znacznik dla krytycznych", () => {
    expect(
      wiadomoscPush({
        id: "1",
        typ: "niski_stan",
        tresc: "Filtr: 1 szt.",
        link: "/magazyn",
        krytyczne: true,
      }),
    ).toEqual({
      id: "1",
      tytul: "⚠ Niski stan magazynu",
      tresc: "Filtr: 1 szt.",
      link: "/magazyn",
      krytyczne: true,
    });
  });

  it("link spoza aplikacji albo brak linku prowadzi do listy powiadomień", () => {
    const baza = { id: "1", typ: "nowa_awaria", tresc: "x", krytyczne: false };
    expect(wiadomoscPush({ ...baza, link: "https://zla.strona" }).link).toBe("/powiadomienia");
    expect(wiadomoscPush({ ...baza, link: "//zla.strona" }).link).toBe("/powiadomienia");
    expect(wiadomoscPush({ ...baza, link: null }).link).toBe("/powiadomienia");
    expect(wiadomoscPush({ ...baza, link: "/awarie/abc" }).link).toBe("/awarie/abc");
  });
});

it("krytyczne idą do wszystkich subskrypcji, zwykłe tylko do „wszystkie”", () => {
  const s = [
    { id: "a", tylko_krytyczne: true },
    { id: "b", tylko_krytyczne: false },
  ];
  expect(subskrypcjeDlaPowiadomienia(s, true).map((x) => x.id)).toEqual(["a", "b"]);
  expect(subskrypcjeDlaPowiadomienia(s, false).map((x) => x.id)).toEqual(["b"]);
});

it("zgodnySekret porównuje całe sekrety", () => {
  expect(zgodnySekret("abc", "abc")).toBe(true);
  expect(zgodnySekret("abd", "abc")).toBe(false);
  expect(zgodnySekret("ab", "abc")).toBe(false);
  expect(zgodnySekret(null, "abc")).toBe(false);
});

it("kluczNaBajty dekoduje klucz base64url", () => {
  expect(Array.from(kluczNaBajty("AQID_w"))).toEqual([1, 2, 3, 255]);
});
