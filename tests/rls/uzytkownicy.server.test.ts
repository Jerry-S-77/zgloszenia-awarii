import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { klientAdmin, klientAnon, przygotujKonta, type KluczKonta } from "../wspolne/srodowisko";
import {
  BladBiznesowy,
  czyHasloPasuje,
  resetujHaslo,
  utworzKonto,
  zmienRoleLubStatus,
  zmienWlasneHaslo,
} from "@/lib/uzytkownicy.server";

const admin = klientAdmin();
let ids: Record<KluczKonta, string>;
const utworzone: string[] = [];

const nowyEmail = () => `nowy-${crypto.randomUUID()}@example.test`;

async function nowyUzytkownik(rola: "pracownik" | "technik" = "technik") {
  const email = nowyEmail();
  const konto = await utworzKonto(admin, ids.admin, {
    email,
    imieNazwisko: "Nowy Użytkownik",
    rola,
  });
  utworzone.push(konto.id);
  return { ...konto, email };
}

beforeAll(async () => {
  ids = await przygotujKonta();
});

afterAll(async () => {
  for (const id of utworzone) await admin.auth.admin.deleteUser(id);
});

describe("utworzKonto", () => {
  it("tworzy konto z hasłem tymczasowym i wymuszoną zmianą hasła", async () => {
    const konto = await nowyUzytkownik("technik");
    const { data: profil } = await admin.from("profiles").select("*").eq("id", konto.id).single();
    expect(profil).toMatchObject({
      rola: "technik",
      status: "aktywny",
      must_change_password: true,
      email: konto.email,
      imie_nazwisko: "Nowy Użytkownik",
    });
    expect(await czyHasloPasuje(konto.email, konto.hasloTymczasowe)).toBe(true);
  });
  it("odrzuca zajęty e-mail", async () => {
    const konto = await nowyUzytkownik();
    await expect(
      utworzKonto(admin, ids.admin, {
        email: konto.email,
        imieNazwisko: "Duplikat",
        rola: "pracownik",
      }),
    ).rejects.toThrow("Konto o tym adresie e-mail już istnieje.");
  });
  it("odmawia komuś, kto nie jest adminem", async () => {
    await expect(
      utworzKonto(admin, ids.technik, {
        email: nowyEmail(),
        imieNazwisko: "X Y",
        rola: "pracownik",
      }),
    ).rejects.toThrow(BladBiznesowy);
  });
  it("odmawia nieistniejącemu aktorowi", async () => {
    await expect(
      utworzKonto(admin, crypto.randomUUID(), {
        email: nowyEmail(),
        imieNazwisko: "X Y",
        rola: "pracownik",
      }),
    ).rejects.toThrow("Brak uprawnień.");
  });
});

describe("zmienWlasneHaslo", () => {
  it("odrzuca nowe hasło identyczne z dotychczasowym", async () => {
    const konto = await nowyUzytkownik();
    await zmienWlasneHaslo(admin, konto.id, "Pierwsze-haslo-123");
    await expect(zmienWlasneHaslo(admin, konto.id, "Pierwsze-haslo-123")).rejects.toThrow(
      "Nowe hasło musi różnić się od dotychczasowego.",
    );
  });
  it("odrzuca hasło krótsze niż 12 znaków", async () => {
    const konto = await nowyUzytkownik();
    await expect(zmienWlasneHaslo(admin, konto.id, "krotkie")).rejects.toThrow(
      "Hasło musi mieć co najmniej 12 znaków.",
    );
  });
  it("ustawia hasło i zdejmuje wymuszenie zmiany", async () => {
    const konto = await nowyUzytkownik();
    await zmienWlasneHaslo(admin, konto.id, "Moje-nowe-haslo-9");
    const { data } = await admin
      .from("profiles")
      .select("must_change_password")
      .eq("id", konto.id)
      .single();
    expect(data?.must_change_password).toBe(false);
    expect(await czyHasloPasuje(konto.email, "Moje-nowe-haslo-9")).toBe(true);
    expect(await czyHasloPasuje(konto.email, konto.hasloTymczasowe)).toBe(false);
  });
});

describe("resetujHaslo", () => {
  it("ustawia nowe hasło tymczasowe i wymusza zmianę hasła", async () => {
    const konto = await nowyUzytkownik();
    await zmienWlasneHaslo(admin, konto.id, "Moje-nowe-haslo-9");
    const { hasloTymczasowe } = await resetujHaslo(admin, ids.admin, konto.id);
    expect(await czyHasloPasuje(konto.email, hasloTymczasowe)).toBe(true);
    expect(await czyHasloPasuje(konto.email, "Moje-nowe-haslo-9")).toBe(false);
    const { data } = await admin
      .from("profiles")
      .select("must_change_password")
      .eq("id", konto.id)
      .single();
    expect(data?.must_change_password).toBe(true);
  });
});

describe("zmienRoleLubStatus", () => {
  it("blokada odbiera możliwość logowania, odblokowanie ją przywraca", async () => {
    const konto = await nowyUzytkownik();
    await zmienRoleLubStatus(admin, ids.admin, { userId: konto.id, status: "zablokowany" });
    expect(await czyHasloPasuje(konto.email, konto.hasloTymczasowe)).toBe(false);
    await zmienRoleLubStatus(admin, ids.admin, { userId: konto.id, status: "aktywny" });
    expect(await czyHasloPasuje(konto.email, konto.hasloTymczasowe)).toBe(true);
  });
  it("zmienia rolę", async () => {
    const konto = await nowyUzytkownik("pracownik");
    await zmienRoleLubStatus(admin, ids.admin, { userId: konto.id, rola: "kierownik" });
    const { data } = await admin.from("profiles").select("rola").eq("id", konto.id).single();
    expect(data?.rola).toBe("kierownik");
  });
  it("nie pozwala zdegradować ostatniego aktywnego admina", async () => {
    await expect(
      zmienRoleLubStatus(admin, ids.admin, { userId: ids.admin, rola: "technik" }),
    ).rejects.toThrow("ostatniego aktywnego administratora");
  });
  it("odmawia nie-adminowi", async () => {
    const konto = await nowyUzytkownik();
    await expect(
      zmienRoleLubStatus(admin, ids.technik, { userId: konto.id, rola: "admin" }),
    ).rejects.toThrow("Brak uprawnień.");
  });
});

describe("zmienRoleLubStatus: dodatkowe przypadki", () => {
  it("nie pozwala zablokować ostatniego aktywnego admina", async () => {
    await expect(
      zmienRoleLubStatus(admin, ids.admin, { userId: ids.admin, status: "zablokowany" }),
    ).rejects.toThrow("ostatniego aktywnego administratora");
  });
  it("zgłasza brak użytkownika o nieistniejącym identyfikatorze", async () => {
    await expect(
      zmienRoleLubStatus(admin, ids.admin, { userId: crypto.randomUUID(), rola: "technik" }),
    ).rejects.toThrow("Nie znaleziono użytkownika.");
  });
});

describe("wymagajAdmina: admin z ograniczeniami", () => {
  // Fixtury są tymczasowymi, dodatkowymi adminami: usuwane w afterAll, zanim
  // pozostałe testy potrzebują dokładnie jednego aktywnego admina.
  const fixtury: string[] = [];

  async function nowyAdmin(zmiana: boolean, status: "aktywny" | "zablokowany") {
    const email = nowyEmail();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "Fixtura-Haslo-12345!",
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("createUser bez użytkownika");
    fixtury.push(data.user.id);
    const { error: bladProfilu } = await admin.from("profiles").insert({
      id: data.user.id,
      email,
      imie_nazwisko: "Fixtura Admin",
      rola: "admin",
      status,
      must_change_password: zmiana,
    });
    if (bladProfilu) throw bladProfilu;
    return data.user.id;
  }

  afterAll(async () => {
    for (const id of fixtury) await admin.auth.admin.deleteUser(id);
  });

  it("odmawia adminowi z wymuszoną zmianą hasła", async () => {
    const id = await nowyAdmin(true, "aktywny");
    await expect(
      utworzKonto(admin, id, { email: nowyEmail(), imieNazwisko: "X Y", rola: "pracownik" }),
    ).rejects.toThrow("Brak uprawnień.");
  });
  it("odmawia zablokowanemu adminowi", async () => {
    const id = await nowyAdmin(false, "zablokowany");
    await expect(
      utworzKonto(admin, id, { email: nowyEmail(), imieNazwisko: "X Y", rola: "pracownik" }),
    ).rejects.toThrow("Brak uprawnień.");
  });
});

describe("resetujHaslo: unieważnienie sesji", () => {
  it("stary refresh token przestaje działać po resecie hasła przez admina", async () => {
    const konto = await nowyUzytkownik();
    const zalogowany = klientAnon();
    const { data, error } = await zalogowany.auth.signInWithPassword({
      email: konto.email,
      password: konto.hasloTymczasowe,
    });
    expect(error).toBeNull();
    const staraSesja = data.session;
    if (!staraSesja) throw new Error("Brak sesji po zalogowaniu");

    await resetujHaslo(admin, ids.admin, konto.id);

    const odswiezenie = await klientAnon().auth.refreshSession({
      refresh_token: staraSesja.refresh_token,
    });
    expect(odswiezenie.data.session).toBeNull();
    expect(odswiezenie.error).not.toBeNull();
  });
});
