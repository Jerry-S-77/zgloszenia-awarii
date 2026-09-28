import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  KONTA,
  klientAdmin,
  przygotujKonta,
  zalogujLinkiem,
  type KluczKonta,
} from "../wspolne/srodowisko";

const PREFIKS = `https://push.example.test/${Date.now()}`;
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

const KLUCZE = { p_p256dh: "B".repeat(87), p_auth: "A".repeat(22) };

beforeAll(async () => {
  id = await przygotujKonta();
});

afterAll(async () => {
  await admin.from("push_subskrypcje").delete().like("endpoint", `${PREFIKS}%`);
});

describe("subskrypcje push", () => {
  it("użytkownik zapisuje subskrypcję (domyślnie tylko krytyczne) i widzi tylko swoje", async () => {
    const endpoint = `${PREFIKS}/1`;
    const { error } = await (
      await jako("technik")
    ).rpc("push_zapisz_subskrypcje", {
      p_endpoint: endpoint,
      ...KLUCZE,
    });
    expect(error).toBeNull();
    const { data: swoje } = await (
      await jako("technik")
    )
      .from("push_subskrypcje")
      .select("uzytkownik_id, tylko_krytyczne")
      .eq("endpoint", endpoint);
    expect(swoje).toEqual([{ uzytkownik_id: id.technik, tylko_krytyczne: true }]);
    const { data: cudze } = await (
      await jako("kierownik")
    )
      .from("push_subskrypcje")
      .select("id")
      .eq("endpoint", endpoint);
    expect(cudze).toEqual([]);
  });

  it("ta sama przeglądarka po zmianie konta przechodzi na nowe konto", async () => {
    const endpoint = `${PREFIKS}/2`;
    await (
      await jako("technik")
    ).rpc("push_zapisz_subskrypcje", { p_endpoint: endpoint, ...KLUCZE });
    await (
      await jako("kierownik")
    ).rpc("push_zapisz_subskrypcje", {
      p_endpoint: endpoint,
      ...KLUCZE,
      p_tylko_krytyczne: false,
    });
    const { data } = await admin
      .from("push_subskrypcje")
      .select("uzytkownik_id, tylko_krytyczne")
      .eq("endpoint", endpoint);
    expect(data).toEqual([{ uzytkownik_id: id.kierownik, tylko_krytyczne: false }]);
  });

  it("nie da się wstawić subskrypcji z pominięciem funkcji ani zmienić cudzej", async () => {
    const endpoint = `${PREFIKS}/3`;
    const { error } = await (await jako("technik")).from("push_subskrypcje").insert({
      uzytkownik_id: id.kierownik,
      endpoint,
      p256dh: "B".repeat(87),
      auth: "A".repeat(22),
    });
    expect(error?.code).toBe("42501");
    await (
      await jako("kierownik")
    ).rpc("push_zapisz_subskrypcje", { p_endpoint: endpoint, ...KLUCZE });
    const { data } = await (
      await jako("technik")
    )
      .from("push_subskrypcje")
      .update({ tylko_krytyczne: false })
      .eq("endpoint", endpoint)
      .select("id");
    expect(data ?? []).toEqual([]);
  });

  it("obcy, który zna tylko adres cudzej subskrypcji, nie przejmie jej (inne klucze = odmowa)", async () => {
    const endpoint = `${PREFIKS}/przejecie`;
    await (
      await jako("technik")
    ).rpc("push_zapisz_subskrypcje", { p_endpoint: endpoint, ...KLUCZE });
    const { error } = await (
      await jako("kierownik")
    ).rpc("push_zapisz_subskrypcje", {
      p_endpoint: endpoint,
      p_p256dh: "C".repeat(87),
      p_auth: "D".repeat(22),
    });
    expect(error?.message).toContain("innego urządzenia");
    const { data } = await admin
      .from("push_subskrypcje")
      .select("uzytkownik_id")
      .eq("endpoint", endpoint);
    expect(data).toEqual([{ uzytkownik_id: id.technik }]);
  });

  it("konto z wymuszoną zmianą hasła nie zapisze subskrypcji", async () => {
    const { error } = await (
      await jako("zmianaHasla")
    ).rpc("push_zapisz_subskrypcje", {
      p_endpoint: `${PREFIKS}/4`,
      ...KLUCZE,
    });
    expect(error?.message).toContain("Brak aktywnego konta");
  });

  it("powiadomienie zapisuje się normalnie także bez konfiguracji push (baza testowa)", async () => {
    await (
      await jako("technik")
    ).rpc("push_zapisz_subskrypcje", {
      p_endpoint: `${PREFIKS}/5`,
      ...KLUCZE,
    });
    const { error } = await admin.from("powiadomienia").insert({
      uzytkownik_id: id.technik,
      typ: "nowa_awaria",
      tresc: "Test push",
      link: "/",
      krytyczne: true,
    });
    expect(error).toBeNull();
    await admin.from("powiadomienia").delete().eq("tresc", "Test push");
  });
});
