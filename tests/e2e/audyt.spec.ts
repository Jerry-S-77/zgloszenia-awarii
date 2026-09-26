import { expect, test, type Page } from "@playwright/test";
import { HASLO_TESTOWE, KONTA, przygotujKonta, url } from "../wspolne/srodowisko";

const HOST_TESTOWY = new URL(url()).host;
const MIN_DOTYK = 44;

const EKRANY_ADMINA = [
  "/",
  "/awarie",
  "/zadania",
  "/przeglady",
  "/dashboard",
  "/eksport",
  "/admin/uzytkownicy",
  "/admin/urzadzenia",
  "/powiadomienia",
];
const EKRANY_PRACOWNIKA = ["/", "/awarie", "/powiadomienia"];

test.beforeAll(async () => {
  await przygotujKonta();
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

/** Przyciski i linki mniejsze niż 44×44 px (widoczne, w nagłówku, pasku dolnym i treści). */
async function zaMaleElementy(page: Page): Promise<string[]> {
  return page.evaluate((min) => {
    const wyniki: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      "header a, header button, nav a, nav button, main button, main a, main [role=combobox]",
    )) {
      const r = el.getBoundingClientRect();
      const styl = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || styl.visibility === "hidden") continue;
      if (r.width < min - 0.5 || r.height < min - 0.5) {
        const nazwa = (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim();
        wyniki.push(`${nazwa.slice(0, 40)} (${Math.round(r.width)}×${Math.round(r.height)})`);
      }
    }
    return wyniki;
  }, MIN_DOTYK);
}

async function sprawdzEkrany(page: Page, ekrany: string[]) {
  const naruszenia: string[] = [];
  page.on("console", (msg) => {
    const tekst = msg.text();
    if (/Content Security Policy|Refused to (load|connect|execute|apply)/i.test(tekst)) {
      naruszenia.push(tekst);
    }
  });
  await page.route(
    (adres) => adres.hostname.endsWith(".supabase.co"),
    async (route) => {
      if (new URL(route.request().url()).host === HOST_TESTOWY) await route.continue();
      else await route.abort();
    },
  );
  const zaMale: string[] = [];
  for (const sciezka of ekrany) {
    await otworz(page, sciezka);
    await page.waitForTimeout(800);
    for (const e of await zaMaleElementy(page)) zaMale.push(`${sciezka}: ${e}`);
  }
  expect(naruszenia, "naruszenia CSP w konsoli").toEqual([]);
  expect(zaMale, "elementy dotykowe mniejsze niż 44×44 px").toEqual([]);
}

test("odpowiedzi serwera mają nagłówki bezpieczeństwa", async ({ request }) => {
  const odpowiedz = await request.get("/logowanie");
  const naglowki = odpowiedz.headers();
  expect(naglowki["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(naglowki["x-frame-options"]).toBe("DENY");
  expect(naglowki["x-content-type-options"]).toBe("nosniff");
  expect(naglowki["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(naglowki["permissions-policy"]).toContain("camera=()");
});

test("admin: główne ekrany bez naruszeń CSP i z dużymi elementami dotykowymi", async ({ page }) => {
  await zaloguj(page, KONTA.admin.email);
  await sprawdzEkrany(page, EKRANY_ADMINA);
});

test("pracownik: ekrany bez naruszeń CSP i z dużymi elementami dotykowymi", async ({ page }) => {
  await zaloguj(page, KONTA.pracownik.email);
  await sprawdzEkrany(page, EKRANY_PRACOWNIKA);
});
