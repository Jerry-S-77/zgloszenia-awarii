import { expect, test, type Page } from "@playwright/test";
import { HASLO_TESTOWE, KONTA, klientAdmin, przygotujKonta, url } from "../wspolne/srodowisko";

const ZNACZNIK = `E2ECZ-${Date.now()}`;
const CZESC = `Pasek klinowy ${Date.now()}`;
const HOST_TESTOWY = new URL(url()).host;
const admin = klientAdmin();
let awariaId = "";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.route(
    (adres) => adres.hostname.endsWith(".supabase.co"),
    async (route) => {
      if (new URL(route.request().url()).host === HOST_TESTOWY) await route.continue();
      else await route.abort();
    },
  );
});

async function otworz(page: Page, sciezka: string) {
  await page.goto(sciezka);
  await page.waitForFunction(
    () => {
      const maKlucz = (o: object | null, p: string) =>
        o !== null && Object.getOwnPropertyNames(o).some((k) => k.startsWith(p));
      return (
        maKlucz(document, "__reactContainer$") &&
        maKlucz(document.querySelector("form, button"), "__reactProps$")
      );
    },
    undefined,
    { timeout: 15_000 },
  );
}

async function zaloguj(page: Page, email: string) {
  await otworz(page, "/logowanie");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło").fill(HASLO_TESTOWE);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/logowanie"), { timeout: 15_000 });
}

test.beforeAll(async () => {
  const id = await przygotujKonta();
  const { error: bladUrzadzenia } = await admin
    .from("urzadzenia")
    .upsert(
      {
        nr_technologiczny: "HVAC-01",
        nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
        status: "aktywne",
      },
      { onConflict: "nr_technologiczny" },
    );
  if (bladUrzadzenia) throw bladUrzadzenia;
  const { data, error } = await admin
    .from("awarie")
    .insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      opis_awarii: `${ZNACZNIK} pasek`,
      krytycznosc_skutku: "Srednia",
      status: "oczekuje_na_czesc",
    })
    .select("id")
    .single();
  if (error) throw error;
  awariaId = data.id;
  const { error: bladZespolu } = await admin
    .from("awarie_zespol")
    .insert({ awaria_id: awariaId, uzytkownik_id: id.kierownik, nazwa: "Test kierownik" });
  if (bladZespolu) throw bladZespolu;
});

test.afterAll(async () => {
  await admin.from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
});

test("technik wpisuje część, widać ją w Zadaniach, prowadzi ją do dostarczenia", async ({
  page,
}) => {
  await zaloguj(page, KONTA.technik.email);
  await otworz(page, `/awarie/${awariaId}`);
  await expect(page.getByText("Awaria czeka na część")).toBeVisible();
  await page.getByRole("button", { name: "Dodaj część" }).click();
  await page.getByLabel("Nazwa lub numer katalogowy").fill(CZESC);
  await page.getByLabel("Ilość").fill("2");
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  await expect(page.getByText("Dodano część", { exact: true })).toBeVisible();
  await expect(page.getByText(`Dodano część: ${CZESC} × 2`)).toBeVisible();

  await otworz(page, "/zadania");
  await expect(page.getByText(`${CZESC} × 2 · potrzebna`)).toBeVisible();

  await otworz(page, `/awarie/${awariaId}`);
  await page.getByRole("button", { name: "Oznacz jako zamówioną" }).click();
  await expect(page.getByText("Część: zamówiona")).toBeVisible();
  await page.getByRole("button", { name: "Oznacz jako dostarczoną" }).click();
  await expect(page.getByText("Część: dostarczona")).toBeVisible();
  await expect(page.getByText(`Część ${CZESC}: dostarczona`)).toBeVisible();
  await expect(page.getByRole("button", { name: /Oznacz jako/ })).toHaveCount(0);

  await otworz(page, "/urzadzenia/HVAC-01");
  await expect(page.getByRole("heading", { name: "Zużyte części" })).toBeVisible();
  await expect(page.getByText(CZESC)).toBeVisible();
});

test("kierownik z zespołu dostaje powiadomienie o dostarczeniu części", async ({ page }) => {
  await zaloguj(page, KONTA.kierownik.email);
  await otworz(page, "/powiadomienia");
  await expect(page.getByText(`Dotarła część ${CZESC} do awarii`)).toBeVisible();
});
