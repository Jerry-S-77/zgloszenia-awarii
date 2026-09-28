import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  KONTA,
  klientAdmin,
  przygotujKonta,
  zalogujLinkiem,
  type KluczKonta,
} from "../wspolne/srodowisko";

// Importy z plików: urządzenia (admin), harmonogram (kierownik/admin), inwentaryzacja i dostawa
// (kierownik/admin). Każdy import to jedna transakcja — błąd w dowolnym wierszu cofa cały plik.
const PREFIKS = `TSTIMP${Date.now()}`;
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

async function przegladyUrzadzenia(nr: string) {
  const { data } = await admin
    .from("przeglady")
    .select("typ_czynnosci, czestotliwosc_dni, data_ostatniego, data_najblizszego, lista_kontrolna")
    .eq("nr_technologiczny", nr)
    .order("created_at");
  return data ?? [];
}

async function czesc(stan: number) {
  const numer = `${PREFIKS}-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await admin
    .from("magazyn_czesci")
    .insert({ numer_katalogowy: numer, nazwa: `Część ${numer}` })
    .select("id")
    .single();
  if (error) throw error;
  if (stan > 0) {
    const { error: blad } = await (
      await jako("kierownik")
    ).rpc("magazyn_przyjecie", { p_czesc: data.id, p_ilosc: stan });
    if (blad) throw blad;
  }
  return { id: data.id, numer };
}

async function stanCzesci(czescId: string) {
  const { data } = await admin.from("magazyn_czesci").select("stan").eq("id", czescId).single();
  return Number(data?.stan);
}

beforeAll(async () => {
  id = await przygotujKonta();
});

afterAll(async () => {
  await admin.from("powiadomienia").delete().like("tresc", `%${PREFIKS}%`);
  await admin.from("urzadzenia").delete().like("nr_technologiczny", `${PREFIKS}%`);
  await admin.from("magazyn_czesci").delete().like("numer_katalogowy", `${PREFIKS}%`);
});

describe("import urządzeń", () => {
  it("admin dodaje nowe (właściciel po e-mailu, aktywacja tworzy przegląd) i aktualizuje istniejące", async () => {
    const nr = `${PREFIKS}-U1`;
    const { data, error } = await (
      await jako("admin")
    ).rpc("urzadzenia_import", {
      p_wiersze: [
        {
          nr_technologiczny: nr,
          nazwa_urzadzenia: "Pompa testowa",
          krytycznosc: "Wysoka",
          wlasciciel_email: KONTA.technik.email.toUpperCase(),
          status: "aktywne",
        },
      ],
    });
    expect(error).toBeNull();
    expect(data).toEqual({ nowe: 1, zmienione: 0 });
    const { data: u } = await admin
      .from("urzadzenia")
      .select("status, krytycznosc, wlasciciel_id, wlasciciel_nazwa, lokalizacja")
      .eq("nr_technologiczny", nr)
      .single();
    expect(u).toMatchObject({
      status: "aktywne",
      krytycznosc: "Wysoka",
      wlasciciel_id: id.technik,
    });
    expect(u?.wlasciciel_nazwa).toBeTruthy();
    expect(await przegladyUrzadzenia(nr)).toHaveLength(1);

    // Aktualizacja: nowa nazwa i lokalizacja; puste pola (krytyczność, właściciel, status) bez zmian.
    const drugi = await (
      await jako("admin")
    ).rpc("urzadzenia_import", {
      p_wiersze: [
        { nr_technologiczny: nr, nazwa_urzadzenia: "Pompa po zmianie", lokalizacja: "Hala B" },
      ],
    });
    expect(drugi.data).toEqual({ nowe: 0, zmienione: 1 });
    const { data: po } = await admin
      .from("urzadzenia")
      .select("nazwa_urzadzenia, lokalizacja, krytycznosc, wlasciciel_id, status")
      .eq("nr_technologiczny", nr)
      .single();
    expect(po).toEqual({
      nazwa_urzadzenia: "Pompa po zmianie",
      lokalizacja: "Hala B",
      krytycznosc: "Wysoka",
      wlasciciel_id: id.technik,
      status: "aktywne",
    });
  });

  it("błąd w jednym wierszu cofa cały plik; kierownik nie importuje urządzeń", async () => {
    const { error } = await (
      await jako("admin")
    ).rpc("urzadzenia_import", {
      p_wiersze: [
        { nr_technologiczny: `${PREFIKS}-OK`, nazwa_urzadzenia: "Dobre", krytycznosc: "Niska" },
        {
          nr_technologiczny: `${PREFIKS}-ZLE`,
          nazwa_urzadzenia: "Złe",
          krytycznosc: "Niska",
          wlasciciel_email: "nie-ma-takiego@example.test",
        },
      ],
    });
    expect(error?.message).toContain("Wiersz 2: nie ma konta");
    const { data } = await admin
      .from("urzadzenia")
      .select("nr_technologiczny")
      .in("nr_technologiczny", [`${PREFIKS}-OK`, `${PREFIKS}-ZLE`]);
    expect(data).toEqual([]);

    const brakKryt = await (
      await jako("admin")
    ).rpc("urzadzenia_import", {
      p_wiersze: [{ nr_technologiczny: `${PREFIKS}-BK`, nazwa_urzadzenia: "Bez krytyczności" }],
    });
    expect(brakKryt.error?.message).toContain("wymaga krytyczności");

    const kierownik = await (await jako("kierownik")).rpc("urzadzenia_import", { p_wiersze: [] });
    expect(kierownik.error?.message).toContain("roli administratora");
  });
});

describe("import harmonogramu przeglądów", () => {
  it("wypełnia pusty przegląd z aktywacji, liczy termin, zapisuje listę; typ rozpoznany bez polskich znaków", async () => {
    const nr = `${PREFIKS}-P1`;
    await (
      await jako("admin")
    ).rpc("urzadzenia_import", {
      p_wiersze: [
        {
          nr_technologiczny: nr,
          nazwa_urzadzenia: "Urządzenie P1",
          krytycznosc: "Niska",
          status: "aktywne",
        },
      ],
    });
    const kierownik = await jako("kierownik");
    const { data, error } = await kierownik.rpc("przeglady_import", {
      p_wiersze: [
        {
          nr_technologiczny: nr,
          typ_czynnosci: "Przegląd okresowy",
          czestotliwosc_dni: 30,
          data_ostatniego: "2026-01-10",
          lista_kontrolna: ["Filtr", " Pasek "],
        },
      ],
    });
    expect(error).toBeNull();
    // Wypełniony pusty przegląd z aktywacji liczy się jako nowy (i nie powstaje drugi).
    expect(data).toEqual({ nowe: 1, zmienione: 0 });
    expect(await przegladyUrzadzenia(nr)).toEqual([
      {
        typ_czynnosci: "Przegląd okresowy",
        czestotliwosc_dni: 30,
        data_ostatniego: "2026-01-10",
        data_najblizszego: "2026-02-09",
        lista_kontrolna: ["Filtr", "Pasek"],
      },
    ]);

    // Ten sam typ zapisany inaczej = aktualizacja; nowa częstotliwość przelicza termin od zapisanej daty;
    // brak listy w pliku zostawia listę. Nowy typ = drugi przegląd.
    const drugi = await kierownik.rpc("przeglady_import", {
      p_wiersze: [
        { nr_technologiczny: nr, typ_czynnosci: "PRZEGLAD  okresowy", czestotliwosc_dni: 60 },
        { nr_technologiczny: nr, typ_czynnosci: "Kalibracja" },
      ],
    });
    expect(drugi.data).toEqual({ nowe: 1, zmienione: 1 });
    const po = await przegladyUrzadzenia(nr);
    expect(po).toHaveLength(2);
    expect(po[0]).toMatchObject({
      typ_czynnosci: "PRZEGLAD  okresowy",
      czestotliwosc_dni: 60,
      data_najblizszego: "2026-03-11",
      lista_kontrolna: ["Filtr", "Pasek"],
    });
    expect(po[1]).toMatchObject({ typ_czynnosci: "Kalibracja", data_najblizszego: null });
  });

  it("data z przyszłości albo nieznane urządzenie cofa cały plik; technik nie importuje", async () => {
    const nr = `${PREFIKS}-P2`;
    await (
      await jako("admin")
    ).rpc("urzadzenia_import", {
      p_wiersze: [
        { nr_technologiczny: nr, nazwa_urzadzenia: "Urządzenie P2", krytycznosc: "Niska" },
      ],
    });
    const kierownik = await jako("kierownik");
    const przyszlosc = await kierownik.rpc("przeglady_import", {
      p_wiersze: [
        { nr_technologiczny: nr, typ_czynnosci: "A" },
        { nr_technologiczny: nr, typ_czynnosci: "B", data_ostatniego: "2999-01-01" },
      ],
    });
    expect(przyszlosc.error?.message).toContain(
      "Wiersz 2: data ostatniego przeglądu nie może być z przyszłości",
    );
    const nieznane = await kierownik.rpc("przeglady_import", {
      p_wiersze: [{ nr_technologiczny: `${PREFIKS}-BRAK`, typ_czynnosci: "A" }],
    });
    expect(nieznane.error?.message).toContain("nie ma urządzenia");
    expect(await przegladyUrzadzenia(nr)).toEqual([]);

    const technik = await (await jako("technik")).rpc("przeglady_import", { p_wiersze: [] });
    expect(technik.error?.message).toContain("kierownika lub administratora");
  });
});

describe("inwentaryzacja i dostawa z pliku", () => {
  it("inwentaryzacja koryguje tylko różnice z powodem „Inwentaryzacja”", async () => {
    const a = await czesc(5);
    const b = await czesc(2);
    const { data, error } = await (
      await jako("kierownik")
    ).rpc("magazyn_inwentaryzacja", {
      p_wiersze: [
        { numer_katalogowy: a.numer, stan_faktyczny: 3, uwagi: "uszkodzone" },
        { numer_katalogowy: b.numer, stan_faktyczny: 2 },
      ],
    });
    expect(error).toBeNull();
    expect(data).toEqual({ zmienione: 1, bez_zmian: 1 });
    expect(await stanCzesci(a.id)).toBe(3);
    const { data: ruchy } = await admin
      .from("magazyn_ruchy")
      .select("typ, zmiana, uwagi")
      .eq("czesc_id", a.id)
      .eq("typ", "korekta");
    expect(ruchy?.map((r) => ({ ...r, zmiana: Number(r.zmiana) }))).toEqual([
      { typ: "korekta", zmiana: -2, uwagi: "Inwentaryzacja: uszkodzone" },
    ]);
  });

  it("dostawa przyjmuje każdą pozycję z numerem dokumentu; błąd cofa całą dostawę", async () => {
    const a = await czesc(1);
    const kierownik = await jako("kierownik");
    const { data, error } = await kierownik.rpc("magazyn_dostawa", {
      p_wiersze: [
        { numer_katalogowy: a.numer, ilosc: 2, dokument: "FV 1/2026" },
        { numer_katalogowy: a.numer, ilosc: 3 },
      ],
    });
    expect(error).toBeNull();
    expect(data).toEqual({ pozycje: 2 });
    expect(await stanCzesci(a.id)).toBe(6);
    const { data: ruchy } = await admin
      .from("magazyn_ruchy")
      .select("uwagi")
      .eq("czesc_id", a.id)
      .like("uwagi", "Dostawa%")
      .order("created_at");
    expect(ruchy?.map((r) => r.uwagi)).toEqual(["Dostawa FV 1/2026", "Dostawa"]);

    const zla = await kierownik.rpc("magazyn_dostawa", {
      p_wiersze: [
        { numer_katalogowy: a.numer, ilosc: 5 },
        { numer_katalogowy: `${PREFIKS}-nie-ma`, ilosc: 1 },
      ],
    });
    expect(zla.error?.message).toContain("Wiersz 2: nie ma w magazynie części");
    expect(await stanCzesci(a.id)).toBe(6);
  });

  it("ilości i stany z więcej niż 2 miejscami po przecinku oraz za długie uwagi są odrzucane", async () => {
    const a = await czesc(1);
    const kierownik = await jako("kierownik");
    const dostawa = await kierownik.rpc("magazyn_dostawa", {
      p_wiersze: [{ numer_katalogowy: a.numer, ilosc: 0.001 }],
    });
    expect(dostawa.error?.message).toContain("najwyżej 2 miejsca po przecinku");
    const stan = await kierownik.rpc("magazyn_inwentaryzacja", {
      p_wiersze: [{ numer_katalogowy: a.numer, stan_faktyczny: 1.005 }],
    });
    expect(stan.error?.message).toContain("najwyżej 2 miejsca po przecinku");
    const uwagi = await kierownik.rpc("magazyn_inwentaryzacja", {
      p_wiersze: [{ numer_katalogowy: a.numer, stan_faktyczny: 0, uwagi: "x".repeat(481) }],
    });
    expect(uwagi.error?.message).toContain("uwagi do 480 znaków");
    expect(await stanCzesci(a.id)).toBe(1);
  });

  it("technik nie robi inwentaryzacji ani dostawy", async () => {
    const technik = await jako("technik");
    const inw = await technik.rpc("magazyn_inwentaryzacja", { p_wiersze: [] });
    const dost = await technik.rpc("magazyn_dostawa", { p_wiersze: [] });
    expect(inw.error?.message).toContain("kierownika lub administratora");
    expect(dost.error?.message).toContain("kierownika lub administratora");
  });
});
