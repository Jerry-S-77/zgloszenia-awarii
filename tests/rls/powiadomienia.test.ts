import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  KONTA,
  klientAdmin,
  przygotujKonta,
  zalogujLinkiem,
  type KluczKonta,
} from "../wspolne/srodowisko";

const ZNACZNIK = `TEST-E4-${crypto.randomUUID().slice(0, 8)}`;
const NR = `T4${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
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

function dzis(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());
}
function dodajDni(data: string, dni: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dni);
  return d.toISOString().slice(0, 10);
}

async function powiadomieniaAwarii(awariaId: string) {
  const { data, error } = await admin
    .from("powiadomienia")
    .select("uzytkownik_id, typ, krytyczne, tresc")
    .eq("awaria_id", awariaId);
  if (error) throw error;
  return data;
}

async function zglosJakoPracownik(krytycznosc: "Niska" | "Wysoka") {
  const { data, error } = await (
    await jako("pracownik")
  )
    .from("awarie")
    .insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      opis_awarii: `${ZNACZNIK} ${crypto.randomUUID()}`,
      krytycznosc_skutku: krytycznosc,
    })
    .select("id, wersja")
    .single();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  id = await przygotujKonta();
  const { error } = await admin.from("urzadzenia").upsert(
    {
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      status: "aktywne",
    },
    { onConflict: "nr_technologiczny" },
  );
  if (error) throw error;
});

afterAll(async () => {
  await admin.from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
  await admin.from("awarie").delete().like("nr_technologiczny", `${NR}%`);
  await admin.from("urzadzenia").delete().like("nr_technologiczny", `${NR}%`);
});

describe("nowa awaria", () => {
  it("technicy i kierownicy dostają powiadomienie, krytyczne dla „Wysoka”; zgłaszający nie", async () => {
    const a = await zglosJakoPracownik("Wysoka");
    const lista = await powiadomieniaAwarii(a.id);
    const adresaci = lista.map((p) => p.uzytkownik_id);
    expect(adresaci).toContain(id.technik);
    expect(adresaci).toContain(id.kierownik);
    expect(adresaci).not.toContain(id.pracownik);
    expect(adresaci).not.toContain(id.zablokowany);
    const technika = lista.find((p) => p.uzytkownik_id === id.technik);
    expect(technika?.typ).toBe("nowa_awaria");
    expect(technika?.krytyczne).toBe(true);
    expect(technika?.tresc).toContain("Krytyczna awaria");
  });
});

describe("uprawnienia do powiadomień", () => {
  it("każdy czyta tylko własne, oznacza jako przeczytane, ale nie zmienia treści ani nie dodaje", async () => {
    const a = await zglosJakoPracownik("Niska");
    const technik = await jako("technik");
    const { data: wlasne } = await technik.from("powiadomienia").select("id, uzytkownik_id");
    expect(wlasne?.length).toBeGreaterThan(0);
    expect(new Set(wlasne?.map((p) => p.uzytkownik_id))).toEqual(new Set([id.technik]));

    const moje = (await powiadomieniaAwarii(a.id)).find((p) => p.uzytkownik_id === id.technik);
    expect(moje).toBeDefined();
    const { data: wiersz } = await admin
      .from("powiadomienia")
      .select("id")
      .eq("awaria_id", a.id)
      .eq("uzytkownik_id", id.technik)
      .single();
    const { error: bladPrzeczytania } = await technik
      .from("powiadomienia")
      .update({ przeczytane: true })
      .eq("id", wiersz!.id);
    expect(bladPrzeczytania).toBeNull();
    const { error: bladTresci } = await technik
      .from("powiadomienia")
      .update({ tresc: "podmiana" })
      .eq("id", wiersz!.id);
    expect(bladTresci?.code).toBe("42501");
    const { error: bladWstawienia } = await technik.from("powiadomienia").insert({
      uzytkownik_id: id.technik,
      typ: "nowa_awaria",
      tresc: "falszywe",
    });
    expect(bladWstawienia).not.toBeNull();
  });
});

describe("zmiana statusu i zespół", () => {
  it("przyjęcie zgłoszenia powiadamia zgłaszającego", async () => {
    const a = await zglosJakoPracownik("Niska");
    await (
      await jako("technik")
    )
      .from("awarie")
      .update({ status: "przyjeta" })
      .eq("id", a.id)
      .eq("wersja", a.wersja);
    const lista = await powiadomieniaAwarii(a.id);
    const dlaZglaszajacego = lista.find(
      (p) => p.uzytkownik_id === id.pracownik && p.typ === "zmiana_statusu",
    );
    expect(dlaZglaszajacego?.tresc).toContain("przyjęte");
  });

  it("dodanie do zespołu przez kierownika powiadamia; samodzielne dołączenie nie", async () => {
    const a = await zglosJakoPracownik("Niska");
    await (
      await jako("kierownik")
    )
      .from("awarie_zespol")
      .insert({ awaria_id: a.id, uzytkownik_id: id.technik });
    await (
      await jako("kierownik")
    )
      .from("awarie_zespol")
      .insert({ awaria_id: a.id, uzytkownik_id: id.kierownik });
    const lista = await powiadomieniaAwarii(a.id);
    expect(lista.filter((p) => p.typ === "przydzielenie").map((p) => p.uzytkownik_id)).toEqual([
      id.technik,
    ]);
  });
});

describe("przeglądy", () => {
  it("propozycja przyspieszenia trafia do właściciela urządzenia i kierowników", async () => {
    const nr = `${NR}-P`;
    await admin.from("urzadzenia").insert({
      nr_technologiczny: nr,
      nazwa_urzadzenia: "Test E4",
      status: "aktywne",
      wlasciciel_id: id.technik,
    });
    const { data: przeglad } = await admin
      .from("przeglady")
      .update({ data_najblizszego: dodajDni(dzis(), 40) })
      .eq("nr_technologiczny", nr)
      .select("id")
      .single();
    await admin.from("awarie").insert({
      nr_technologiczny: nr,
      nazwa_urzadzenia: "Test E4",
      opis_awarii: `${ZNACZNIK} przestój`,
      krytycznosc_skutku: "Niska",
      czas_przestoju_h: 9,
      data_awarii: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const { data } = await admin
      .from("powiadomienia")
      .select("uzytkownik_id, typ")
      .eq("przeglad_id", przeglad!.id)
      .eq("typ", "propozycja_przegladu");
    const adresaci = (data ?? []).map((p) => p.uzytkownik_id);
    expect(adresaci).toContain(id.technik);
    expect(adresaci).toContain(id.kierownik);
    expect(adresaci).not.toContain(id.pracownik);
  });

  it("codzienne przypomnienia: wkrótce i opóźniony, bez duplikatów przy drugim uruchomieniu", async () => {
    const wkrotce = `${NR}-W`;
    const opozniony = `${NR}-O`;
    for (const nr of [wkrotce, opozniony]) {
      await admin
        .from("urzadzenia")
        .insert({ nr_technologiczny: nr, nazwa_urzadzenia: "Test E4", status: "aktywne" });
    }
    await admin
      .from("przeglady")
      .update({ data_najblizszego: dodajDni(dzis(), 3) })
      .eq("nr_technologiczny", wkrotce);
    await admin
      .from("przeglady")
      .update({ data_najblizszego: dodajDni(dzis(), -2) })
      .eq("nr_technologiczny", opozniony);

    for (let i = 0; i < 2; i++) {
      const { error } = await admin.rpc("powiadomienia_przegladow");
      expect(error).toBeNull();
    }
    const { data } = await admin
      .from("powiadomienia")
      .select("typ, przeglady!inner(nr_technologiczny)")
      .eq("uzytkownik_id", id.kierownik)
      .like("przeglady.nr_technologiczny", `${NR}-%`)
      .in("typ", ["przeglad_wkrotce", "przeglad_opozniony"]);
    const typy = (data ?? []).map((p) => p.typ).sort();
    expect(typy).toEqual(["przeglad_opozniony", "przeglad_wkrotce"]);
  });
});
