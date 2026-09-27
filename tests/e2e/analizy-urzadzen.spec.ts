import { expect, test, type Page } from "@playwright/test";
import { HASLO_TESTOWE, KONTA, klientAdmin, przygotujKonta, url } from "../wspolne/srodowisko";

const ZNACZNIK = `E2EANL-${Date.now()}`;
const HOST_TESTOWY = new URL(url()).host;
const admin = klientAdmin();
let bezKategorii = "";

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

async function wstawZamknieta(dniTemu: number, kategoria: "mechaniczna" | null, przestoj: number) {
  const data = new Date(Date.now() - dniTemu * 86_400_000).toISOString();
  const { data: wiersz, error } = await admin
    .from("awarie")
    .insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      opis_awarii: `${ZNACZNIK} ${dniTemu}`,
      krytycznosc_skutku: "Srednia",
      data_awarii: data,
      status: "zamknieta",
      przyczyna: "test",
      czas_przestoju_h: przestoj,
      data_zamkniecia: data,
      kategoria_przyczyny: kategoria,
    })
    .select("id")
    .single();
  if (error) throw error;
  return wiersz.id;
}

test.beforeAll(async () => {
  await przygotujKonta();
  const { error } = await admin.from("urzadzenia").upsert(
    {
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      status: "aktywne",
    },
    { onConflict: "nr_technologiczny" },
  );
  if (error) throw error;
  await wstawZamknieta(5, "mechaniczna", 3);
  await wstawZamknieta(20, "mechaniczna", 1);
  bezKategorii = await wstawZamknieta(40, null, 2);
});

test.afterAll(async () => {
  await admin.from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
});

test("kierownik widzi niezawodność i Pareto, przechodzi do karty urządzenia", async ({ page }) => {
  await zaloguj(page, KONTA.kierownik.email);
  await otworz(page, "/dashboard");
  await expect(page.getByRole("heading", { name: "Niezawodność" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Przyczyny (Pareto)" })).toBeVisible();
  const pareto = page.getByRole("list", { name: "Przyczyny awarii od najczęstszej" });
  await expect(pareto.getByText("Mechaniczna")).toBeVisible();
  await page.getByRole("radio", { name: "Przestój" }).click();
  await expect(pareto.getByText(/h ·/).first()).toBeVisible();

  await page.getByRole("table").getByRole("link", { name: "HVAC-01" }).click();
  await expect(page).toHaveURL(/\/urzadzenia\/HVAC-01/);
  await expect(page.getByRole("heading", { name: /Historia awarii/ })).toBeVisible();
  await expect(page.getByText("MTBF")).toBeVisible();
  await expect(page.getByText(`${ZNACZNIK} 5`)).toBeVisible();
});

test("technik uzupełnia kategorię zamkniętej awarii bez kategorii", async ({ page }) => {
  await zaloguj(page, KONTA.technik.email);
  await otworz(page, `/awarie/${bezKategorii}`);
  await expect(page.getByText("Nie określono")).toBeVisible();
  await page.getByRole("radio", { name: "Elektryczna" }).click();
  await page.getByRole("button", { name: "Zapisz kategorię" }).click();
  await expect(page.getByText("Kategoria zapisana")).toBeVisible();
  await expect(page.getByText("Uzupełnij kategorię przyczyny")).toHaveCount(0);
  await expect(page.getByText("Elektryczna", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /HVAC-01 — / }).click();
  await expect(page).toHaveURL(/\/urzadzenia\/HVAC-01/);
});
