import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  KONTA,
  klientAdmin,
  przygotujKonta,
  zalogujLinkiem,
  type KluczKonta,
} from "../wspolne/srodowisko";

const ZNACZNIK = `TEST-CZ-${crypto.randomUUID()}`;
const admin = klientAdmin();
let id: Record<KluczKonta, string>;
const klienci = new Map<KluczKonta, Awaited<ReturnType<typeof zalogujLinkiem>>>();

async function jako(k: KluczKonta) {
  const istniejacy = klienci.get(k);
  if (istniejacy) return istniejacy;
  const klient = await zalogujLinkiem(KONTA[k].email);
  klienci.set(k, klient);
  return klient;
}

async function wstawAwarie(zamknieta = false) {
  const { data, error } = await admin
    .from("awarie")
    .insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      opis_awarii: `${ZNACZNIK} ${crypto.randomUUID()}`,
      krytycznosc_skutku: "Niska",
      zglaszajacy_id: id.pracownik,
      ...(zamknieta
        ? {
            status: "zamknieta" as const,
            przyczyna: "test",
            czas_przestoju_h: 1,
            kategoria_przyczyny: "mechaniczna" as const,
            data_zamkniecia: new Date().toISOString(),
          }
        : {}),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function dodajCzesc(k: KluczKonta, awariaId: string, nazwa = "Pasek klinowy SPZ 1250") {
  return (await jako(k))
    .from("awarie_czesci")
    .insert({ awaria_id: awariaId, nazwa: `  ${nazwa} `, ilosc: 2 })
    .select("id, nazwa, autor_id, status")
    .single();
}

beforeAll(async () => {
  id = await przygotujKonta();
});

afterAll(async () => {
  const { error } = await admin.from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
  if (error) throw error;
});

describe("części przy awarii", () => {
  it("technik dodaje część; autor i historia z bazy, nazwa bez zbędnych spacji", async () => {
    const awaria = await wstawAwarie();
    const { data, error } = await dodajCzesc("technik", awaria);
    expect(error).toBeNull();
    expect(data).toMatchObject({
      nazwa: "Pasek klinowy SPZ 1250",
      autor_id: id.technik,
      status: "potrzebna",
    });
    const { data: historia } = await admin
      .from("awarie_historia")
      .select("dane")
      .eq("awaria_id", awaria)
      .eq("typ", "edycja");
    expect(historia?.[0]?.dane).toMatchObject({ akcja: "czesc_dodana", ilosc: 2 });
  });

  it("zgłaszający widzi części swojej awarii, ale ich nie dodaje; obcy pracownik ich nie widzi", async () => {
    const awaria = await wstawAwarie();
    await dodajCzesc("technik", awaria);
    const { data: widoczne } = await (
      await jako("pracownik")
    )
      .from("awarie_czesci")
      .select("id")
      .eq("awaria_id", awaria);
    expect(widoczne).toHaveLength(1);
    const { error } = await dodajCzesc("pracownik", awaria);
    expect(error?.code).toBe("42501");
    const { data: obce } = await (
      await jako("pracownik2")
    )
      .from("awarie_czesci")
      .select("id")
      .eq("awaria_id", awaria);
    expect(obce).toEqual([]);
  });

  it("zamknięta awaria: części są zamrożone", async () => {
    const awaria = await wstawAwarie();
    const { data: czesc } = await dodajCzesc("technik", awaria);
    await admin
      .from("awarie")
      .update({
        status: "zamknieta",
        przyczyna: "test",
        czas_przestoju_h: 1,
        kategoria_przyczyny: "mechaniczna",
        data_zamkniecia: new Date().toISOString(),
      })
      .eq("id", awaria);
    const kierownik = await jako("kierownik");
    const { error: bladDodania } = await dodajCzesc("kierownik", awaria, "Łożysko");
    expect(bladDodania?.code).toBe("42501");
    const { data: zmienione } = await kierownik
      .from("awarie_czesci")
      .update({ status: "dostarczona" })
      .eq("id", czesc!.id)
      .select("id");
    expect(zmienione ?? []).toEqual([]);
    await kierownik.from("awarie_czesci").delete().eq("id", czesc!.id);
    const { data: nadal } = await admin.from("awarie_czesci").select("id").eq("id", czesc!.id);
    expect(nadal).toHaveLength(1);
  });

  it("nie da się przenieść części do innej awarii", async () => {
    const awaria = await wstawAwarie();
    const inna = await wstawAwarie();
    const { data: czesc } = await dodajCzesc("technik", awaria);
    const { error } = await (
      await jako("technik")
    )
      .from("awarie_czesci")
      .update({ awaria_id: inna } as never)
      .eq("id", czesc!.id);
    expect(error?.code).toBe("42501");
  });

  it("dostarczenie części powiadamia zespół awarii (bez osoby, która je odnotowała)", async () => {
    const awaria = await wstawAwarie();
    await admin.from("awarie_zespol").insert([
      { awaria_id: awaria, uzytkownik_id: id.kierownik, nazwa: "Test kierownik" },
      { awaria_id: awaria, uzytkownik_id: id.technik, nazwa: "Test technik" },
    ]);
    const { data: czesc } = await dodajCzesc("technik", awaria);
    const { error } = await (
      await jako("technik")
    )
      .from("awarie_czesci")
      .update({ status: "dostarczona" })
      .eq("id", czesc!.id);
    expect(error).toBeNull();
    const { data: powiadomienia } = await admin
      .from("powiadomienia")
      .select("uzytkownik_id, typ")
      .eq("klucz", `czesc:${czesc!.id}:dostarczona`);
    expect(powiadomienia).toEqual([{ uzytkownik_id: id.kierownik, typ: "czesc_dostarczona" }]);
  });

  it("awarię z częściami da się usunąć", async () => {
    const awaria = await wstawAwarie();
    await dodajCzesc("technik", awaria);
    const { error } = await admin.from("awarie").delete().eq("id", awaria);
    expect(error).toBeNull();
  });
});
