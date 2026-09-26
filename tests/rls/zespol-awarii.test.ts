import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  KONTA,
  klientAdmin,
  przygotujKonta,
  zalogujLinkiem,
  type KluczKonta,
} from "../wspolne/srodowisko";

const ZNACZNIK = `TEST-3B-${crypto.randomUUID()}`;
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

async function wstaw(status: "zgloszona" | "zamknieta" = "zgloszona", zglaszajacy?: string) {
  const { data, error } = await admin
    .from("awarie")
    .insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      opis_awarii: `${ZNACZNIK} ${crypto.randomUUID()}`,
      krytycznosc_skutku: "Niska",
      status,
      zglaszajacy_id: zglaszajacy ?? id.pracownik,
      ...(status === "zamknieta"
        ? { przyczyna: "test", czas_przestoju_h: 1, data_zamkniecia: new Date().toISOString() }
        : {}),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function zespol(awariaId: string) {
  const { data, error } = await admin
    .from("awarie_zespol")
    .select("uzytkownik_id, nazwa, dodal_id")
    .eq("awaria_id", awariaId);
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  id = await przygotujKonta();
});

afterAll(async () => {
  await admin.from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
});

describe("dołączanie do zespołu", () => {
  it("kilku techników może dołączyć do tej samej awarii; nazwisko ustawia baza", async () => {
    const awaria = await wstaw();
    const { error: e1 } = await (
      await jako("technik")
    )
      .from("awarie_zespol")
      .insert({ awaria_id: awaria, uzytkownik_id: id.technik });
    const { error: e2 } = await (
      await jako("kierownik")
    )
      .from("awarie_zespol")
      .insert({ awaria_id: awaria, uzytkownik_id: id.kierownik });
    expect(e1).toBeNull();
    expect(e2).toBeNull();
    const sklad = await zespol(awaria);
    expect(sklad.map((c) => c.nazwa).sort()).toEqual(["Test kierownik", "Test technik"]);
  });

  it("technik nie doda innej osoby, kierownik doda technika", async () => {
    const awaria = await wstaw();
    const { error: technik } = await (
      await jako("technik")
    )
      .from("awarie_zespol")
      .insert({ awaria_id: awaria, uzytkownik_id: id.admin });
    expect(technik).not.toBeNull();
    const { error: kierownik } = await (
      await jako("kierownik")
    )
      .from("awarie_zespol")
      .insert({ awaria_id: awaria, uzytkownik_id: id.technik });
    expect(kierownik).toBeNull();
    const [c] = await zespol(awaria);
    expect(c?.dodal_id).toBe(id.kierownik);
  });

  it("pracownika nie da się dodać do zespołu, pracownik sam też nie dołączy", async () => {
    const awaria = await wstaw();
    const { error: przezKierownika } = await (
      await jako("kierownik")
    )
      .from("awarie_zespol")
      .insert({ awaria_id: awaria, uzytkownik_id: id.pracownik });
    expect(przezKierownika).not.toBeNull();
    const { error: sam } = await (
      await jako("pracownik")
    )
      .from("awarie_zespol")
      .insert({ awaria_id: awaria, uzytkownik_id: id.pracownik });
    expect(sam).not.toBeNull();
  });

  it("do zamkniętej awarii nie można dołączyć", async () => {
    const awaria = await wstaw("zamknieta");
    const { error } = await (
      await jako("technik")
    )
      .from("awarie_zespol")
      .insert({ awaria_id: awaria, uzytkownik_id: id.technik });
    expect(error).not.toBeNull();
  });
});

describe("opuszczanie i usuwanie z zespołu", () => {
  it("technik opuszcza zadanie, ale nie usunie innej osoby; kierownik usunie", async () => {
    const awaria = await wstaw();
    await admin.from("awarie_zespol").insert([
      { awaria_id: awaria, uzytkownik_id: id.technik, nazwa: "x" },
      { awaria_id: awaria, uzytkownik_id: id.admin, nazwa: "x" },
    ]);
    const technik = await jako("technik");
    const { data: cudzy } = await technik
      .from("awarie_zespol")
      .delete()
      .eq("awaria_id", awaria)
      .eq("uzytkownik_id", id.admin)
      .select();
    expect(cudzy).toEqual([]);
    const { data: siebie } = await technik
      .from("awarie_zespol")
      .delete()
      .eq("awaria_id", awaria)
      .eq("uzytkownik_id", id.technik)
      .select();
    expect(siebie).toHaveLength(1);
    const { data: przezKierownika } = await (
      await jako("kierownik")
    )
      .from("awarie_zespol")
      .delete()
      .eq("awaria_id", awaria)
      .eq("uzytkownik_id", id.admin)
      .select();
    expect(przezKierownika).toHaveLength(1);
  });

  it("dołączenie i odejście trafiają do historii z nazwiskiem", async () => {
    const awaria = await wstaw();
    const technik = await jako("technik");
    await technik.from("awarie_zespol").insert({ awaria_id: awaria, uzytkownik_id: id.technik });
    await technik
      .from("awarie_zespol")
      .delete()
      .eq("awaria_id", awaria)
      .eq("uzytkownik_id", id.technik);
    const { data } = await admin
      .from("awarie_historia")
      .select("typ, autor_id, dane")
      .eq("awaria_id", awaria)
      .eq("typ", "przypisanie")
      .order("created_at");
    expect(data?.map((w) => (w.dane as { akcja: string }).akcja)).toEqual([
      "dolaczenie",
      "odejscie",
    ]);
    expect(data?.[0]?.autor_id).toBe(id.technik);
    expect((data?.[0]?.dane as { nazwa: string }).nazwa).toBe("Test technik");
  });
});

describe("widoczność i lista osób obsługi", () => {
  it("pracownik widzi zespół przy własnej awarii, nie przy cudzej", async () => {
    const wlasna = await wstaw("zgloszona", id.pracownik);
    const cudza = await wstaw("zgloszona", id.pracownik2);
    await admin.from("awarie_zespol").insert([
      { awaria_id: wlasna, uzytkownik_id: id.technik, nazwa: "x" },
      { awaria_id: cudza, uzytkownik_id: id.technik, nazwa: "x" },
    ]);
    const pracownik = await jako("pracownik");
    const { data: w } = await pracownik
      .from("awarie_zespol")
      .select("awaria_id")
      .eq("awaria_id", wlasna);
    const { data: c } = await pracownik
      .from("awarie_zespol")
      .select("awaria_id")
      .eq("awaria_id", cudza);
    expect(w).toHaveLength(1);
    expect(c).toEqual([]);
  });

  it("osoby_obslugi: kierownik dostaje listę bez pracowników, technik nie ma dostępu", async () => {
    const { data, error } = await (await jako("kierownik")).rpc("osoby_obslugi");
    expect(error).toBeNull();
    const idki = (data ?? []).map((o) => o.id);
    expect(idki).toContain(id.technik);
    expect(idki).not.toContain(id.pracownik);
    expect(idki).not.toContain(id.zablokowany);
    const { error: bladTechnika } = await (await jako("technik")).rpc("osoby_obslugi");
    expect(bladTechnika).not.toBeNull();
  });
});
