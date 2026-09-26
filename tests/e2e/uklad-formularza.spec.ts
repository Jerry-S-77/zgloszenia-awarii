import { expect, test, type Page } from "@playwright/test";
import { HASLO_TESTOWE, KONTA, klientAdmin, przygotujKonta, url } from "../wspolne/srodowisko";

const HOST_TESTOWY = new URL(url()).host;

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

test.beforeAll(async () => {
  await przygotujKonta();
  const { error } = await klientAdmin().from("urzadzenia").upsert(
    {
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      status: "aktywne",
    },
    { onConflict: "nr_technologiczny" },
  );
  if (error) throw error;
});

test("przyciski krytyczności są widoczne nad dolnym paskiem bez przewijania", async ({ page }) => {
  // Realna widoczna wysokość telefonu z paskami przeglądarki (Pixel 7 w emulatorze ma 839 px bez nich).
  await page.setViewportSize({ width: 412, height: 740 });
  await otworz(page, "/logowanie");
  await page.getByLabel("E-mail").fill(KONTA.pracownik.email);
  await page.getByLabel("Hasło").fill(HASLO_TESTOWE);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/logowanie"), { timeout: 15_000 });

  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: /HVAC-01/ }).click();
  await page.evaluate(() => window.scrollTo(0, 0));

  const pasek = await page.locator("nav").last().boundingBox();
  if (!pasek) throw new Error("Brak dolnego paska");
  // Okrągły przycisk „Zgłoś” wystaje ok. 20 px ponad pasek — liczymy od jego górnej krawędzi.
  const granica = pasek.y - 20;
  for (const nazwa of ["Niska", "Srednia", "Wysoka"]) {
    const przycisk = await page.getByRole("button", { name: nazwa, exact: true }).boundingBox();
    expect(przycisk, nazwa).not.toBeNull();
    expect(przycisk!.y + przycisk!.height, nazwa).toBeLessThanOrEqual(granica);
  }
});
