import { expect, test, type Page } from "@playwright/test";
import {
  HASLO_TESTOWE,
  KONTA,
  klientAdmin,
  przygotujKonta,
  url,
  zalogujLinkiem,
} from "../wspolne/srodowisko";

const ZNACZNIK = `E2E4-${Date.now()}`;
const HOST_TESTOWY = new URL(url()).host;
let awariaId = "";

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
  const admin = klientAdmin();
  const { error: bladUrzadzenia } = await admin.from("urzadzenia").upsert(
    {
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      status: "aktywne",
    },
    { onConflict: "nr_technologiczny" },
  );
  if (bladUrzadzenia) throw bladUrzadzenia;
  // Zgłoszenie od zalogowanego pracownika — tylko takie tworzą powiadomienia (nie zapis service-role).
  const pracownik = await zalogujLinkiem(KONTA.pracownik.email);
  const { data, error } = await pracownik
    .from("awarie")
    .insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      opis_awarii: `${ZNACZNIK} wyciek`,
      krytycznosc_skutku: "Wysoka",
    })
    .select("id")
    .single();
  if (error) throw error;
  awariaId = data.id;
});

test.afterAll(async () => {
  await klientAdmin().from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
});

test("technik widzi krytyczne powiadomienie w dzwonku i przechodzi do awarii", async ({ page }) => {
  await otworz(page, "/logowanie");
  await page.getByLabel("E-mail").fill(KONTA.technik.email);
  await page.getByLabel("Hasło").fill(HASLO_TESTOWE);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/logowanie"), { timeout: 15_000 });

  const dzwonek = page.getByRole("link", { name: /Powiadomienia: \d+ nieprzeczytane/ });
  await expect(dzwonek).toBeVisible();
  await page.locator("header").screenshot({ path: "test-results/naglowek-z-dzwonkiem.png" });
  await dzwonek.click();

  const wpis = page.getByRole("button", { name: new RegExp(`Krytyczna awaria.*${ZNACZNIK}`) });
  await expect(wpis).toBeVisible();
  await expect(wpis).toContainText("nieprzeczytane");
  await wpis.click();
  await page.waitForURL(`**/awarie/${awariaId}`);

  await otworz(page, "/powiadomienia");
  const poPrzeczytaniu = page.getByRole("button", {
    name: new RegExp(`Krytyczna awaria.*${ZNACZNIK}`),
  });
  await expect(poPrzeczytaniu).toBeVisible();
  await expect(poPrzeczytaniu).not.toContainText("nieprzeczytane");
});
