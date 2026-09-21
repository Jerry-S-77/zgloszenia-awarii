import { expect, test, type Page } from "@playwright/test";
import { HASLO_TESTOWE, KONTA, klientAdmin, przygotujKonta, url } from "../wspolne/srodowisko";

const ZNACZNIK = `E2E-${Date.now()}`;
const EMAIL = `e2e-${Date.now()}@example.test`;
const NOWE_HASLO = "E2E-nowe-haslo-42";

const HOST_TESTOWY = new URL(url()).host;

/** Hosty *.supabase.co (inne niż projekt testowy), do których przeglądarka próbowała się połączyć. */
let zablokowane: string[] = [];

test.beforeEach(async ({ page }) => {
  zablokowane = [];
  // Fail-fast: ruch przeglądarki do innego projektu Supabase niż testowy jest przerywany i zapisywany.
  await page.route(
    (adres) => adres.hostname.endsWith(".supabase.co"),
    async (route) => {
      const host = new URL(route.request().url()).host;
      if (host === HOST_TESTOWY) {
        await route.continue();
      } else {
        zablokowane.push(host);
        await route.abort();
      }
    },
  );
});

test.afterEach(() => {
  expect(zablokowane, "żądania do obcego projektu Supabase").toEqual([]);
});

/**
 * Otwiera ścieżkę i czeka na hydrację Reacta (bez tego w dev kliknięcie wysyła natywny formularz GET).
 * Znacznik: React 19 zapisuje `__reactContainer$` na `document` już przy tworzeniu korzenia, ale
 * dopiero po hydracji elementu dokleja do niego `__reactProps$` (tam żyją handlery). Czekamy więc na
 * oba: korzeń oraz pierwszy <form>/<button> z `__reactProps$`.
 */
async function otworz(page: Page, sciezka: string) {
  await page.goto(sciezka);
  // Nowa ścieżka musi zawierać <form> lub <button>, inaczej to czekanie nigdy się nie spełni.
  await page.waitForFunction(
    () => {
      const maKlucz = (obiekt: object | null, prefiks: string) =>
        obiekt !== null && Object.getOwnPropertyNames(obiekt).some((k) => k.startsWith(prefiks));
      return (
        maKlucz(document, "__reactContainer$") &&
        maKlucz(document.querySelector("form, button"), "__reactProps$")
      );
    },
    undefined,
    { timeout: 15_000 },
  );
}

/** Usuwa dane E2E: dokładne (ten przebieg) i po prefiksie (pozostałości po przerwanych przebiegach). */
async function sprzatnij() {
  const admin = klientAdmin();

  for (const wzorzec of [`${ZNACZNIK}%`, "E2E-%"]) {
    const { error } = await admin.from("awarie").delete().like("opis_awarii", wzorzec);
    if (error) console.error(`Sprzątanie awarii E2E (${wzorzec}) nie powiodło się:`, error.message);
  }

  // Konta po prefiksie e-mail (auth.users; profil znika kaskadowo). Paginacja aż do wyczerpania.
  const PORCJA = 200;
  for (let strona = 1; ; strona++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: strona, perPage: PORCJA });
    if (error) {
      console.error("Lista kont do sprzątania E2E nie powiodła się:", error.message);
      break;
    }
    for (const u of data.users) {
      if (!u.email?.startsWith("e2e-")) continue;
      const { error: bladUsuniecia } = await admin.auth.admin.deleteUser(u.id);
      if (bladUsuniecia)
        console.error(`Usunięcie konta ${u.email} nie powiodło się:`, bladUsuniecia.message);
    }
    if (data.users.length < PORCJA) break;
  }

  // Dokładny profil tego przebiegu (gdyby konto auth już nie istniało, a profil został).
  const { error: bladProfilu } = await admin.from("profiles").delete().eq("email", EMAIL);
  if (bladProfilu) console.error("Usunięcie profilu E2E nie powiodło się:", bladProfilu.message);
}

test.beforeAll(async () => {
  await przygotujKonta();
  // Warunek wstępny: aktywne urządzenie HVAC-01 (świeży projekt testowy go nie ma).
  const { error } = await klientAdmin().from("urzadzenia").upsert(
    {
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      status_w_rejestrze: "Aktywne",
    },
    { onConflict: "nr_technologiczny" },
  );
  if (error) throw error;
  await sprzatnij();
});

test.afterAll(async () => {
  await sprzatnij();
});

test("konto z wymuszoną zmianą hasła nie wejdzie do aplikacji bez ustawienia hasła", async ({
  page,
}) => {
  await otworz(page, "/logowanie");
  await page.getByLabel("E-mail").fill(KONTA.zmianaHasla.email);
  await page.getByLabel("Hasło").fill(HASLO_TESTOWE);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page).toHaveURL(/\/zmiana-hasla/);
  await otworz(page, "/awarie");
  await expect(page).toHaveURL(/\/zmiana-hasla/);
});

test("pracownik widzi tylko swoje widoki i nie wejdzie do analiz", async ({ page }) => {
  await otworz(page, "/logowanie");
  await page.getByLabel("E-mail").fill(KONTA.pracownik.email);
  await page.getByLabel("Hasło").fill(HASLO_TESTOWE);
  await page.getByRole("button", { name: "Zaloguj się" }).click();

  const nawigacja = page.getByRole("navigation");
  await expect(nawigacja.getByRole("link", { name: "Moje" })).toBeVisible();
  await expect(nawigacja.getByRole("link", { name: "Zgłoś" })).toBeVisible();
  await expect(nawigacja.getByRole("link", { name: "Admin" })).toHaveCount(0);

  // Pełna nawigacja (nie ponowne logowanie): sesja Supabase zostaje w localStorage.
  await otworz(page, "/dashboard");
  await expect(page.getByText("Brak dostępu do tego widoku.")).toBeVisible();

  await otworz(page, "/awarie");
  await expect(page.getByRole("heading", { name: "Moje awarie" })).toBeVisible();
});

test("admin zakłada konto, użytkownik zmienia hasło i zgłasza awarię", async ({ page }) => {
  // Niezalogowany trafia na logowanie.
  await otworz(page, "/");
  await expect(page).toHaveURL(/\/logowanie/);

  // Admin zakłada konto technika.
  await page.getByLabel("E-mail").fill(KONTA.admin.email);
  await page.getByLabel("Hasło").fill(HASLO_TESTOWE);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.getByRole("link", { name: "Admin" }).click();
  await expect(page.getByRole("heading", { name: "Użytkownicy" })).toBeVisible();
  await page.getByRole("button", { name: "Nowe konto" }).click();
  await page.getByLabel("E-mail (login)").fill(EMAIL);
  await page.getByLabel("Imię i nazwisko").fill("Ewa E2E");
  await page.getByRole("button", { name: "Technik", exact: true }).click();
  await page.getByRole("button", { name: "Utwórz konto" }).click();
  const haslo = ((await page.getByTestId("haslo-tymczasowe").textContent()) ?? "").trim();
  expect(haslo).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
  // Serwerowe funkcje kont też trafiły do projektu testowego (nie tylko przeglądarka).
  const { data: profil, error: bladProfilu } = await klientAdmin()
    .from("profiles")
    .select("id")
    .eq("email", EMAIL)
    .maybeSingle();
  expect(bladProfilu).toBeNull();
  expect(profil, "profil nowego konta w projekcie testowym").not.toBeNull();
  await page.getByRole("button", { name: "Zamknij" }).click();

  // Wylogowanie.
  await page.getByRole("button", { name: "Menu konta" }).click();
  await page.getByRole("menuitem", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/logowanie/);

  // Nowy użytkownik: logowanie hasłem tymczasowym i wymuszona zmiana hasła.
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Hasło").fill(haslo);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page).toHaveURL(/\/zmiana-hasla/);
  await page.getByLabel("Nowe hasło (min. 12 znaków)").fill(NOWE_HASLO);
  await page.getByLabel("Powtórz hasło").fill(NOWE_HASLO);
  await page.getByRole("button", { name: "Zapisz hasło" }).click();
  await expect(page.getByRole("button", { name: "Zgłoś awarię" })).toBeVisible();

  // Zgłoszenie awarii i widoczność na liście.
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: /HVAC-01/ }).click();
  await page.getByLabel("Opis awarii").fill(`${ZNACZNIK} pompa nie startuje`);
  await page.getByRole("button", { name: "Zgłoś awarię" }).click();
  await expect(page).toHaveURL(/\/awarie/);
  await expect(page.getByText(`${ZNACZNIK} pompa nie startuje`)).toBeVisible();
});
