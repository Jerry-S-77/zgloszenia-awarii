import { expect, test, type Page } from "@playwright/test";
import { HASLO_TESTOWE, KONTA, klientAdmin, przygotujKonta, url } from "../wspolne/srodowisko";

const ZNACZNIK = `E2E3B-${Date.now()}`;
const HOST_TESTOWY = new URL(url()).host;
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
  const { data, error } = await admin
    .from("awarie")
    .insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      opis_awarii: `${ZNACZNIK} zespół`,
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

test("technik dołącza do zadania i widzi je w Zadaniach", async ({ page }) => {
  await zaloguj(page, KONTA.technik.email);
  await otworz(page, `/awarie/${awariaId}`);
  await expect(page.getByText("Nikt jeszcze nie zajmuje się tą awarią.")).toBeVisible();
  await page.getByRole("button", { name: "Dołącz do zadania" }).click();
  await expect(page.getByText("(Ty)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Opuść zadanie" })).toBeVisible();
  await otworz(page, "/zadania");
  const moje = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Przypisane do mnie" }) });
  await expect(moje.getByText(`${ZNACZNIK} zespół`)).toBeVisible();
});

test("kierownik dodaje drugą osobę i usuwa technika; historia z nazwiskami", async ({ page }) => {
  await zaloguj(page, KONTA.kierownik.email);
  await otworz(page, `/awarie/${awariaId}`);
  await expect(page.getByText("Test technik", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Osoba do dodania" }).click();
  await page.getByRole("option", { name: /Test admin/ }).click();
  await page.getByRole("button", { name: "Dodaj", exact: true }).click();
  await expect(page.getByText("Dodano do zespołu: Test admin")).toBeVisible();
  await page.getByRole("button", { name: "Usuń z zespołu: Test technik" }).click();
  await expect(page.getByText("Usunięto z zespołu: Test technik")).toBeVisible();
  await expect(page.getByText("Do zespołu dołączył(a): Test admin")).toBeVisible();
  await expect(page.getByText("Z zespołu odszedł/odeszła: Test technik")).toBeVisible();
});

test("offline: baner mówi, co można, a przyciski online są wyłączone", async ({
  page,
  context,
}) => {
  await zaloguj(page, KONTA.technik.email);
  await otworz(page, `/awarie/${awariaId}`);
  await expect(page.getByRole("button", { name: "Dołącz do zadania" })).toBeEnabled();
  await context.setOffline(true);
  const baner = page.getByRole("status").filter({ hasText: "Brak połączenia" });
  await expect(baner).toBeVisible();
  await baner.getByText("Co możesz teraz zrobić?").click();
  await expect(baner.getByText("Zgłosić awarię — wyśle się sama po powrocie sieci")).toBeVisible();
  await expect(baner.getByText("Dodawać komentarzy")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dołącz do zadania" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Komentarze wymagają połączenia" })).toBeDisabled();
  await context.setOffline(false);
  await expect(baner).toHaveCount(0);
});
