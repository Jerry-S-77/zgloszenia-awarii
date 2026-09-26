import { expect, test, type Page } from "@playwright/test";
import { HASLO_TESTOWE, KONTA, klientAdmin, przygotujKonta, url } from "../wspolne/srodowisko";

const ZNACZNIK = `E2EZDJ-${Date.now()}`;
const HOST_TESTOWY = new URL(url()).host;
const KUBELEK = "zdjecia-awarii";

// Poprawny obraz PNG 1×1: aplikacja zmniejsza go i koduje do JPEG tak jak zdjęcie z aparatu.
const OBRAZ = {
  name: "awaria.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
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

async function zglosZeZdjeciem(page: Page, opis: string) {
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: /HVAC-01/ }).click();
  await page.getByLabel("Opis awarii").fill(opis);
  await page.getByTestId("pole-zdjec").setInputFiles(OBRAZ);
  await expect(page.getByRole("img", { name: "Zdjęcie 1" })).toBeVisible();
  await page.getByRole("button", { name: "Zgłoś awarię" }).click();
}

/** Czeka, aż miniatura wysłanego zdjęcia faktycznie się wczyta (podpisany link + CSP). */
async function oczekujWczytanegoZdjecia(page: Page) {
  const miniatura = page.getByRole("button", { name: "Zdjęcie 1", exact: true }).locator("img");
  await expect(miniatura).toBeVisible({ timeout: 45_000 });
  await expect
    .poll(() => miniatura.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
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

test.afterAll(async () => {
  const admin = klientAdmin();
  const { data } = await admin.from("awarie").select("id").like("opis_awarii", `${ZNACZNIK}%`);
  for (const { id } of data ?? []) {
    const { data: pliki } = await admin.storage.from(KUBELEK).list(id);
    if (pliki?.length)
      await admin.storage.from(KUBELEK).remove(pliki.map((p) => `${id}/${p.name}`));
  }
  await admin.from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
});

test("pracownik zgłasza awarię ze zdjęciem online i offline; zdjęcie offline wysyła się po powrocie sieci", async ({
  page,
  context,
}) => {
  const opisOnline = `${ZNACZNIK} online`;
  const opisOffline = `${ZNACZNIK} offline`;
  const karta = (opis: string) => page.getByRole("link").filter({ hasText: opis });
  const nawigacja = page.getByRole("navigation");

  await zaloguj(page, KONTA.pracownik.email);
  await zglosZeZdjeciem(page, opisOnline);
  await expect(page.getByText("Zgłoszenie zsynchronizowano")).toBeVisible();
  await karta(opisOnline).click();
  await oczekujWczytanegoZdjecia(page);
  await expect(page.getByText("Dodano zdjęcie")).toBeVisible();

  // Offline: kod ekranów jest już wczytany, nawigujemy bez przeładowania.
  await nawigacja.getByRole("link", { name: "Zgłoś" }).click();
  await expect(page.getByRole("button", { name: "Zgłoś awarię" })).toBeVisible();
  await context.setOffline(true);
  await zglosZeZdjeciem(page, opisOffline);
  await expect(page.getByText("Zapisano lokalnie, oczekuje na synchronizację")).toBeVisible();
  await karta(opisOffline).click();
  await expect(page.getByText("Czeka na wysłanie")).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("Czeka na wysłanie")).toBeHidden({ timeout: 45_000 });
  await oczekujWczytanegoZdjecia(page);
});

test("technik dodaje zdjęcie na karcie awarii i usuwa je", async ({ page }) => {
  const { data, error } = await klientAdmin()
    .from("awarie")
    .insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      opis_awarii: `${ZNACZNIK} karta`,
      krytycznosc_skutku: "Niska",
    })
    .select("id")
    .single();
  if (error) throw error;

  await zaloguj(page, KONTA.technik.email);
  await otworz(page, `/awarie/${data.id}`);
  await expect(page.getByText("Brak zdjęć.")).toBeVisible();
  await page.getByTestId("pole-zdjec-karty").setInputFiles(OBRAZ);
  await expect(page.getByText("Zdjęcie dodane")).toBeVisible();
  await oczekujWczytanegoZdjecia(page);

  await page.getByRole("button", { name: "Zdjęcie 1", exact: true }).click();
  await page.getByRole("button", { name: "Usuń zdjęcie" }).click();
  await expect(page.getByText("Zdjęcie usunięte")).toBeVisible();
  await expect(page.getByText("Brak zdjęć.")).toBeVisible();
  await expect(page.getByText("Usunięto zdjęcie")).toBeVisible();
});
