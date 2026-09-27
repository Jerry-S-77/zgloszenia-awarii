import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  KONTA,
  klientAdmin,
  przygotujKonta,
  zalogujLinkiem,
  type KluczKonta,
} from "../wspolne/srodowisko";

const PREFIKS = `TST-MAG-${Date.now()}`;
const ZNACZNIK = `TEST-MAG-${crypto.randomUUID()}`;
const admin = klientAdmin();
let id: Record<KluczKonta, string>;
const klienci = new Map<KluczKonta, Awaited<ReturnType<typeof zalogujLinkiem>>>();
let licznik = 0;

async function jako(k: KluczKonta) {
  const istniejacy = klienci.get(k);
  if (istniejacy) return istniejacy;
  const klient = await zalogujLinkiem(KONTA[k].email);
  klienci.set(k, klient);
  return klient;
}

async function nowaCzesc(stan = 0, stanMinimalny = 0) {
  licznik += 1;
  const { data, error } = await (
    await jako("kierownik")
  )
    .from("magazyn_czesci")
    .insert({
      numer_katalogowy: `${PREFIKS}-${licznik}`,
      nazwa: `Część testowa ${licznik}`,
      stan_minimalny: stanMinimalny,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (stan > 0) {
    const { error: blad } = await (
      await jako("kierownik")
    ).rpc("magazyn_przyjecie", {
      p_czesc: data.id,
      p_ilosc: stan,
    });
    if (blad) throw blad;
  }
  return data.id;
}

async function stan(czescId: string) {
  const { data } = await admin.from("magazyn_czesci").select("stan").eq("id", czescId).single();
  return Number(data?.stan);
}

async function nowaAwaria(zamknieta = false) {
  const { data, error } = await admin
    .from("awarie")
    .insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      opis_awarii: `${ZNACZNIK} ${crypto.randomUUID()}`,
      krytycznosc_skutku: "Niska",
      ...(zamknieta
        ? {
            status: "zamknieta" as const,
            przyczyna: "test",
            czas_przestoju_h: 1,
            kategoria_przyczyny: "inna" as const,
            data_zamkniecia: new Date().toISOString(),
          }
        : {}),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  id = await przygotujKonta();
});

afterAll(async () => {
  await admin.from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
  await admin.from("powiadomienia").delete().like("tresc", `%${PREFIKS}%`);
  const { error } = await admin
    .from("magazyn_czesci")
    .delete()
    .like("numer_katalogowy", `${PREFIKS}%`);
  if (error) throw error;
});

describe("katalog magazynu", () => {
  it("kierownik dodaje część, technik ją widzi, ale nie dodaje; pracownik nie widzi magazynu", async () => {
    const czesc = await nowaCzesc();
    const { data: widziTechnik } = await (
      await jako("technik")
    )
      .from("magazyn_czesci")
      .select("id")
      .eq("id", czesc);
    expect(widziTechnik).toHaveLength(1);
    const { error } = await (
      await jako("technik")
    )
      .from("magazyn_czesci")
      .insert({ numer_katalogowy: `${PREFIKS}-technik`, nazwa: "x" });
    expect(error?.code).toBe("42501");
    const { data: widziPracownik } = await (
      await jako("pracownik")
    )
      .from("magazyn_czesci")
      .select("id");
    expect(widziPracownik ?? []).toEqual([]);
  });

  it("stanu nie da się zmienić bezpośrednio, tylko przez przyjęcie lub korektę", async () => {
    const czesc = await nowaCzesc();
    const { error } = await (
      await jako("admin")
    )
      .from("magazyn_czesci")
      .update({ stan: 100 } as never)
      .eq("id", czesc);
    expect(error?.code).toBe("42501");
    expect(await stan(czesc)).toBe(0);
  });
});

describe("ruchy magazynowe", () => {
  it("przyjęcie (kierownik) zwiększa stan i zapisuje ruch; technik nie przyjmuje dostaw", async () => {
    const czesc = await nowaCzesc();
    const { data, error } = await (
      await jako("kierownik")
    ).rpc("magazyn_przyjecie", {
      p_czesc: czesc,
      p_ilosc: 12,
      p_uwagi: "Dostawa FV 1/2026",
    });
    expect(error).toBeNull();
    expect(Number(data)).toBe(12);
    const { data: ruchy } = await admin
      .from("magazyn_ruchy")
      .select("typ, zmiana, stan_po, autor_id")
      .eq("czesc_id", czesc);
    expect(ruchy).toEqual([{ typ: "przyjecie", zmiana: 12, stan_po: 12, autor_id: id.kierownik }]);
    const technik = await (
      await jako("technik")
    ).rpc("magazyn_przyjecie", {
      p_czesc: czesc,
      p_ilosc: 1,
    });
    expect(technik.error?.message).toContain("kierownika lub administratora");
  });

  it("korekta wymaga powodu i ustawia stan faktyczny", async () => {
    const czesc = await nowaCzesc(10);
    const kierownik = await jako("kierownik");
    const bez = await kierownik.rpc("magazyn_korekta", {
      p_czesc: czesc,
      p_nowy_stan: 7,
      p_uwagi: " ",
    });
    expect(bez.error?.message).toContain("powód");
    await kierownik.rpc("magazyn_korekta", {
      p_czesc: czesc,
      p_nowy_stan: 7,
      p_uwagi: "Inwentaryzacja",
    });
    expect(await stan(czesc)).toBe(7);
  });

  it("technik pobiera część do otwartej awarii: stan maleje, część trafia do awarii jako dostarczona", async () => {
    const czesc = await nowaCzesc(5);
    const awaria = await nowaAwaria();
    const { error } = await (
      await jako("technik")
    ).rpc("magazyn_pobierz_do_awarii", {
      p_czesc: czesc,
      p_awaria: awaria,
      p_ilosc: 2,
    });
    expect(error).toBeNull();
    expect(await stan(czesc)).toBe(3);
    const { data: czesci } = await admin
      .from("awarie_czesci")
      .select("status, ilosc, magazyn_czesc_id, autor_id")
      .eq("awaria_id", awaria);
    expect(czesci).toEqual([
      { status: "dostarczona", ilosc: 2, magazyn_czesc_id: czesc, autor_id: id.technik },
    ]);
  });

  it("nie da się pobrać więcej niż na stanie ani do zamkniętej awarii; pracownik nie pobiera", async () => {
    const czesc = await nowaCzesc(1);
    const technik = await jako("technik");
    const zaDuzo = await technik.rpc("magazyn_pobierz_do_awarii", {
      p_czesc: czesc,
      p_awaria: await nowaAwaria(),
      p_ilosc: 2,
    });
    expect(zaDuzo.error?.message).toContain("Za mało na stanie");
    const zamknieta = await technik.rpc("magazyn_pobierz_do_awarii", {
      p_czesc: czesc,
      p_awaria: await nowaAwaria(true),
      p_ilosc: 1,
    });
    expect(zamknieta.error?.message).toContain("zamknięta");
    const pracownik = await (
      await jako("pracownik")
    ).rpc("magazyn_pobierz_do_awarii", {
      p_czesc: czesc,
      p_awaria: await nowaAwaria(),
      p_ilosc: 1,
    });
    expect(pracownik.error).not.toBeNull();
    expect(await stan(czesc)).toBe(1);
  });

  it("spadek poniżej minimum powiadamia kierownika i admina raz, a nie przy każdym kolejnym pobraniu", async () => {
    const czesc = await nowaCzesc(6, 5);
    const technik = await jako("technik");
    await technik.rpc("magazyn_pobierz_do_awarii", {
      p_czesc: czesc,
      p_awaria: await nowaAwaria(),
      p_ilosc: 2,
    });
    await technik.rpc("magazyn_pobierz_do_awarii", {
      p_czesc: czesc,
      p_awaria: await nowaAwaria(),
      p_ilosc: 1,
    });
    const { data: ruchy } = await admin.from("magazyn_ruchy").select("id").eq("czesc_id", czesc);
    const { data: powiadomienia } = await admin
      .from("powiadomienia")
      .select("uzytkownik_id")
      .eq("typ", "niski_stan")
      .in(
        "klucz",
        (ruchy ?? []).map((r) => `stan:${r.id}`),
      );
    const adresaci = (powiadomienia ?? []).map((p) => p.uzytkownik_id);
    expect(adresaci).toContain(id.kierownik);
    expect(adresaci).toContain(id.admin);
    expect(adresaci.filter((a) => a === id.kierownik)).toHaveLength(1);
    const { data: tresc } = await admin
      .from("powiadomienia")
      .select("tresc")
      .eq("uzytkownik_id", id.kierownik)
      .in(
        "klucz",
        (ruchy ?? []).map((r) => `stan:${r.id}`),
      )
      .single();
    expect(tresc?.tresc).toMatch(/zostało 4 szt\., minimum 5$/);
  });
});

describe("import katalogu", () => {
  it("dodaje nowe części ze stanem początkowym i przypisaniem do urządzeń, aktualizuje istniejące", async () => {
    const istniejaca = await nowaCzesc(4);
    const { data: wiersz } = await admin
      .from("magazyn_czesci")
      .select("numer_katalogowy")
      .eq("id", istniejaca)
      .single();
    const { data, error } = await (
      await jako("kierownik")
    ).rpc("magazyn_import", {
      p_wiersze: [
        {
          numer_katalogowy: `${PREFIKS}-imp`,
          nazwa: "Filtr HEPA H14",
          jednostka: "szt.",
          stan_minimalny: 2,
          stan_poczatkowy: 10,
          urzadzenia: ["HVAC-01"],
          krytyczna: true,
        },
        { numer_katalogowy: wiersz?.numer_katalogowy, nazwa: "Nowa nazwa", stan_poczatkowy: 99 },
      ],
    });
    expect(error).toBeNull();
    expect(data).toEqual({ nowe: 1, zmienione: 1 });
    const { data: nowa } = await admin
      .from("magazyn_czesci")
      .select("id, stan, urzadzenia_czesci(nr_technologiczny, krytyczna)")
      .eq("numer_katalogowy", `${PREFIKS}-imp`)
      .single();
    expect(Number(nowa?.stan)).toBe(10);
    expect(nowa?.urzadzenia_czesci).toEqual([{ nr_technologiczny: "HVAC-01", krytyczna: true }]);
    // Istniejąca: nowa nazwa, ale stan bez zmian (stan początkowy dotyczy tylko nowych części).
    expect(await stan(istniejaca)).toBe(4);
  });

  it("błąd w jednym wierszu (nieznane urządzenie) cofa cały import; technik nie importuje", async () => {
    const kierownik = await jako("kierownik");
    const { error } = await kierownik.rpc("magazyn_import", {
      p_wiersze: [
        { numer_katalogowy: `${PREFIKS}-ok`, nazwa: "OK" },
        { numer_katalogowy: `${PREFIKS}-zle`, nazwa: "Złe", urzadzenia: ["NIE-MA-TAKIEGO"] },
      ],
    });
    expect(error?.message).toContain("nie ma urządzenia NIE-MA-TAKIEGO");
    const { data } = await admin
      .from("magazyn_czesci")
      .select("id")
      .in("numer_katalogowy", [`${PREFIKS}-ok`, `${PREFIKS}-zle`]);
    expect(data).toEqual([]);
    const technik = await (await jako("technik")).rpc("magazyn_import", { p_wiersze: [] });
    expect(technik.error?.message).toContain("kierownika lub administratora");
  });
});
