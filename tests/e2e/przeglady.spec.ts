import { expect, test, type Page } from "@playwright/test";
import { HASLO_TESTOWE, KONTA, klientAdmin, przygotujKonta, url } from "../wspolne/srodowisko";

const PREFIKS = `E2E3-${Date.now().toString(36).toUpperCase()}`;
const NR = `${PREFIKS}-A`;
const NR_NOWE = `${PREFIKS}-B`;
const HOST_TESTOWY = new URL(url()).host;
let przegladId = "";

test.describe.configure({ mode: "serial" });

function dzis(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());
}
function dodajDni(data: string, dni: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dni);
  return d.toISOString().slice(0, 10);
}
const poPolsku = (data: string) => data.split("-").reverse().join(".");

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

async function sprzatnij() {
  const admin = klientAdmin();
  await admin.from("awarie").delete().like("nr_technologiczny", `${PREFIKS}%`);
  await admin.from("urzadzenia").delete().like("nr_technologiczny", `${PREFIKS}%`);
}

test.beforeAll(async () => {
  await przygotujKonta();
  const admin = klientAdmin();
  const { error } = await admin
    .from("urzadzenia")
    .insert({ nr_technologiczny: NR, nazwa_urzadzenia: "Centrala E2E", status: "aktywne" });
  if (error) throw error;
  const { data: przeglad, error: bladPrzegladu } = await admin
    .from("przeglady")
    .update({
      typ_czynnosci: "Przegląd E2E",
      czestotliwosc_dni: 30,
      data_najblizszego: dodajDni(dzis(), 20),
    })
    .eq("nr_technologiczny", NR)
    .select("id")
    .single();
  if (bladPrzegladu || !przeglad) throw bladPrzegladu ?? new Error("Brak przeglądu");
  przegladId = przeglad.id;
  // Trzy awarie w 90 dni: baza sama tworzy propozycję przyspieszenia (termin dziś + 7).
  for (const dni of [30, 10, 1]) {
    const { error: bladAwarii } = await admin.from("awarie").insert({
      nr_technologiczny: NR,
      nazwa_urzadzenia: "Centrala E2E",
      opis_awarii: `${PREFIKS} awaria`,
      krytycznosc_skutku: "Niska",
      data_awarii: new Date(Date.now() - dni * 86_400_000).toISOString(),
    });
    if (bladAwarii) throw bladAwarii;
  }
});

test.afterAll(sprzatnij);

test("kierownik zatwierdza propozycję przyspieszenia i widzi nowy termin", async ({ page }) => {
  await zaloguj(page, KONTA.kierownik.email);
  await otworz(page, "/przeglady");
  await expect(page.getByRole("link", { name: /Przeglądy/ })).toBeVisible();
  await page.getByText(NR).click();
  await expect(page.getByText("Zalecane przyspieszenie przeglądu")).toBeVisible();
  await page.getByRole("button", { name: "Zatwierdź" }).click();
  await expect(page.getByText("Zatwierdzono nowy termin przeglądu")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zatwierdź" })).toHaveCount(0);
  await expect(page.getByText(poPolsku(dodajDni(dzis(), 7)), { exact: false })).toBeVisible();
});

test("technik odnotowuje wykonanie, a następny termin liczy się sam", async ({ page }) => {
  await zaloguj(page, KONTA.technik.email);
  await otworz(page, `/przeglady/${przegladId}`);
  await expect(page.getByText("Brak odnotowanych wykonań.")).toBeVisible();
  await page.getByRole("button", { name: "Odnotuj wykonanie" }).click();
  const arkusz = page.getByRole("dialog");
  await expect(
    arkusz.getByText(`Następny termin: ${poPolsku(dodajDni(dzis(), 30))}`),
  ).toBeVisible();
  await arkusz.getByLabel("Uwagi").fill("Filtry wymienione");
  await arkusz.getByRole("button", { name: "Zapisz" }).click();
  await expect(page.getByText("Odnotowano wykonanie przeglądu")).toBeVisible();
  await expect(page.getByText("Uwagi: Filtry wymienione")).toBeVisible();
  await expect(page.getByText(`${poPolsku(dodajDni(dzis(), 30))} (za 30 dni)`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Edytuj harmonogram" })).toHaveCount(0);
});

test("admin dodaje i aktywuje urządzenie, a przegląd czeka na uzupełnienie", async ({ page }) => {
  await zaloguj(page, KONTA.admin.email);
  await otworz(page, "/admin/urzadzenia");
  await page.getByRole("button", { name: "Dodaj urządzenie" }).click();
  const arkusz = page.getByRole("dialog");
  await arkusz.getByLabel("Numer technologiczny").fill(NR_NOWE);
  await arkusz.getByLabel("Nazwa").fill("Nowa pompa E2E");
  await arkusz.getByRole("button", { name: "Dodaj urządzenie" }).click();
  await expect(page.getByText("Dodano urządzenie (status: Proponowane)")).toBeVisible();

  await page.getByRole("button", { name: new RegExp(NR_NOWE) }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Aktywuj urządzenie" }).click();
  await expect(page.getByText("Status: Aktywne")).toBeVisible();

  await otworz(page, "/przeglady");
  await page.getByRole("button", { name: /Do uzupełnienia/ }).click();
  await expect(page.getByText(NR_NOWE)).toBeVisible();
});
