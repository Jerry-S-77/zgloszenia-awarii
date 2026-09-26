import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  KONTA,
  klientAdmin,
  klientAnon,
  przygotujKonta,
  zalogujLinkiem,
  type KluczKonta,
} from "../wspolne/srodowisko";

const ZNACZNIK = `TEST-ZDJ-${crypto.randomUUID()}`;
const KUBELEK = "zdjecia-awarii";
const admin = klientAdmin();
let id: Record<KluczKonta, string>;
const klienci = new Map<KluczKonta, Awaited<ReturnType<typeof zalogujLinkiem>>>();
const utworzone: string[] = [];

// Najmniejszy „JPEG”: Storage sprawdza typ z nagłówka, treść nie ma znaczenia dla uprawnień.
const PLIK = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });

async function jako(k: KluczKonta) {
  const istniejacy = klienci.get(k);
  if (istniejacy) return istniejacy;
  const klient = await zalogujLinkiem(KONTA[k].email);
  klienci.set(k, klient);
  return klient;
}

async function wstawAwarie() {
  const { data, error } = await admin
    .from("awarie")
    .insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      opis_awarii: `${ZNACZNIK} ${crypto.randomUUID()}`,
      krytycznosc_skutku: "Niska",
      status: "zgloszona",
      zglaszajacy_id: id.pracownik,
    })
    .select("id")
    .single();
  if (error) throw error;
  utworzone.push(data.id);
  return data.id;
}

/** Wysyła plik i zapisuje wiersz tak jak aplikacja; zwraca błędy obu kroków. */
async function dodaj(k: KluczKonta, awariaId: string, zdjecieId = crypto.randomUUID()) {
  const klient = await jako(k);
  const { error: bladPliku } = await klient.storage
    .from(KUBELEK)
    .upload(`${awariaId}/${zdjecieId}.jpg`, PLIK, { contentType: "image/jpeg" });
  const { error: bladWiersza } = await klient
    .from("awarie_zdjecia")
    .insert({ id: zdjecieId, awaria_id: awariaId });
  return { zdjecieId, bladPliku, bladWiersza };
}

async function plikiAwarii(awariaId: string) {
  const { data, error } = await admin.storage.from(KUBELEK).list(awariaId);
  if (error) throw error;
  return (data ?? []).map((p) => p.name);
}

beforeAll(async () => {
  id = await przygotujKonta();
});

afterAll(async () => {
  for (const awaria of utworzone) {
    const pliki = await plikiAwarii(awaria);
    if (pliki.length) await admin.storage.from(KUBELEK).remove(pliki.map((p) => `${awaria}/${p}`));
  }
  const { error } = await admin.from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
  if (error) throw error;
});

describe("dodawanie i odczyt zdjęć", () => {
  it("zgłaszający dodaje zdjęcie do swojej awarii; autor i historia ustawiane przez bazę", async () => {
    const awaria = await wstawAwarie();
    const { zdjecieId, bladPliku, bladWiersza } = await dodaj("pracownik", awaria);
    expect(bladPliku).toBeNull();
    expect(bladWiersza).toBeNull();
    const { data } = await admin
      .from("awarie_zdjecia")
      .select("autor_id, autor_nazwa")
      .eq("id", zdjecieId)
      .single();
    expect(data).toEqual({ autor_id: id.pracownik, autor_nazwa: "Test pracownik" });
    const { data: historia } = await admin
      .from("awarie_historia")
      .select("typ, dane")
      .eq("awaria_id", awaria)
      .eq("typ", "edycja");
    expect(historia?.[0]?.dane).toMatchObject({ akcja: "zdjecie_dodane" });
  });

  it("inny pracownik nie widzi, nie pobierze i nie doda zdjęcia do cudzej awarii", async () => {
    const awaria = await wstawAwarie();
    const { zdjecieId } = await dodaj("pracownik", awaria);
    const obcy = await jako("pracownik2");
    const { data: wiersze } = await obcy
      .from("awarie_zdjecia")
      .select("id")
      .eq("awaria_id", awaria);
    expect(wiersze).toEqual([]);
    const { data: plik } = await obcy.storage.from(KUBELEK).download(`${awaria}/${zdjecieId}.jpg`);
    expect(plik).toBeNull();
    const proba = await dodaj("pracownik2", awaria);
    expect(proba.bladPliku).not.toBeNull();
    expect(proba.bladWiersza).not.toBeNull();
    expect(await plikiAwarii(awaria)).toHaveLength(1);
  });

  it("technik widzi, pobiera i dodaje zdjęcia do każdej awarii", async () => {
    const awaria = await wstawAwarie();
    const { zdjecieId } = await dodaj("pracownik", awaria);
    const technik = await jako("technik");
    const { data: plik } = await technik.storage
      .from(KUBELEK)
      .download(`${awaria}/${zdjecieId}.jpg`);
    expect(plik).not.toBeNull();
    const wynik = await dodaj("technik", awaria);
    expect(wynik.bladPliku).toBeNull();
    expect(wynik.bladWiersza).toBeNull();
    const { data: wiersze } = await technik
      .from("awarie_zdjecia")
      .select("id")
      .eq("awaria_id", awaria);
    expect(wiersze).toHaveLength(2);
  });

  it("najwyżej 3 zdjęcia na awarię: czwarty plik i czwarty wiersz odrzucone", async () => {
    const awaria = await wstawAwarie();
    const pierwsze = await dodaj("technik", awaria);
    await dodaj("technik", awaria);
    await dodaj("kierownik", awaria);
    const czwarte = await dodaj("admin", awaria);
    expect(czwarte.bladPliku).not.toBeNull();
    expect(czwarte.bladWiersza?.message).toContain("najwyżej 3 zdjęcia");
    expect(await plikiAwarii(awaria)).toHaveLength(3);
    // Ponowna wysyłka istniejącego pliku przy pełnym limicie: „już istnieje”, nie odmowa.
    const ponowna = await (
      await jako("technik")
    ).storage
      .from(KUBELEK)
      .upload(`${awaria}/${pierwsze.zdjecieId}.jpg`, PLIK, { contentType: "image/jpeg" });
    expect(ponowna.error?.message ?? "").toMatch(/exists|Duplicate/i);
  });

  it("plik o złej ścieżce albo złym typie jest odrzucany", async () => {
    const awaria = await wstawAwarie();
    const technik = await jako("technik");
    const zlaSciezka = await technik.storage
      .from(KUBELEK)
      .upload(`${awaria}/zdjecie.jpg`, PLIK, { contentType: "image/jpeg" });
    expect(zlaSciezka.error).not.toBeNull();
    const zlyTyp = await technik.storage
      .from(KUBELEK)
      .upload(`${awaria}/${crypto.randomUUID()}.jpg`, new Blob(["x"], { type: "image/png" }), {
        contentType: "image/png",
      });
    expect(zlyTyp.error).not.toBeNull();
    expect(await plikiAwarii(awaria)).toHaveLength(0);
  });
});

describe("usuwanie zdjęć", () => {
  it("technik nie usunie cudzego zdjęcia; autor usuwa swoje; admin każde", async () => {
    const awaria = await wstawAwarie();
    const pracownika = await dodaj("pracownik", awaria);
    const technika = await dodaj("technik", awaria);
    const technik = await jako("technik");

    await technik.from("awarie_zdjecia").delete().eq("id", pracownika.zdjecieId);
    await technik.storage.from(KUBELEK).remove([`${awaria}/${pracownika.zdjecieId}.jpg`]);
    expect(await plikiAwarii(awaria)).toHaveLength(2);

    const pracownik = await jako("pracownik");
    await pracownik.from("awarie_zdjecia").delete().eq("id", pracownika.zdjecieId);
    await pracownik.storage.from(KUBELEK).remove([`${awaria}/${pracownika.zdjecieId}.jpg`]);
    const adm = await jako("admin");
    await adm.from("awarie_zdjecia").delete().eq("id", technika.zdjecieId);
    await adm.storage.from(KUBELEK).remove([`${awaria}/${technika.zdjecieId}.jpg`]);

    const { data: wiersze } = await admin
      .from("awarie_zdjecia")
      .select("id")
      .eq("awaria_id", awaria);
    expect(wiersze).toEqual([]);
    expect(await plikiAwarii(awaria)).toHaveLength(0);
    const { data: historia } = await admin
      .from("awarie_historia")
      .select("dane")
      .eq("awaria_id", awaria)
      .eq("typ", "edycja");
    expect(
      historia?.filter((h) => (h.dane as { akcja?: string }).akcja === "zdjecie_usuniete"),
    ).toHaveLength(2);
  });
});

describe("poprawki po przeglądzie", () => {
  it("awarię ze zdjęciami da się usunąć (kaskada nie dopisuje historii do usuwanej awarii)", async () => {
    const awaria = await wstawAwarie();
    await dodaj("pracownik", awaria);
    const { error } = await admin.from("awarie").delete().eq("id", awaria);
    expect(error).toBeNull();
    const { data } = await admin.from("awarie_zdjecia").select("id").eq("awaria_id", awaria);
    expect(data).toEqual([]);
  });

  it("licznik plików nie zdradza zdjęć cudzych awarii ani wszystkich plików", async () => {
    const awaria = await wstawAwarie();
    await dodaj("pracownik", awaria);
    const obcy = await jako("pracownik2");
    const cudza = await obcy.rpc("zdjecia_inne_pliki", {
      p_nazwa: `${awaria}/${crypto.randomUUID()}.jpg`,
    });
    expect(cudza.data).toBe(0);
    const wszystkie = await obcy.rpc("zdjecia_inne_pliki", { p_nazwa: "%/x" });
    expect(wszystkie.data).toBe(0);
    const swoja = await (
      await jako("pracownik")
    ).rpc("zdjecia_inne_pliki", {
      p_nazwa: `${awaria}/${crypto.randomUUID()}.jpg`,
    });
    expect(swoja.data).toBe(1);
  });
});

describe("bez logowania", () => {
  it("anon nie widzi wierszy ani plików i nie może nic wysłać", async () => {
    const awaria = await wstawAwarie();
    const { zdjecieId } = await dodaj("pracownik", awaria);
    const anon = klientAnon();
    const { error } = await anon.from("awarie_zdjecia").select("id");
    expect(error?.code).toBe("42501");
    const { data: plik } = await anon.storage.from(KUBELEK).download(`${awaria}/${zdjecieId}.jpg`);
    expect(plik).toBeNull();
    const { error: bladWysylki } = await anon.storage
      .from(KUBELEK)
      .upload(`${awaria}/${crypto.randomUUID()}.jpg`, PLIK, { contentType: "image/jpeg" });
    expect(bladWysylki).not.toBeNull();
  });
});
