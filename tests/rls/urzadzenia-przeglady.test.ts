import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import {
  KONTA,
  klientAdmin,
  klientAnon,
  przygotujKonta,
  zalogujLinkiem,
  type KluczKonta,
} from "../wspolne/srodowisko";

const PREFIKS = `T3${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
const admin = klientAdmin();
let id: Record<KluczKonta, string>;
let licznik = 0;
const klienci = new Map<KluczKonta, Awaited<ReturnType<typeof zalogujLinkiem>>>();

async function jako(k: KluczKonta) {
  const istniejacy = klienci.get(k);
  if (istniejacy) return istniejacy;
  const klient = await zalogujLinkiem(KONTA[k].email);
  klienci.set(k, klient);
  return klient;
}

function dzis(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());
}
function dodajDni(data: string, dni: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dni);
  return d.toISOString().slice(0, 10);
}

async function noweUrzadzenie(status: "proponowane" | "aktywne" | "wycofane" = "aktywne") {
  licznik += 1;
  const nr = `${PREFIKS}-${licznik}`;
  const { error } = await admin
    .from("urzadzenia")
    .insert({ nr_technologiczny: nr, nazwa_urzadzenia: `Test ${nr}`, status });
  if (error) throw error;
  return nr;
}

async function przegladUrzadzenia(nr: string) {
  const { data, error } = await admin.from("przeglady").select("*").eq("nr_technologiczny", nr);
  if (error) throw error;
  return data;
}

async function ustawPrzeglad(
  nr: string,
  zmiany: Database["public"]["Tables"]["przeglady"]["Update"],
) {
  const [p] = await przegladUrzadzenia(nr);
  if (!p) throw new Error(`Brak przeglądu dla ${nr}`);
  const { error } = await admin.from("przeglady").update(zmiany).eq("id", p.id);
  if (error) throw error;
  return p.id;
}

async function wstawAwarie(nr: string, dniTemu: number, dodatkowe: Record<string, unknown> = {}) {
  const data = new Date(Date.now() - dniTemu * 86_400_000).toISOString();
  const { error } = await admin.from("awarie").insert({
    nr_technologiczny: nr,
    nazwa_urzadzenia: `Test ${nr}`,
    opis_awarii: `${PREFIKS} awaria`,
    krytycznosc_skutku: "Niska",
    data_awarii: data,
    ...dodatkowe,
  });
  if (error) throw error;
}

async function propozycje(przegladId: string) {
  const { data, error } = await admin
    .from("przeglady_propozycje")
    .select("*")
    .eq("przeglad_id", przegladId)
    .order("created_at");
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  id = await przygotujKonta();
});

afterAll(async () => {
  await admin.from("awarie").delete().like("nr_technologiczny", `${PREFIKS}-%`);
  await admin.from("urzadzenia").delete().like("nr_technologiczny", `${PREFIKS}-%`);
});

describe("urządzenia", () => {
  it("pracownik nie widzi urządzenia proponowanego, technik widzi", async () => {
    const nr = await noweUrzadzenie("proponowane");
    const { data: p } = await (
      await jako("pracownik")
    )
      .from("urzadzenia")
      .select("nr_technologiczny")
      .eq("nr_technologiczny", nr);
    const { data: t } = await (
      await jako("technik")
    )
      .from("urzadzenia")
      .select("nr_technologiczny")
      .eq("nr_technologiczny", nr);
    expect(p).toEqual([]);
    expect(t).toHaveLength(1);
  });

  it("dodaje tylko admin", async () => {
    licznik += 1;
    const nr = `${PREFIKS}-${licznik}`;
    for (const k of ["technik", "kierownik"] as const) {
      const { error } = await (
        await jako(k)
      )
        .from("urzadzenia")
        .insert({ nr_technologiczny: `${nr}${k}`, nazwa_urzadzenia: "Nie wolno" });
      expect(error, k).not.toBeNull();
    }
    const { error } = await (
      await jako("admin")
    )
      .from("urzadzenia")
      .insert({ nr_technologiczny: nr, nazwa_urzadzenia: "Nowe urządzenie" });
    expect(error).toBeNull();
  });

  it("admin nie zmieni numeru technologicznego", async () => {
    const nr = await noweUrzadzenie();
    const { error } = await (
      await jako("admin")
    )
      .from("urzadzenia")
      .update({ nr_technologiczny: `${nr}X` })
      .eq("nr_technologiczny", nr);
    expect(error?.code).toBe("42501");
  });

  it("właściciel z konta wpisuje nazwisko do urządzenia", async () => {
    const nr = await noweUrzadzenie();
    const { data, error } = await (
      await jako("admin")
    )
      .from("urzadzenia")
      .update({ wlasciciel_id: id.technik })
      .eq("nr_technologiczny", nr)
      .select("wlasciciel_nazwa")
      .single();
    expect(error).toBeNull();
    expect(data?.wlasciciel_nazwa).toBe("Test technik");
  });

  it("aktywacja tworzy jeden pusty przegląd i nie dubluje go przy ponownej aktywacji", async () => {
    const nr = await noweUrzadzenie("proponowane");
    expect(await przegladUrzadzenia(nr)).toHaveLength(0);
    const adminK = await jako("admin");
    await adminK.from("urzadzenia").update({ status: "aktywne" }).eq("nr_technologiczny", nr);
    await adminK.from("urzadzenia").update({ status: "wycofane" }).eq("nr_technologiczny", nr);
    await adminK.from("urzadzenia").update({ status: "aktywne" }).eq("nr_technologiczny", nr);
    const przeglady = await przegladUrzadzenia(nr);
    expect(przeglady).toHaveLength(1);
    expect(przeglady[0]?.data_najblizszego).toBeNull();
  });
});

describe("przeglądy i wykonania", () => {
  it("pracownik nie czyta przeglądów, technik czyta", async () => {
    const nr = await noweUrzadzenie();
    const { data: p } = await (
      await jako("pracownik")
    )
      .from("przeglady")
      .select("id")
      .eq("nr_technologiczny", nr);
    const { data: t } = await (
      await jako("technik")
    )
      .from("przeglady")
      .select("id")
      .eq("nr_technologiczny", nr);
    expect(p).toEqual([]);
    expect(t).toHaveLength(1);
  });

  it("technik nie zmienia harmonogramu, kierownik zmienia", async () => {
    const nr = await noweUrzadzenie();
    const przegladId = await ustawPrzeglad(nr, { czestotliwosc_dni: 30 });
    const { data: t } = await (
      await jako("technik")
    )
      .from("przeglady")
      .update({ czestotliwosc_dni: 60 })
      .eq("id", przegladId)
      .select();
    expect(t).toEqual([]);
    const { data: k, error } = await (
      await jako("kierownik")
    )
      .from("przeglady")
      .update({ czestotliwosc_dni: 90 })
      .eq("id", przegladId)
      .select("czestotliwosc_dni")
      .single();
    expect(error).toBeNull();
    expect(k?.czestotliwosc_dni).toBe(90);
  });

  it("wykonanie ustawia daty i autora z konta", async () => {
    const nr = await noweUrzadzenie();
    const przegladId = await ustawPrzeglad(nr, { czestotliwosc_dni: 30 });
    const data = dodajDni(dzis(), -2);
    const { error } = await (await jako("technik")).from("przeglady_wykonania").insert({
      przeglad_id: przegladId,
      data_wykonania: data,
      autor_id: id.admin,
    });
    expect(error).toBeNull();
    const [p] = await przegladUrzadzenia(nr);
    expect(p?.data_ostatniego).toBe(data);
    expect(p?.data_najblizszego).toBe(dodajDni(data, 30));
    const { data: w } = await admin
      .from("przeglady_wykonania")
      .select("autor_id")
      .eq("przeglad_id", przegladId)
      .single();
    expect(w?.autor_id).toBe(id.technik);
  });

  it("odrzuca datę z przyszłości, nie cofa dat przy starszym wpisie, pracownik nie odnotuje", async () => {
    const nr = await noweUrzadzenie();
    const przegladId = await ustawPrzeglad(nr, { czestotliwosc_dni: 10 });
    const technik = await jako("technik");
    const { error: przyszla } = await technik
      .from("przeglady_wykonania")
      .insert({ przeglad_id: przegladId, data_wykonania: dodajDni(dzis(), 2) });
    expect(przyszla?.message).toContain("przyszłości");

    await technik
      .from("przeglady_wykonania")
      .insert({ przeglad_id: przegladId, data_wykonania: dzis() });
    await technik
      .from("przeglady_wykonania")
      .insert({ przeglad_id: przegladId, data_wykonania: dodajDni(dzis(), -20) });
    const [p] = await przegladUrzadzenia(nr);
    expect(p?.data_ostatniego).toBe(dzis());

    const { error: prac } = await (
      await jako("pracownik")
    )
      .from("przeglady_wykonania")
      .insert({ przeglad_id: przegladId, data_wykonania: dzis() });
    expect(prac).not.toBeNull();
  });
});

describe("propozycje przyspieszenia i progi", () => {
  it("3 awarie w 90 dni tworzą jedną propozycję z terminem dziś+7", async () => {
    const nr = await noweUrzadzenie();
    const przegladId = await ustawPrzeglad(nr, {
      czestotliwosc_dni: 90,
      data_najblizszego: dodajDni(dzis(), 30),
    });
    await wstawAwarie(nr, 50);
    await wstawAwarie(nr, 20);
    expect(await propozycje(przegladId)).toHaveLength(0);
    await wstawAwarie(nr, 1);
    await wstawAwarie(nr, 0);
    const lista = await propozycje(przegladId);
    expect(lista).toHaveLength(1);
    expect(lista[0]?.status).toBe("oczekuje");
    expect(lista[0]?.proponowany_termin).toBe(dodajDni(dzis(), 7));
  });

  it("przegląd opóźniony dostaje propozycję bez terminu", async () => {
    const nr = await noweUrzadzenie();
    const przegladId = await ustawPrzeglad(nr, { data_najblizszego: dodajDni(dzis(), -5) });
    await wstawAwarie(nr, 1, { krytycznosc_skutku: "Wysoka" });
    await wstawAwarie(nr, 2, { krytycznosc_skutku: "Wysoka" });
    const [p] = await propozycje(przegladId);
    expect(p?.proponowany_termin).toBeNull();
  });

  it("decyduje kierownik; kolejna propozycja dopiero po nowej awarii", async () => {
    const nr = await noweUrzadzenie();
    const przegladId = await ustawPrzeglad(nr, { data_najblizszego: dodajDni(dzis(), 40) });
    await wstawAwarie(nr, 3, { czas_przestoju_h: 9 });
    const [prop] = await propozycje(przegladId);
    if (!prop) throw new Error("Brak propozycji");

    const { error: bladTechnika } = await (
      await jako("technik")
    ).rpc("przeglady_decyzja", {
      p_propozycja_id: prop.id,
      p_zatwierdz: true,
    });
    expect(bladTechnika).not.toBeNull();

    const { error } = await (
      await jako("kierownik")
    ).rpc("przeglady_decyzja", {
      p_propozycja_id: prop.id,
      p_zatwierdz: true,
    });
    expect(error).toBeNull();
    const [po] = await propozycje(przegladId);
    expect(po?.status).toBe("zatwierdzona");
    expect(po?.decyzja_id).toBe(id.kierownik);
    const [p] = await przegladUrzadzenia(nr);
    expect(p?.data_najblizszego).toBe(dodajDni(dzis(), 7));

    // Zmiana istniejącej awarii (bez nowej) nie tworzy kolejnej propozycji.
    await admin.from("awarie").update({ czas_przestoju_h: 10 }).eq("nr_technologiczny", nr);
    expect(await propozycje(przegladId)).toHaveLength(1);
    await wstawAwarie(nr, 0);
    expect(await propozycje(przegladId)).toHaveLength(2);
  });

  it("statystyki progów widzi kierownik z flagą przekroczenia", async () => {
    const nr = await noweUrzadzenie();
    await wstawAwarie(nr, 1, { czas_przestoju_h: 8 });
    const { data, error } = await (await jako("kierownik")).rpc("statystyki_progow_urzadzen");
    expect(error).toBeNull();
    const wiersz = data?.find((w) => w.nr_technologiczny === nr);
    expect(wiersz?.przekracza).toBe(true);
    expect(Number(wiersz?.przestoj_30)).toBe(8);
  });
});

describe("numer z importu", () => {
  it("service-role zachowuje podany numer, a licznik roku rośnie do maksimum", async () => {
    const nr = await noweUrzadzenie();
    const rok = 2100 + Math.floor(Math.random() * 800);
    const { data: a, error } = await admin
      .from("awarie")
      .insert({
        nr_technologiczny: nr,
        nazwa_urzadzenia: "x",
        opis_awarii: `${PREFIKS} import`,
        krytycznosc_skutku: "Niska",
        data_awarii: `${rok}-03-01T12:00:00Z`,
        numer: `AWR-${rok}-050`,
      })
      .select("numer")
      .single();
    expect(error).toBeNull();
    expect(a?.numer).toBe(`AWR-${rok}-050`);
    const { data: b } = await admin
      .from("awarie")
      .insert({
        nr_technologiczny: nr,
        nazwa_urzadzenia: "x",
        opis_awarii: `${PREFIKS} po imporcie`,
        krytycznosc_skutku: "Niska",
        data_awarii: `${rok}-03-02T12:00:00Z`,
      })
      .select("numer")
      .single();
    expect(b?.numer).toBe(`AWR-${rok}-051`);
  });

  it("numer podany przez zalogowanego użytkownika jest ignorowany", async () => {
    const { error } = await (await jako("pracownik")).from("awarie").insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "x",
      opis_awarii: `${PREFIKS} numer od klienta`,
      krytycznosc_skutku: "Niska",
      numer: "AWR-1999-999",
    });
    expect(error).toBeNull();
    const { data } = await admin
      .from("awarie")
      .select("numer")
      .eq("opis_awarii", `${PREFIKS} numer od klienta`)
      .single();
    expect(data?.numer).not.toBe("AWR-1999-999");
    await admin.from("awarie").delete().eq("opis_awarii", `${PREFIKS} numer od klienta`);
  });
});

describe("anon", () => {
  it("nie czyta przeglądów, wykonań ani propozycji", async () => {
    const anon = klientAnon();
    for (const tabela of ["przeglady", "przeglady_wykonania", "przeglady_propozycje"] as const) {
      const { error } = await anon.from(tabela).select("*").limit(1);
      expect(error?.code, tabela).toBe("42501");
    }
  });
});

describe("poprawki po przeglądzie kodu", () => {
  it("wykonanie przeglądu zamyka oczekującą propozycję jako nieaktualną", async () => {
    const nr = await noweUrzadzenie();
    const przegladId = await ustawPrzeglad(nr, {
      czestotliwosc_dni: 30,
      data_najblizszego: dodajDni(dzis(), 40),
    });
    await wstawAwarie(nr, 1, { czas_przestoju_h: 9 });
    expect((await propozycje(przegladId))[0]?.status).toBe("oczekuje");
    const { error } = await (
      await jako("technik")
    )
      .from("przeglady_wykonania")
      .insert({ przeglad_id: przegladId, data_wykonania: dzis() });
    expect(error).toBeNull();
    const [p] = await propozycje(przegladId);
    expect(p?.status).toBe("nieaktualna");
    const [przeglad] = await przegladUrzadzenia(nr);
    expect(przeglad?.data_najblizszego).toBe(dodajDni(dzis(), 30));
  });

  it("zatwierdzenie liczy termin od dnia decyzji, nie od dnia utworzenia propozycji", async () => {
    const nr = await noweUrzadzenie();
    const przegladId = await ustawPrzeglad(nr, { data_najblizszego: dodajDni(dzis(), 40) });
    await wstawAwarie(nr, 1, { czas_przestoju_h: 9 });
    const [prop] = await propozycje(przegladId);
    if (!prop) throw new Error("Brak propozycji");
    // Propozycja „sprzed dwóch tygodni": termin z dnia utworzenia leży już w przeszłości.
    await admin
      .from("przeglady_propozycje")
      .update({ proponowany_termin: dodajDni(dzis(), -7) })
      .eq("id", prop.id);
    const { error } = await (
      await jako("kierownik")
    ).rpc("przeglady_decyzja", {
      p_propozycja_id: prop.id,
      p_zatwierdz: true,
    });
    expect(error).toBeNull();
    const [przeglad] = await przegladUrzadzenia(nr);
    expect(przeglad?.data_najblizszego).toBe(dodajDni(dzis(), 7));
  });
});

describe("poprawka po przeglądzie bezpieczeństwa", () => {
  it("wykonanie z datą wsteczną nie zamyka propozycji", async () => {
    const nr = await noweUrzadzenie();
    const przegladId = await ustawPrzeglad(nr, {
      czestotliwosc_dni: 30,
      data_ostatniego: dodajDni(dzis(), -5),
      data_najblizszego: dodajDni(dzis(), 40),
    });
    await wstawAwarie(nr, 1, { czas_przestoju_h: 9 });
    const { error } = await (
      await jako("technik")
    )
      .from("przeglady_wykonania")
      .insert({ przeglad_id: przegladId, data_wykonania: dodajDni(dzis(), -60) });
    expect(error).toBeNull();
    const [p] = await propozycje(przegladId);
    expect(p?.status).toBe("oczekuje");
  });
});
