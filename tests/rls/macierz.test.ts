import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  KONTA,
  klientAdmin,
  klientAnon,
  przygotujKonta,
  zaloguj,
  zalogujLinkiem,
  type KluczKonta,
} from "../wspolne/srodowisko";

const ZNACZNIK = `TEST-RLS-${crypto.randomUUID()}`;
const admin = klientAdmin();
let id: Record<KluczKonta, string>;
let awariaPracownika: string;
let awariaPracownika2: string;

async function wstaw(zglaszajacy: string, nazwa: string): Promise<string> {
  const rekord = {
    id: crypto.randomUUID(),
    nr_technologiczny: "HVAC-01",
    nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
    opis_awarii: `${ZNACZNIK} ${nazwa}`,
    krytycznosc_skutku: "Niska",
    status: "zgloszona",
    zglaszajacy_id: zglaszajacy,
    zglaszajacy_nazwa: nazwa,
  };
  const { error } = await admin.from("awarie").insert(rekord);
  if (error) throw error;
  return rekord.id;
}

beforeAll(async () => {
  id = await przygotujKonta();
  awariaPracownika = await wstaw(id.pracownik, "Test pracownik");
  awariaPracownika2 = await wstaw(id.pracownik2, "Test pracownik2");
});

afterAll(async () => {
  await admin.from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
});

const moje = (k: Awaited<ReturnType<typeof zaloguj>>) =>
  k.from("awarie").select("id").like("opis_awarii", `${ZNACZNIK}%`);

describe("anon", () => {
  it("nie ma dostępu do awarii, urządzeń ani profili", async () => {
    const anon = klientAnon();
    for (const tabela of ["awarie", "urzadzenia", "profiles"] as const) {
      const { error } = await anon.from(tabela).select("*").limit(1);
      expect(error?.code, tabela).toBe("42501");
    }
  });
  it("nie może zgłosić awarii", async () => {
    const { error } = await klientAnon()
      .from("awarie")
      .insert({
        nr_technologiczny: "HVAC-01",
        nazwa_urzadzenia: "x",
        opis_awarii: `${ZNACZNIK} anon`,
        krytycznosc_skutku: "Niska",
      });
    expect(error?.code).toBe("42501");
  });
  it("nie może wywołać funkcji moja_rola", async () => {
    const { error } = await klientAnon().rpc("moja_rola");
    expect(error?.code).toBe("42501");
  });
  it("nie może się zarejestrować (publiczna rejestracja wyłączona)", async () => {
    const { error } = await klientAnon().auth.signUp({
      email: `rejestracja-${crypto.randomUUID()}@example.test`,
      password: "Test-Haslo-12345!",
    });
    expect(error).not.toBeNull();
  });
});

describe("pracownik", () => {
  it("widzi tylko własne zgłoszenia", async () => {
    const k = await zaloguj(KONTA.pracownik.email);
    const { data } = await moje(k);
    expect(data?.map((r) => r.id)).toEqual([awariaPracownika]);
  });
  it("zgłasza awarię, a autor jest ustawiany z konta (podmiana ignorowana)", async () => {
    const k = await zaloguj(KONTA.pracownik.email);
    const { data, error } = await k
      .from("awarie")
      .insert({
        nr_technologiczny: "HVAC-01",
        nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
        opis_awarii: `${ZNACZNIK} podmiana autora`,
        krytycznosc_skutku: "Niska",
        zglaszajacy_id: id.pracownik2,
        zglaszajacy_nazwa: "Ktoś Inny",
      })
      .select("id, zglaszajacy_id, zglaszajacy_nazwa")
      .single();
    expect(error).toBeNull();
    expect(data?.zglaszajacy_id).toBe(id.pracownik);
    expect(data?.zglaszajacy_nazwa).toBe("Test pracownik");
  });
  it("nie może zmieniać zgłoszeń", async () => {
    const k = await zaloguj(KONTA.pracownik.email);
    const { data } = await k
      .from("awarie")
      .update({ status: "zamknieta" })
      .eq("id", awariaPracownika)
      .select();
    expect(data).toEqual([]);
    const { data: po } = await admin
      .from("awarie")
      .select("status")
      .eq("id", awariaPracownika)
      .single();
    expect(po?.status).toBe("zgloszona");
  });
  it("czyta tylko własny profil i nie zmieni sobie roli", async () => {
    const k = await zaloguj(KONTA.pracownik.email);
    const { data } = await k.from("profiles").select("id");
    expect(data?.map((p) => p.id)).toEqual([id.pracownik]);
    const { error } = await k.from("profiles").update({ rola: "admin" }).eq("id", id.pracownik);
    expect(error?.code).toBe("42501");
  });
  it("czyta urządzenia, ale ich nie dodaje", async () => {
    const k = await zaloguj(KONTA.pracownik.email);
    const { data } = await k.from("urzadzenia").select("nr_technologiczny");
    expect((data ?? []).length).toBeGreaterThan(0);
    const { error } = await k
      .from("urzadzenia")
      .insert({ nr_technologiczny: "X-99", nazwa_urzadzenia: "x" });
    expect(error?.code).toBe("42501");
  });
  it("nie może zgłosić awarii od razu zamkniętej", async () => {
    const k = await zaloguj(KONTA.pracownik.email);
    const { error } = await k.from("awarie").insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "x",
      opis_awarii: `${ZNACZNIK} zamknieta od razu`,
      krytycznosc_skutku: "Niska",
      status: "zamknieta",
    });
    expect(error?.code).toBe("42501");
  });
  it("nie może wpisać czasu przestoju przy zgłoszeniu", async () => {
    const k = await zaloguj(KONTA.pracownik.email);
    const { error } = await k.from("awarie").insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "x",
      opis_awarii: `${ZNACZNIK} przestoj`,
      krytycznosc_skutku: "Niska",
      status: "zgloszona",
      czas_przestoju_h: 3,
    });
    expect(error?.code).toBe("42501");
  });
  it("zgłasza zwykłą otwartą awarię (kontrola regresji)", async () => {
    const k = await zaloguj(KONTA.pracownik.email);
    const { error } = await k.from("awarie").insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "x",
      opis_awarii: `${ZNACZNIK} zwykla otwarta`,
      krytycznosc_skutku: "Niska",
      status: "zgloszona",
      data_zamkniecia: null,
      przyczyna: null,
      czas_przestoju_h: null,
    });
    expect(error).toBeNull();
    await admin.from("awarie").delete().eq("opis_awarii", `${ZNACZNIK} zwykla otwarta`);
  });
  it("upsert własnego istniejącego zgłoszenia jest odrzucany (kształt z kolejki offline)", async () => {
    const k = await zaloguj(KONTA.pracownik.email);
    const { error } = await k.from("awarie").upsert({
      id: awariaPracownika,
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      opis_awarii: `${ZNACZNIK} ZMIENIONE upsertem`,
      krytycznosc_skutku: "Wysoka",
      status: "zgloszona",
    });
    expect(error?.code).toBe("42501");
    const { data: po } = await admin
      .from("awarie")
      .select("opis_awarii, krytycznosc_skutku")
      .eq("id", awariaPracownika)
      .single();
    expect(po?.opis_awarii).toBe(`${ZNACZNIK} Test pracownik`);
    expect(po?.krytycznosc_skutku).toBe("Niska");
  });
  it("nie może usunąć swojego zgłoszenia", async () => {
    const k = await zaloguj(KONTA.pracownik.email);
    const { error } = await k.from("awarie").delete().eq("id", awariaPracownika);
    expect(error?.code).toBe("42501");
  });
});

describe("technik, kierownik, admin", () => {
  it("technik nie może usuwać zgłoszeń", async () => {
    const k = await zaloguj(KONTA.technik.email);
    const { error } = await k.from("awarie").delete().eq("id", awariaPracownika);
    expect(error?.code).toBe("42501");
  });
  it("admin nie może usuwać profili z klienta", async () => {
    const a = await zaloguj(KONTA.admin.email);
    const { error } = await a.from("profiles").delete().eq("id", id.pracownik);
    expect(error?.code).toBe("42501");
  });
  it("kierownik może zmieniać zgłoszenia", async () => {
    const k = await zaloguj(KONTA.kierownik.email);
    const { data, error } = await k
      .from("awarie")
      .update({
        status: "zamknieta",
        przyczyna: "Test",
        data_zamkniecia: new Date().toISOString(),
      })
      .eq("id", awariaPracownika2)
      .select("status")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("zamknieta");
    await admin.from("awarie").update({ status: "zgloszona" }).eq("id", awariaPracownika2);
  });
  for (const klucz of ["technik", "kierownik", "admin"] as const) {
    it(`${klucz} widzi wszystkie zgłoszenia`, async () => {
      const k = await zaloguj(KONTA[klucz].email);
      const { data } = await moje(k);
      const ids = data?.map((r) => r.id) ?? [];
      expect(ids).toContain(awariaPracownika);
      expect(ids).toContain(awariaPracownika2);
    });
  }
  it("technik zamyka awarię, ale nie podmieni zgłaszającego", async () => {
    const k = await zaloguj(KONTA.technik.email);
    const { data, error } = await k
      .from("awarie")
      .update({
        status: "zamknieta",
        przyczyna: "Test",
        data_zamkniecia: new Date().toISOString(),
        zglaszajacy_id: id.technik,
        zglaszajacy_nazwa: "Podmiana",
      })
      .eq("id", awariaPracownika)
      .eq("wersja", 1)
      .select("status, zglaszajacy_id, zglaszajacy_nazwa")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("zamknieta");
    expect(data?.zglaszajacy_id).toBe(id.pracownik);
    expect(data?.zglaszajacy_nazwa).toBe("Test pracownik");
    await admin.from("awarie").update({ status: "zgloszona" }).eq("id", awariaPracownika);
  });
  it("technik nie ustawi statusu spoza dozwolonych wartości (ograniczenie CHECK)", async () => {
    const k = await zalogujLinkiem(KONTA.technik.email);
    try {
      const { error } = await k
        .from("awarie")
        .update({ status: "Cokolwiek" })
        .eq("id", awariaPracownika)
        .select("id");
      expect(error?.code).toBe("22P02");
    } finally {
      // Gdy ograniczenia jeszcze nie ma, przywracamy status, żeby nie psuć pozostałych testów.
      await admin.from("awarie").update({ status: "zgloszona" }).eq("id", awariaPracownika);
    }
  });
  it("technik czyta tylko własny profil, admin wszystkie", async () => {
    const t = await zaloguj(KONTA.technik.email);
    const { data: dt } = await t.from("profiles").select("id");
    expect(dt?.map((p) => p.id)).toEqual([id.technik]);
    const a = await zaloguj(KONTA.admin.email);
    const { data: da } = await a.from("profiles").select("id");
    expect((da ?? []).length).toBeGreaterThanOrEqual(7);
  });
  it("admin nie zmienia profili bezpośrednio z klienta (tylko przez funkcje serwerowe)", async () => {
    const a = await zaloguj(KONTA.admin.email);
    const { error } = await a.from("profiles").update({ rola: "technik" }).eq("id", id.pracownik);
    expect(error?.code).toBe("42501");
  });
});

describe("konta bez dostępu do danych", () => {
  for (const klucz of ["zmianaHasla", "zablokowany"] as const) {
    it(`${klucz}: nie widzi awarii ani urządzeń, ale czyta własny profil`, async () => {
      const k = await zaloguj(KONTA[klucz].email);
      const { data: aw } = await moje(k);
      expect(aw).toEqual([]);
      const { data: urz } = await k.from("urzadzenia").select("nr_technologiczny");
      expect(urz).toEqual([]);
      const { data: prof } = await k.from("profiles").select("id, status, must_change_password");
      expect(prof).toHaveLength(1);
      expect(prof?.[0]?.id).toBe(id[klucz]);
    });
    it(`${klucz}: nie może zgłosić awarii`, async () => {
      const k = await zaloguj(KONTA[klucz].email);
      const { error } = await k.from("awarie").insert({
        nr_technologiczny: "HVAC-01",
        nazwa_urzadzenia: "x",
        opis_awarii: `${ZNACZNIK} zablokowany`,
        krytycznosc_skutku: "Niska",
      });
      expect(error?.code).toBe("42501");
    });
  }
});

describe("ostatni admin", () => {
  it("nie można zdegradować ostatniego aktywnego admina", async () => {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("rola", "admin")
      .eq("status", "aktywny");
    expect(count, "Projekt testowy musi mieć dokładnie jednego aktywnego admina").toBe(1);
    const { error } = await admin.from("profiles").update({ rola: "technik" }).eq("id", id.admin);
    expect(error?.message).toContain("ostatniego");
  });
});
