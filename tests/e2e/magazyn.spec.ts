import { expect, test, type Page } from "@playwright/test";
import { HASLO_TESTOWE, KONTA, klientAdmin, przygotujKonta, url } from "../wspolne/srodowisko";

const PREFIKS = `E2EMAG${Date.now()}`;
const ZNACZNIK = `E2EMAG-${Date.now()}`;
const HOST_TESTOWY = new URL(url()).host;
const admin = klientAdmin();
let awariaId = "";

const PLIK = {
  name: "czesci.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(
    "﻿numer_katalogowy;nazwa;jednostka;stan_minimalny;stan_poczatkowy;lokalizacja;urzadzenia;krytyczna\n" +
      `${PREFIKS}-1;Filtr ${PREFIKS};szt.;2;3;Regał 1;HVAC-01;tak\n` +
      `${PREFIKS}-2;Pasek ${PREFIKS};szt.;0;0;;;nie\n`,
    "utf8",
  ),
};

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
  await przygotujKonta();
  const { error: bladUrzadzenia } = await admin.from("urzadzenia").upsert(
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
      opis_awarii: `${ZNACZNIK} filtr`,
      krytycznosc_skutku: "Srednia",
      status: "w_naprawie",
    })
    .select("id")
    .single();
  if (error) throw error;
  awariaId = data.id;
});

test.afterAll(async () => {
  await admin.from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
  await admin.from("magazyn_czesci").delete().like("numer_katalogowy", `${PREFIKS}%`);
  await admin.from("powiadomienia").delete().like("tresc", `%${PREFIKS}%`);
});

test("kierownik importuje części z pliku i przyjmuje dostawę", async ({ page }) => {
  await zaloguj(page, KONTA.kierownik.email);
  await otworz(page, "/magazyn");
  await page.getByRole("button", { name: "Import z pliku" }).click();
  const arkusz = page.getByRole("dialog");
  await expect(arkusz.getByRole("link", { name: "Pobierz wzór pliku" })).toHaveAttribute(
    "href",
    "/wzory/wzor-importu-magazynu.csv",
  );
  await arkusz.getByTestId("plik-importu").setInputFiles(PLIK);
  await expect(arkusz.getByText("2 części: 2 nowych, 0 do aktualizacji.")).toBeVisible();
  await arkusz.getByRole("button", { name: "Importuj 2 części" }).click();
  await expect(page.getByText("Zaimportowano: 2 nowych, 0 zaktualizowanych")).toBeVisible();

  await page.getByLabel("Szukaj części").fill(PREFIKS);
  await page.getByRole("button", { name: new RegExp(`Filtr ${PREFIKS}`) }).click();
  const szczegoly = page.getByRole("dialog");
  await expect(szczegoly.getByText("HVAC-01 (krytyczna)")).toBeVisible();
  await szczegoly.getByRole("button", { name: "Przyjęcie dostawy" }).click();
  await szczegoly.getByLabel("Ilość (szt.)").fill("5");
  await szczegoly.getByRole("button", { name: "Przyjmij" }).click();
  await expect(page.getByText("Przyjęto dostawę")).toBeVisible();
  await expect(szczegoly.getByText("8 szt.", { exact: true })).toBeVisible();
});

test("technik pobiera część z magazynu do awarii; spadek poniżej minimum", async ({ page }) => {
  await zaloguj(page, KONTA.technik.email);
  await otworz(page, `/awarie/${awariaId}`);
  await page.getByRole("button", { name: "Z magazynu" }).click();
  await page
    .getByLabel("Część z magazynu")
    .selectOption({ label: `Filtr ${PREFIKS} (${PREFIKS}-1) — 8 szt.` });
  await page.getByLabel("Ilość", { exact: true }).fill("7");
  await page.getByRole("button", { name: "Pobierz z magazynu" }).click();
  await expect(page.getByText("Pobrano część z magazynu")).toBeVisible();
  await expect(page.getByText(`Filtr ${PREFIKS} (${PREFIKS}-1)`).first()).toBeVisible();

  await otworz(page, "/urzadzenia/HVAC-01");
  await expect(page.getByRole("heading", { name: "Części zamienne" })).toBeVisible();
  await expect(page.getByText(`Filtr ${PREFIKS}`, { exact: true })).toBeVisible();
});

test("kierownik dostaje alarm niskiego stanu i widzi ustawienia push", async ({ page }) => {
  await zaloguj(page, KONTA.kierownik.email);
  await otworz(page, "/powiadomienia");
  await expect(page.getByRole("heading", { name: "Powiadomienia na telefonie" })).toBeVisible();
  await expect(
    page.getByText(new RegExp(`Niski stan w magazynie: Filtr ${PREFIKS}`)),
  ).toBeVisible();
  await otworz(page, "/dashboard");
  await expect(page.getByRole("heading", { name: "Niski stan magazynu" })).toBeVisible();
  await expect(page.getByText(`Filtr ${PREFIKS}`)).toBeVisible();
});

test("trasa wysyłki push odrzuca wywołanie bez sekretu", async ({ request }) => {
  const odpowiedz = await request.post("/api/push", { data: { id: crypto.randomUUID() } });
  expect([401, 503]).toContain(odpowiedz.status());
});
