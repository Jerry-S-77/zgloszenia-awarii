import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  KONTA,
  klientAdmin,
  przygotujKonta,
  zalogujLinkiem,
  type KluczKonta,
} from "../wspolne/srodowisko";

const NR = `TST-LK-${Date.now()}`;
const LISTA = ["Sprawdź filtr wstępny", "Pomiar różnicy ciśnień"];
const admin = klientAdmin();
const klienci = new Map<KluczKonta, Awaited<ReturnType<typeof zalogujLinkiem>>>();

async function jako(k: KluczKonta) {
  const istniejacy = klienci.get(k);
  if (istniejacy) return istniejacy;
  const klient = await zalogujLinkiem(KONTA[k].email);
  klienci.set(k, klient);
  return klient;
}

async function nowyPrzeglad(lista: string[]) {
  const { data, error } = await admin
    .from("przeglady")
    .insert({
      nr_technologiczny: NR,
      typ_czynnosci: "test",
      czestotliwosc_dni: 30,
      lista_kontrolna: lista,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const dzis = () => new Date().toISOString().slice(0, 10);

async function wykonaj(przegladId: string, lista: unknown) {
  return (await jako("technik"))
    .from("przeglady_wykonania")
    .insert({ przeglad_id: przegladId, data_wykonania: dzis(), lista_kontrolna: lista as never })
    .select("id, lista_kontrolna")
    .single();
}

beforeAll(async () => {
  await przygotujKonta();
  const { error } = await admin
    .from("urzadzenia")
    .insert({ nr_technologiczny: NR, nazwa_urzadzenia: `Test ${NR}`, status: "proponowane" });
  if (error) throw error;
});

afterAll(async () => {
  const { error } = await admin.from("urzadzenia").delete().eq("nr_technologiczny", NR);
  if (error) throw error;
});

describe("lista kontrolna harmonogramu", () => {
  it("kierownik zmienia listę, technik nie", async () => {
    const id = await nowyPrzeglad([]);
    const { data: technik } = await (
      await jako("technik")
    )
      .from("przeglady")
      .update({ lista_kontrolna: LISTA })
      .eq("id", id)
      .select("id");
    expect(technik ?? []).toEqual([]);
    const { data, error } = await (
      await jako("kierownik")
    )
      .from("przeglady")
      .update({ lista_kontrolna: LISTA })
      .eq("id", id)
      .select("lista_kontrolna")
      .single();
    expect(error).toBeNull();
    expect(data?.lista_kontrolna).toEqual(LISTA);
  });

  it("pusty punkt albo ponad 30 punktów są odrzucane", async () => {
    const id = await nowyPrzeglad([]);
    const kierownik = await jako("kierownik");
    const pusty = await kierownik
      .from("przeglady")
      .update({ lista_kontrolna: ["  "] })
      .eq("id", id);
    expect(pusty.error?.code).toBe("23514");
    const zaDuzo = await kierownik
      .from("przeglady")
      .update({ lista_kontrolna: Array.from({ length: 31 }, (_, i) => `Punkt ${i}`) })
      .eq("id", id);
    expect(zaDuzo.error?.code).toBe("23514");
  });
});

describe("wykonanie z listą kontrolną", () => {
  it("bez oceny wszystkich punktów wykonanie jest odrzucane", async () => {
    const id = await nowyPrzeglad(LISTA);
    const { error } = await wykonaj(id, [{ tresc: LISTA[0], wynik: "ok" }]);
    expect(error?.message).toContain("oceń każdy punkt");
  });

  it("nieaktualna treść punktu jest odrzucana", async () => {
    const id = await nowyPrzeglad(LISTA);
    const { error } = await wykonaj(id, [
      { tresc: "Stara treść", wynik: "ok" },
      { tresc: LISTA[1], wynik: "ok" },
    ]);
    expect(error?.message).toContain("zmieniona");
  });

  it("nieprawidłowość wymaga opisu", async () => {
    const id = await nowyPrzeglad(LISTA);
    const { error } = await wykonaj(id, [
      { tresc: LISTA[0], wynik: "nok" },
      { tresc: LISTA[1], wynik: "ok" },
    ]);
    expect(error?.message).toContain("Opisz nieprawidłowość");
  });

  it("poprawne wyniki są zapisane bez obcych pól; nieprawidłowość powiadamia kierownika", async () => {
    const id = await nowyPrzeglad(LISTA);
    const { data, error } = await wykonaj(id, [
      { tresc: LISTA[0], wynik: "nok", uwaga: " Filtr zatkany ", zlosliwe: "x" },
      { tresc: LISTA[1], wynik: "nd" },
    ]);
    expect(error).toBeNull();
    expect(data?.lista_kontrolna).toEqual([
      { tresc: LISTA[0], wynik: "nok", uwaga: "Filtr zatkany" },
      { tresc: LISTA[1], wynik: "nd", uwaga: null },
    ]);
    const { data: powiadomienia } = await admin
      .from("powiadomienia")
      .select("uzytkownik_id, typ, krytyczne")
      .eq("klucz", `nok:${data?.id}`);
    const { data: kierownik } = await admin
      .from("profiles")
      .select("id")
      .eq("email", KONTA.kierownik.email)
      .single();
    expect(powiadomienia).toContainEqual({
      uzytkownik_id: kierownik?.id,
      typ: "przeglad_nieprawidlowosc",
      krytyczne: true,
    });
  });

  it("przegląd bez listy ignoruje przesłane wyniki", async () => {
    const id = await nowyPrzeglad([]);
    const { data, error } = await wykonaj(id, [{ tresc: "cokolwiek", wynik: "ok" }]);
    expect(error).toBeNull();
    expect(data?.lista_kontrolna).toEqual([]);
  });
});
