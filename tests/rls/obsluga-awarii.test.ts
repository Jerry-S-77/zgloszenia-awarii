import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  KONTA,
  klientAdmin,
  przygotujKonta,
  zalogujLinkiem,
  type KluczKonta,
} from "../wspolne/srodowisko";

const ZNACZNIK = `TEST-ETAP2-${crypto.randomUUID()}`;
const admin = klientAdmin();
let id: Record<KluczKonta, string>;

type StatusTestowy = "zgloszona" | "przyjeta" | "w_naprawie" | "oczekuje_na_czesc" | "zamknieta";

async function wstaw(
  status: StatusTestowy,
  nazwa: string,
  dodatkowe: Record<string, unknown> = {},
) {
  const rekord = {
    id: crypto.randomUUID(),
    nr_technologiczny: "HVAC-01",
    nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
    opis_awarii: `${ZNACZNIK} ${nazwa}`,
    krytycznosc_skutku: "Niska",
    status,
    zglaszajacy_id: id.pracownik,
    zglaszajacy_nazwa: "Test pracownik",
    ...dodatkowe,
  };
  const { data, error } = await admin
    .from("awarie")
    .insert(rekord)
    .select("id, numer, wersja")
    .single();
  if (error) throw error;
  return data as { id: string; numer: string | null; wersja: number };
}

beforeAll(async () => {
  id = await przygotujKonta();
});

afterAll(async () => {
  await admin.from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
});

describe("numeracja i wersja przy wstawieniu", () => {
  it("nadaje numer w formacie AWR-ROK-NNN i wersję 1", async () => {
    const a = await wstaw("zgloszona", "numeracja 1");
    const rok = new Date().getFullYear();
    expect(a.numer).toMatch(new RegExp(`^AWR-${rok}-\\d{3}$`));
    expect(a.wersja).toBe(1);
  });
  it("kolejne zgłoszenia dostają rosnące numery", async () => {
    const pierwsza = await wstaw("zgloszona", "numeracja 2");
    const druga = await wstaw("zgloszona", "numeracja 3");
    const nr = (n: typeof pierwsza) => Number(n.numer?.split("-")[2]);
    expect(nr(druga)).toBe(nr(pierwsza) + 1);
  });
});

describe("przejścia statusu", () => {
  it("technik przyjmuje zgłoszoną awarię (zgloszona -> przyjeta), wersja rośnie", async () => {
    const a = await wstaw("zgloszona", "przejscie ok");
    const technik = await zalogujLinkiem(KONTA.technik.email);
    const { data, error } = await technik
      .from("awarie")
      .update({ status: "przyjeta" })
      .eq("id", a.id)
      .eq("wersja", a.wersja)
      .select("status, wersja")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("przyjeta");
    expect(data?.wersja).toBe(2);
  });

  it("odrzuca niedozwolone przejście (zgloszona -> w_naprawie)", async () => {
    const a = await wstaw("zgloszona", "przejscie zle");
    const technik = await zalogujLinkiem(KONTA.technik.email);
    const { error } = await technik
      .from("awarie")
      .update({ status: "w_naprawie" })
      .eq("id", a.id)
      .eq("wersja", a.wersja);
    expect(error?.message).toContain("Niedozwolone przejście");
  });

  it("pracownik nie zmienia statusu", async () => {
    const a = await wstaw("zgloszona", "pracownik brak praw");
    const pracownik = await zalogujLinkiem(KONTA.pracownik.email);
    const { data } = await pracownik
      .from("awarie")
      .update({ status: "przyjeta" })
      .eq("id", a.id)
      .select();
    expect(data).toEqual([]);
  });

  it("ponowne otwarcie zamkniętej wymaga kierownika lub admina", async () => {
    const a = await wstaw("zamknieta", "reopen", {
      przyczyna: "test",
      czas_przestoju_h: 1,
      data_zamkniecia: new Date().toISOString(),
    });
    const technik = await zalogujLinkiem(KONTA.technik.email);
    const { error: bladTechnika } = await technik
      .from("awarie")
      .update({ status: "w_naprawie" })
      .eq("id", a.id)
      .eq("wersja", a.wersja);
    expect(bladTechnika?.message).toContain("kierownika");

    const kierownik = await zalogujLinkiem(KONTA.kierownik.email);
    const { data, error } = await kierownik
      .from("awarie")
      .update({ status: "w_naprawie" })
      .eq("id", a.id)
      .eq("wersja", a.wersja)
      .select("status")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("w_naprawie");
  });

  it("zamknięcie bez przyczyny lub czasu zamknięcia jest odrzucane", async () => {
    const a = await wstaw("w_naprawie", "zamkniecie bez danych");
    const technik = await zalogujLinkiem(KONTA.technik.email);
    const { error } = await technik
      .from("awarie")
      .update({ status: "zamknieta" })
      .eq("id", a.id)
      .eq("wersja", a.wersja);
    expect(error?.message).toContain("przyczyny");
  });
});

describe("konflikt wersji", () => {
  it("zapis z nieaktualną wersją zmienia 0 wierszy zamiast nadpisać", async () => {
    const a = await wstaw("zgloszona", "konflikt wersji");
    const technik = await zalogujLinkiem(KONTA.technik.email);
    await technik
      .from("awarie")
      .update({ status: "przyjeta" })
      .eq("id", a.id)
      .eq("wersja", a.wersja);
    const { data } = await technik
      .from("awarie")
      .update({ status: "w_naprawie" })
      .eq("id", a.id)
      .eq("wersja", a.wersja) // baza jest już na wersji 2
      .select();
    expect(data).toEqual([]);
  });
});

describe("historia", () => {
  it("utworzenie i zmiana statusu zapisują wpisy historii, autor z konta", async () => {
    const a = await wstaw("zgloszona", "historia");
    const technik = await zalogujLinkiem(KONTA.technik.email);
    await technik
      .from("awarie")
      .update({ status: "przyjeta" })
      .eq("id", a.id)
      .eq("wersja", a.wersja);
    const { data, error } = await admin
      .from("awarie_historia")
      .select("typ, autor_id, dane")
      .eq("awaria_id", a.id)
      .order("created_at");
    expect(error).toBeNull();
    expect(data?.map((w) => w.typ)).toEqual(["utworzenie", "zmiana_statusu"]);
    expect(data?.[1]?.autor_id).toBe(id.technik);
    expect(data?.[1]?.dane).toMatchObject({ z: "zgloszona", na: "przyjeta" });
  });
  it("pracownik czyta historię własnej awarii, ale nie cudzej", async () => {
    const a = await wstaw("zgloszona", "historia widocznosc");
    const pracownik = await zalogujLinkiem(KONTA.pracownik.email);
    const { data: wlasna } = await pracownik
      .from("awarie_historia")
      .select("id")
      .eq("awaria_id", a.id);
    expect((wlasna ?? []).length).toBeGreaterThan(0);

    const cudza = await wstaw("zgloszona", "historia cudza", { zglaszajacy_id: id.pracownik2 });
    const { data: obca } = await pracownik
      .from("awarie_historia")
      .select("id")
      .eq("awaria_id", cudza.id);
    expect(obca).toEqual([]);
  });
  it("nikt nie wstawia ani nie zmienia historii bezpośrednio", async () => {
    const a = await wstaw("zgloszona", "historia bez ingerencji");
    const technik = await zalogujLinkiem(KONTA.technik.email);
    const { error } = await technik
      .from("awarie_historia")
      .insert({ awaria_id: a.id, typ: "edycja", dane: {} });
    expect(error?.code).toBe("42501");
  });
});

describe("numer niezmienny", () => {
  it("UPDATE nie zmienia numeru nadanego przy wstawieniu, nawet gdy klient próbuje go podmienić", async () => {
    const a = await wstaw("zgloszona", "numer niezmienny");
    const technik = await zalogujLinkiem(KONTA.technik.email);
    const { data, error } = await technik
      .from("awarie")
      .update({ status: "przyjeta", numer: "AWR-2099-999" })
      .eq("id", a.id)
      .eq("wersja", a.wersja)
      .select("numer")
      .single();
    expect(error).toBeNull();
    expect(data?.numer).toBe(a.numer);
  });
});

describe("komentarze", () => {
  it("zgłaszający dodaje komentarz do własnej awarii, autor z konta", async () => {
    const a = await wstaw("zgloszona", "komentarz wlasny");
    const pracownik = await zalogujLinkiem(KONTA.pracownik.email);
    const { data, error } = await pracownik
      .from("awarie_komentarze")
      .insert({ awaria_id: a.id, tresc: "Nadal awaria." })
      .select("autor_id, tresc")
      .single();
    expect(error).toBeNull();
    expect(data?.autor_id).toBe(id.pracownik);
  });
  it("pracownik nie komentuje cudzej awarii, technik może", async () => {
    const cudza = await wstaw("zgloszona", "komentarz cudzy", { zglaszajacy_id: id.pracownik2 });
    const pracownik = await zalogujLinkiem(KONTA.pracownik.email);
    const { error: bladPracownika } = await pracownik
      .from("awarie_komentarze")
      .insert({ awaria_id: cudza.id, tresc: "Nie moje." });
    expect(bladPracownika?.code).toBe("42501");

    const technik = await zalogujLinkiem(KONTA.technik.email);
    const { error } = await technik
      .from("awarie_komentarze")
      .insert({ awaria_id: cudza.id, tresc: "Przyjmuję zgłoszenie." });
    expect(error).toBeNull();
  });
  it("pusty komentarz jest odrzucany", async () => {
    const a = await wstaw("zgloszona", "komentarz pusty");
    const technik = await zalogujLinkiem(KONTA.technik.email);
    const { error } = await technik
      .from("awarie_komentarze")
      .insert({ awaria_id: a.id, tresc: "   " });
    expect(error).not.toBeNull();
  });
});
