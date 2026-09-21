import { expect, test, type Page } from "@playwright/test";
import { HASLO_TESTOWE, KONTA, klientAdmin, przygotujKonta, url } from "../wspolne/srodowisko";

const ZNACZNIK = `E2E-${Date.now()}`;
const EMAIL = `e2e-${Date.now()}@example.test`;
const NOWE_HASLO = "E2E-nowe-haslo-42";

/** Otwiera ścieżkę i czeka na hydrację (bez tego w dev kliknięcie wysyła natywny formularz). */
async function otworz(page: Page, sciezka: string) {
  await page.goto(sciezka);
  await page.waitForLoadState("networkidle");
}

test.beforeAll(async () => {
  await przygotujKonta();
});

test.afterAll(async () => {
  const admin = klientAdmin();
  const { error: bladAwarii } = await admin
    .from("awarie")
    .delete()
    .like("opis_awarii", `${ZNACZNIK}%`);
  if (bladAwarii) console.error("Sprzątanie awarii E2E nie powiodło się:", bladAwarii.message);

  const { data, error: bladProfilu } = await admin
    .from("profiles")
    .select("id")
    .eq("email", EMAIL)
    .maybeSingle();
  if (bladProfilu) console.error("Odczyt profilu E2E nie powiódł się:", bladProfilu.message);
  if (data) {
    const { error } = await admin.auth.admin.deleteUser(data.id);
    if (error) console.error("Usunięcie konta E2E nie powiodło się:", error.message);
  }
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

  // Przejście w aplikacji (bez przeładowania), żeby nie zużywać kolejnego logowania.
  await otworz(page, "/dashboard");
  await expect(page.getByText("Brak dostępu do tego widoku.")).toBeVisible();

  await otworz(page, "/awarie");
  await expect(page.getByRole("heading", { name: "Moje awarie" })).toBeVisible();
});

test("admin zakłada konto, użytkownik zmienia hasło i zgłasza awarię", async ({ page }) => {
  const hosty = new Set<string>();
  page.on("request", (r) => {
    const host = new URL(r.url()).host;
    if (host.endsWith("supabase.co")) hosty.add(host);
  });

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

  // Zabezpieczenie: cały ruch szedł do projektu testowego.
  expect([...hosty]).toEqual([new URL(url()).host]);
});
