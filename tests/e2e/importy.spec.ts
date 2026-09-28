import { expect, test, type Page } from "@playwright/test";
import { HASLO_TESTOWE, KONTA, klientAdmin, przygotujKonta, url } from "../wspolne/srodowisko";

const PREFIKS = `E2EIMP${Date.now()}`;
const HOST_TESTOWY = new URL(url()).host;
const admin = klientAdmin();

const plik = (nazwa: string, tresc: string) => ({
  name: nazwa,
  mimeType: "text/csv",
  buffer: Buffer.from(`\uFEFF${tresc}`, "utf8"),
});

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
});

test.afterAll(async () => {
  await admin.from("urzadzenia").delete().like("nr_technologiczny", `${PREFIKS}%`);
  await admin.from("magazyn_czesci").delete().like("numer_katalogowy", `${PREFIKS}%`);
  await admin.from("powiadomienia").delete().like("tresc", `%${PREFIKS}%`);
});

test("admin importuje urządzenia z pliku; błędy widać w podglądzie", async ({ page }) => {
  await zaloguj(page, KONTA.admin.email);
  await otworz(page, "/admin/urzadzenia");
  await page.getByRole("button", { name: "Import z pliku" }).click();
  const arkusz = page.getByRole("dialog");
  await expect(arkusz.getByRole("link", { name: "Pobierz wzór pliku" })).toHaveAttribute(
    "href",
    "/wzory/wzor-importu-urzadzen.csv",
  );

  await arkusz
    .getByTestId("plik-importu")
    .setInputFiles(
      plik("zle.csv", `nr_technologiczny;nazwa_urzadzenia;krytycznosc\n${PREFIKS}-1;Pompa;pilna\n`),
    );
  await expect(
    arkusz.getByText("Wiersz 2: krytyczność to Niska, Średnia albo Wysoka."),
  ).toBeVisible();

  await arkusz
    .getByTestId("plik-importu")
    .setInputFiles(
      plik(
        "urzadzenia.csv",
        "nr_technologiczny;nazwa_urzadzenia;krytycznosc;wlasciciel_email;status\n" +
          `${PREFIKS}-1;Pompa ${PREFIKS};Średnia;${KONTA.technik.email};aktywne\n` +
          `${PREFIKS}-2;Waga ${PREFIKS};Niska;;\n`,
      ),
    );
  await expect(arkusz.getByText("2 urządzeń: 2 nowych, 0 do aktualizacji.")).toBeVisible();
  await arkusz.getByRole("button", { name: "Importuj 2 urządzeń" }).click();
  await expect(page.getByText("Zaimportowano: 2 nowych, 0 zaktualizowanych")).toBeVisible();
  await expect(page.getByText(`${PREFIKS}-1 · Pompa ${PREFIKS}`)).toBeVisible();
});

test("kierownik importuje harmonogram z listą kontrolną", async ({ page }) => {
  await zaloguj(page, KONTA.kierownik.email);
  await otworz(page, "/przeglady");
  await page.getByRole("button", { name: "Import harmonogramu z pliku" }).click();
  const arkusz = page.getByRole("dialog");
  await arkusz
    .getByTestId("plik-importu")
    .setInputFiles(
      plik(
        "przeglady.csv",
        "nr_technologiczny;typ_czynnosci;czestotliwosc_dni;data_ostatniego;lista_kontrolna\n" +
          `${PREFIKS}-1;Przegląd pompy;30;10.01.2026;Uszczelnienie|Łożyska\n`,
      ),
    );
  // Pusty przegląd z aktywacji zostaje wypełniony — to nowa pozycja harmonogramu.
  await expect(arkusz.getByText("1 przeglądów: 1 nowych, 0 do aktualizacji.")).toBeVisible();
  await expect(arkusz.getByText(/termin 2026-02-09 · 2 pkt listy/)).toBeVisible();
  await arkusz.getByRole("button", { name: "Importuj 1 przeglądów" }).click();
  await expect(page.getByText("Zaimportowano: 1 nowych, 0 zaktualizowanych")).toBeVisible();
  await expect(page.getByText("Przegląd pompy · termin 09.02.2026")).toBeVisible();
});

test("kierownik robi inwentaryzację i dostawę z pliku w magazynie", async ({ page }) => {
  const numer = `${PREFIKS}-C`;
  const { error } = await admin
    .from("magazyn_czesci")
    .insert({ numer_katalogowy: numer, nazwa: `Filtr ${PREFIKS}` });
  if (error) throw error;

  await zaloguj(page, KONTA.kierownik.email);
  await otworz(page, "/magazyn");
  await page.getByRole("button", { name: "Import z pliku" }).click();
  const arkusz = page.getByRole("dialog");

  await arkusz.getByRole("radio", { name: "Dostawa" }).click();
  await expect(arkusz.getByRole("link", { name: "Pobierz wzór pliku" })).toHaveAttribute(
    "href",
    "/wzory/wzor-dostawy.csv",
  );
  await arkusz
    .getByTestId("plik-importu")
    .setInputFiles(plik("dostawa.csv", `numer_katalogowy;ilosc;dokument\n${numer};5;WZ 7\n`));
  await expect(arkusz.getByText(`+ ${numer} — Filtr ${PREFIKS}: 5 szt. (WZ 7)`)).toBeVisible();
  await arkusz.getByRole("button", { name: "Przyjmij dostawę (1 poz.)" }).click();
  await expect(page.getByText("Przyjęto dostawę: 1 pozycji")).toBeVisible();

  await page.getByRole("button", { name: "Import z pliku" }).click();
  await arkusz.getByRole("radio", { name: "Inwentaryzacja" }).click();
  await arkusz
    .getByTestId("plik-importu")
    .setInputFiles(plik("inw.csv", `numer_katalogowy;stan_faktyczny\n${numer};4\n`));
  await expect(arkusz.getByText(`≠ ${numer}: 5 szt. → 4 szt.`)).toBeVisible();
  await arkusz.getByRole("button", { name: "Zapisz inwentaryzację (1)" }).click();
  await expect(page.getByText("Inwentaryzacja: 1 korekt, 0 bez zmian")).toBeVisible();
});
