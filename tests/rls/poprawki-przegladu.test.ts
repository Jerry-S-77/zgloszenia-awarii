import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  KONTA,
  klientAdmin,
  przygotujKonta,
  zalogujLinkiem,
  type KluczKonta,
} from "../wspolne/srodowisko";

// Poprawki po niezależnym przeglądzie kodu (migracja 20260928120000_poprawki_przegladu.sql).
const ZNACZNIK = `TEST-POPR-${crypto.randomUUID()}`;
const PREFIKS_PUSH = `https://push.example.test/popr-${Date.now()}`;
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
            przyczyna: "stara przyczyna",
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

const ZAMKNIECIE = {
  status: "zamknieta" as const,
  przyczyna: "Zatarte łożysko",
  kategoria_przyczyny: "mechaniczna" as const,
  data_zamkniecia: new Date().toISOString(),
};

beforeAll(async () => {
  id = await przygotujKonta();
});

afterAll(async () => {
  await admin.from("push_subskrypcje").delete().like("endpoint", `${PREFIKS_PUSH}%`);
  const { error } = await admin.from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
  if (error) throw error;
});

describe("zamknięcie wymaga poprawnego czasu przestoju", () => {
  it("bez czasu przestoju zamknięcie jest odrzucane", async () => {
    const awaria = await wstaw();
    const { error } = await (
      await jako("technik")
    )
      .from("awarie")
      .update(ZAMKNIECIE)
      .eq("id", awaria);
    expect(error?.message).toContain("czasu przestoju");
  });

  it("ujemny czas przestoju jest odrzucany", async () => {
    const awaria = await wstaw();
    const { error } = await (
      await jako("technik")
    )
      .from("awarie")
      .update({ ...ZAMKNIECIE, czas_przestoju_h: -2 })
      .eq("id", awaria);
    expect(error?.code).toBe("23514");
  });
});

describe("zamrożenie danych awarii", () => {
  it("obsługa nie zmieni urządzenia, daty, opisu ani krytyczności zgłoszenia", async () => {
    const awaria = await wstaw();
    const technik = await jako("technik");
    for (const zmiana of [
      { nr_technologiczny: "INNE-URZADZENIE" },
      { data_awarii: "2020-01-01T00:00:00Z" },
      { opis_awarii: "podmieniony opis" },
      { krytycznosc_skutku: "Wysoka" },
    ]) {
      const { error } = await technik.from("awarie").update(zmiana).eq("id", awaria);
      expect(error?.message, JSON.stringify(zmiana)).toContain("Danych zgłoszenia");
    }
  });

  it("dane zamknięcia nie zmieniają się poza zamykaniem; brakującą kategorię wolno uzupełnić", async () => {
    const awaria = await wstaw(true);
    const kierownik = await jako("kierownik");
    const { error } = await kierownik
      .from("awarie")
      .update({ przyczyna: "podmieniona", czas_przestoju_h: 0 })
      .eq("id", awaria);
    expect(error?.message).toContain("Dane zamknięcia");
    const { error: bladKategorii } = await kierownik
      .from("awarie")
      .update({ kategoria_przyczyny: "media" })
      .eq("id", awaria);
    expect(bladKategorii?.message).toContain("Dane zamknięcia");

    await admin.from("awarie").update({ kategoria_przyczyny: null }).eq("id", awaria);
    const { error: bladUzupelnienia } = await kierownik
      .from("awarie")
      .update({ kategoria_przyczyny: "media" })
      .eq("id", awaria);
    expect(bladUzupelnienia).toBeNull();
  });

  it("przejście statusu (bez zmiany danych zgłoszenia) nadal działa", async () => {
    const awaria = await wstaw();
    const { error } = await (
      await jako("technik")
    )
      .from("awarie")
      .update({ status: "przyjeta" })
      .eq("id", awaria);
    expect(error).toBeNull();
  });
});

it("nowa awaria zawsze zaczyna od wersji 1", async () => {
  const { data, error } = await (
    await jako("pracownik")
  )
    .from("awarie")
    .insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      opis_awarii: `${ZNACZNIK} wersja`,
      krytycznosc_skutku: "Niska",
      wersja: 999,
    })
    .select("wersja")
    .single();
  expect(error).toBeNull();
  expect(data?.wersja).toBe(1);
});

it("subskrypcję push tej przeglądarki usuwa każde zalogowane konto (wylogowanie bez sieci)", async () => {
  const endpoint = `${PREFIKS_PUSH}/1`;
  await (
    await jako("technik")
  ).rpc("push_zapisz_subskrypcje", {
    p_endpoint: endpoint,
    p_p256dh: "B".repeat(87),
    p_auth: "A".repeat(22),
  });
  const { error } = await (
    await jako("kierownik")
  ).rpc("push_usun_subskrypcje", {
    p_endpoint: endpoint,
  });
  expect(error).toBeNull();
  const { data } = await admin.from("push_subskrypcje").select("id").eq("endpoint", endpoint);
  expect(data).toEqual([]);
});
