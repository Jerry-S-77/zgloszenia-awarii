import { expect, test, type Page } from "@playwright/test";
import { HASLO_TESTOWE, KONTA, klientAdmin, przygotujKonta, url } from "../wspolne/srodowisko";

const NR = `E2ELK-${Date.now()}`;
const HOST_TESTOWY = new URL(url()).host;
let przegladId = "";

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
  const admin = klientAdmin();
  const { error } = await admin
    .from("urzadzenia")
    .insert({ nr_technologiczny: NR, nazwa_urzadzenia: "Centrala LK", status: "aktywne" });
  if (error) throw error;
  const { data, error: blad } = await admin
    .from("przeglady")
    .update({ typ_czynnosci: "Przegląd LK", czestotliwosc_dni: 30 })
    .eq("nr_technologiczny", NR)
    .select("id")
    .single();
  if (blad || !data) throw blad ?? new Error("Brak przeglądu");
  przegladId = data.id;
});

test.afterAll(async () => {
  await klientAdmin().from("urzadzenia").delete().eq("nr_technologiczny", NR);
});

test("kierownik układa listę kontrolną w harmonogramie", async ({ page }) => {
  await zaloguj(page, KONTA.kierownik.email);
  await otworz(page, `/przeglady/${przegladId}`);
  await page.getByRole("button", { name: "Edytuj harmonogram" }).click();
  const arkusz = page.getByRole("dialog");
  await arkusz.getByRole("button", { name: "Dodaj punkt" }).click();
  await arkusz.getByLabel("Punkt 1", { exact: true }).fill("Pomiar ciśnienia");
  await arkusz.getByRole("button", { name: "Dodaj punkt" }).click();
  await arkusz.getByLabel("Punkt 2", { exact: true }).fill("Sprawdź filtr wstępny");
  // Kolejność ma znaczenie: filtr sprawdzamy jako pierwszy.
  await arkusz.getByRole("button", { name: "Przesuń punkt 2 w górę" }).click();
  await arkusz.getByRole("button", { name: "Zapisz harmonogram" }).click();
  await expect(page.getByText("Zapisano harmonogram")).toBeVisible();
  const punkty = page.getByRole("listitem");
  await expect(punkty.nth(0)).toHaveText("Sprawdź filtr wstępny");
  await expect(punkty.nth(1)).toHaveText("Pomiar ciśnienia");
});

test("technik musi ocenić każdy punkt; nieprawidłowość z opisem trafia do historii", async ({
  page,
}) => {
  await zaloguj(page, KONTA.technik.email);
  await otworz(page, `/przeglady/${przegladId}`);
  await page.getByRole("button", { name: "Odnotuj wykonanie" }).click();
  const arkusz = page.getByRole("dialog");
  await arkusz.getByRole("button", { name: "Zapisz" }).click();
  await expect(page.getByText("Oceń punkt: Sprawdź filtr wstępny")).toBeVisible();

  await arkusz
    .getByRole("radiogroup", { name: "Wynik: Sprawdź filtr wstępny" })
    .getByRole("radio", { name: "Nieprawidłowość" })
    .click();
  await arkusz
    .getByRole("radiogroup", { name: "Wynik: Pomiar ciśnienia" })
    .getByRole("radio", { name: "OK" })
    .click();
  await arkusz.getByRole("button", { name: "Zapisz" }).click();
  await expect(page.getByText("Opisz nieprawidłowość: Sprawdź filtr wstępny")).toBeVisible();
  await arkusz.getByLabel("Opis nieprawidłowości: Sprawdź filtr wstępny").fill("Filtr zatkany");
  await arkusz.getByRole("button", { name: "Zapisz" }).click();

  await expect(page.getByText("Odnotowano wykonanie przeglądu")).toBeVisible();
  await expect(page.getByText("Lista kontrolna: 1 OK, 1 nieprawidłowość")).toBeVisible();
  await expect(page.getByText("• Sprawdź filtr wstępny: Filtr zatkany")).toBeVisible();
});

test("kierownik dostaje powiadomienie o nieprawidłowości", async ({ page }) => {
  await zaloguj(page, KONTA.kierownik.email);
  await otworz(page, "/powiadomienia");
  await expect(
    page.getByText(`Przegląd ${NR}: 1 nieprawidłowość na liście kontrolnej`),
  ).toBeVisible();
});
