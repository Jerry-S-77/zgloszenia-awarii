import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  KONTA,
  klientAdmin,
  przygotujKonta,
  zalogujLinkiem,
  type KluczKonta,
} from "../wspolne/srodowisko";

const ZNACZNIK = `TEST-KAT-${crypto.randomUUID()}`;
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

async function wstaw(zamknieta = false) {
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
            przyczyna: "historyczna",
            czas_przestoju_h: 1,
            data_zamkniecia: new Date().toISOString(),
          }
        : {}),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const ZAMKNIECIE = {
  status: "zamknieta" as const,
  przyczyna: "Zatarte łożysko",
  czas_przestoju_h: 2,
  data_zamkniecia: new Date().toISOString(),
};

beforeAll(async () => {
  id = await przygotujKonta();
});

afterAll(async () => {
  const { error } = await admin.from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
  if (error) throw error;
});

describe("kategoria przyczyny", () => {
  it("zamknięcie bez kategorii jest odrzucane przez bazę", async () => {
    const awaria = await wstaw();
    const { error } = await (
      await jako("technik")
    )
      .from("awarie")
      .update(ZAMKNIECIE)
      .eq("id", awaria);
    expect(error?.message).toContain("kategorii przyczyny");
  });

  it("zamknięcie z kategorią przechodzi", async () => {
    const awaria = await wstaw();
    const { data, error } = await (
      await jako("technik")
    )
      .from("awarie")
      .update({ ...ZAMKNIECIE, kategoria_przyczyny: "mechaniczna" })
      .eq("id", awaria)
      .select("status, kategoria_przyczyny")
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ status: "zamknieta", kategoria_przyczyny: "mechaniczna" });
  });

  it("nowe zgłoszenie nie może mieć kategorii przyczyny", async () => {
    const { error } = await (await jako("pracownik")).from("awarie").insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      opis_awarii: `${ZNACZNIK} insert`,
      krytycznosc_skutku: "Niska",
      kategoria_przyczyny: "inna",
    });
    expect(error?.code).toBe("42501");
  });

  it("obsługa uzupełnia kategorię zamkniętej awarii bez kategorii; pracownik nie", async () => {
    const awaria = await wstaw(true);
    const { data: przezPracownika } = await (
      await jako("pracownik")
    )
      .from("awarie")
      .update({ kategoria_przyczyny: "media" })
      .eq("id", awaria)
      .select("id");
    expect(przezPracownika ?? []).toEqual([]);
    const { data, error } = await (
      await jako("kierownik")
    )
      .from("awarie")
      .update({ kategoria_przyczyny: "media" })
      .eq("id", awaria)
      .select("status, kategoria_przyczyny")
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ status: "zamknieta", kategoria_przyczyny: "media" });
  });

  it("wartość spoza słownika jest odrzucana", async () => {
    const awaria = await wstaw();
    const { error } = await (
      await jako("technik")
    )
      .from("awarie")
      .update({ ...ZAMKNIECIE, kategoria_przyczyny: "kosmiczna" as never })
      .eq("id", awaria);
    expect(error?.code).toBe("22P02");
  });
});
