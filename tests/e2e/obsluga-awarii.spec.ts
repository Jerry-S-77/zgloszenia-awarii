import { expect, test, type Page } from "@playwright/test";
import { HASLO_TESTOWE, KONTA, klientAdmin, przygotujKonta, url } from "../wspolne/srodowisko";

const ZNACZNIK = `E2E2-${Date.now()}`;
const HOST_TESTOWY = new URL(url()).host;
let zablokowane: string[] = [];

test.beforeEach(async ({ page }) => {
  zablokowane = [];
  await page.route(
    (adres) => adres.hostname.endsWith(".supabase.co"),
    async (route) => {
      const host = new URL(route.request().url()).host;
      if (host === HOST_TESTOWY) await route.continue();
      else {
        zablokowane.push(host);
        await route.abort();
      }
    },
  );
});
test.afterEach(() => expect(zablokowane, "żądania do obcego projektu Supabase").toEqual([]));

async function otworz(page: Page, sciezka: string) {
  await page.goto(sciezka);
  await page.waitForFunction(
    () => {
      const maKlucz = (o: object | null, p: string) =>
        o !== null && Object.getOwnPropertyNames(o).some((k) => k.startsWith(p));
      return maKlucz(document, "__reactContainer$") && maKlucz(document.querySelector("form, button"), "__reactProps$");
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
  // Czekamy na klientowe przekierowanie z "/logowanie" (auth.stan === "zalogowany"): bez tego
  // kolejne pełne przeładowanie (otworz) czasem wystartowałoby, zanim sesja zdąży się zapisać.
  await page.waitForURL((u) => !u.pathname.startsWith("/logowanie"), { timeout: 15_000 });
}

test.beforeAll(async () => {
  await przygotujKonta();
  const { error } = await klientAdmin().from("urzadzenia").upsert(
    { nr_technologiczny: "HVAC-01", nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI", status_w_rejestrze: "Aktywne" },
    { onConflict: "nr_technologiczny" },
  );
  if (error) throw error;
  await klientAdmin().from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`);
});
test.afterAll(() => klientAdmin().from("awarie").delete().like("opis_awarii", `${ZNACZNIK}%`));

test("technik przyjmuje, naprawia, zamyka z komentarzem; historia i numer widoczne", async ({ page }) => {
  const opis = `${ZNACZNIK} pompa głośna`;
  await zaloguj(page, KONTA.pracownik.email);
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: /HVAC-01/ }).click();
  await page.getByLabel("Opis awarii").fill(opis);
  await page.getByRole("button", { name: "Zgłoś awarię" }).click();
  await expect(page.getByText(opis)).toBeVisible();
  // Toast sukcesu ("top-center") zasłania nagłówek (i przycisk "Menu konta") na czas wyświetlania.
  // Czekamy, aż zniknie CAŁKOWICIE z DOM (nie tylko chwilowo "niewidoczny" w trakcie animacji
  // wyjścia, co bywa złudne), plus mały zapas na dokończenie animacji przed kliknięciem w nagłówek.
  await expect(page.getByText("Zgłoszenie zsynchronizowano")).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Menu konta" }).click();
  await page.getByRole("menuitem", { name: "Wyloguj" }).click();

  await zaloguj(page, KONTA.technik.email);
  await otworz(page, "/awarie");
  await page.getByText(opis).click();
  await expect(page.getByText("oczekuje na numer")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /AWR-\d{4}-\d{3}/ })).toBeVisible();

  // Oś statusów pokazuje wszystkie cztery etykiety cały czas — sprawdzamy więc rzeczywisty skutek
  // przejścia po tym, jaki przycisk kolejnego kroku się pojawia, a nie po samej etykiecie na osi.
  await page.getByRole("button", { name: "Przyjmij zgłoszenie" }).click();
  await expect(page.getByRole("button", { name: "Rozpocznij naprawę" })).toBeVisible();
  await page.getByRole("button", { name: "Rozpocznij naprawę" }).click();
  await expect(page.getByRole("button", { name: "Wstrzymaj — czeka na część" })).toBeVisible();

  await page.getByPlaceholder("Dodaj komentarz...").fill("Wymieniono uszczelkę.");
  await page.getByRole("button", { name: "Dodaj komentarz" }).click();
  await expect(page.getByText("Wymieniono uszczelkę.")).toBeVisible();

  await page.getByRole("button", { name: "Zamknij awarię" }).click();
  await page.getByLabel("Przyczyna").fill("Uszkodzona uszczelka");
  await page.getByLabel("Czas przestoju (h)").fill("1.5");
  await page.getByRole("button", { name: "Zamknij awarię" }).click();
  // Z "zamknieta" technik nie ma żadnego dalszego przejścia: sekcja znika całkowicie.
  await expect(page.getByRole("heading", { name: "Kolejny krok" })).toHaveCount(0);
  await expect(page.getByText("Status: Zgłoszona → Przyjęta")).toBeVisible();
});

test("technik nie może ponownie otworzyć zamkniętej awarii, kierownik może", async ({ page }) => {
  const opis = `${ZNACZNIK} zamknięta do reopenu`;
  const admin = klientAdmin();
  const { data: zgloszajacy } = await admin.from("profiles").select("id").eq("email", KONTA.pracownik.email).single();
  const { data: awaria } = await admin
    .from("awarie")
    .insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      opis_awarii: opis,
      krytycznosc_skutku: "Niska",
      status: "zamknieta",
      przyczyna: "Test",
      czas_przestoju_h: 1,
      data_zamkniecia: new Date().toISOString(),
      zglaszajacy_id: zgloszajacy?.id ?? null,
      zglaszajacy_nazwa: "Test pracownik",
    })
    .select("id")
    .single();
  expect(awaria).not.toBeNull();

  await zaloguj(page, KONTA.technik.email);
  await otworz(page, `/awarie/${awaria?.id}`);
  await expect(page.getByRole("button", { name: "Otwórz ponownie" })).toHaveCount(0);

  await page.getByRole("button", { name: "Menu konta" }).click();
  await page.getByRole("menuitem", { name: "Wyloguj" }).click();
  await zaloguj(page, KONTA.kierownik.email);
  await otworz(page, `/awarie/${awaria?.id}`);
  await page.getByRole("button", { name: "Otwórz ponownie" }).click();
  // Po ponownym otwarciu kierownik (jak technik) ma znów dostęp do zwykłych przejść z "w_naprawie".
  await expect(page.getByRole("button", { name: "Wstrzymaj — czeka na część" })).toBeVisible();
});

test("konflikt wersji offline trafia do 'Do sprawdzenia' i nie blokuje reszty kolejki", async ({
  page,
  context,
}) => {
  const admin = klientAdmin();
  const opisKonflikt = `${ZNACZNIK} konflikt wersji`;
  const opisNowe = `${ZNACZNIK} nowe zgloszenie w tej samej partii`;

  // Warunek wstępny: awaria w stanie w_naprawie, żeby był dostępny dalszy krok offline.
  const { data: zgloszajacy } = await admin
    .from("profiles")
    .select("id")
    .eq("email", KONTA.pracownik.email)
    .single();
  const { data: awaria } = await admin
    .from("awarie")
    .insert({
      nr_technologiczny: "HVAC-01",
      nazwa_urzadzenia: "AHU nr 1 - strefa CNC HPAPI",
      opis_awarii: opisKonflikt,
      krytycznosc_skutku: "Niska",
      status: "w_naprawie",
      zglaszajacy_id: zgloszajacy?.id ?? null,
      zglaszajacy_nazwa: "Test pracownik",
    })
    .select("id, wersja")
    .single();
  expect(awaria).not.toBeNull();

  // Logujemy się (ląduje na "/", więc lista urządzeń trafia do pamięci zapytań, gdy jeszcze jest
  // sieć) i przechodzimy do szczegółów WYŁĄCZNIE nawigacją kliencką (żadnego pełnego przeładowania po
  // wejściu offline — offline w trybie deweloperskim nie da się dograć kodu nowej trasy).
  await zaloguj(page, KONTA.technik.email);
  await expect(page.getByRole("button", { name: "Zgłoś awarię" })).toBeVisible();
  const nawigacja = page.getByRole("navigation");
  await nawigacja.getByRole("link", { name: "Awarie" }).click();
  await page.getByRole("link").filter({ hasText: opisKonflikt }).click();
  await expect(page.getByRole("button", { name: "Zamknij awarię" })).toBeVisible();

  await context.setOffline(true);

  // Offline: kliknięcie kolejnego kroku kolejkuje aktualizację z bieżącą (jeszcze aktualną) wersją.
  await page.getByRole("button", { name: "Wstrzymaj — czeka na część" }).click();
  await expect(page.getByText("Zapisano lokalnie, oczekuje na synchronizację")).toBeVisible();
  // Ten sam komunikat pojawi się drugi raz przy kolejnym zgłoszeniu poniżej: czekamy, aż pierwszy
  // toast zniknie, żeby druga asercja "toBeVisible" nie trafiła na dwa dopasowania naraz.
  await expect(page.getByText("Zapisano lokalnie, oczekuje na synchronizację")).toBeHidden({
    timeout: 10_000,
  });

  // Ktoś inny (serwisowo) zmienia ten sam wiersz, zanim offline zdąży się zsynchronizować:
  // wersja w bazie rośnie, więc kolejka zsynchronizuje się z nieaktualną wersją w WHERE.
  const { error: bladAdmina } = await admin
    .from("awarie")
    .update({ status: "zamknieta", przyczyna: "Test", czas_przestoju_h: 1, data_zamkniecia: new Date().toISOString() })
    .eq("id", awaria?.id ?? "");
  expect(bladAdmina).toBeNull();

  // W tej samej partii offline: nowe, niezależne zgłoszenie — MUSI przejść mimo odrzucenia powyższego.
  // Nawigacja kliencka (link "Zgłoś"): lista urządzeń jest już w pamięci zapytań z etapu logowania.
  await nawigacja.getByRole("link", { name: "Zgłoś" }).click();
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: /HVAC-01/ }).click();
  await page.getByLabel("Opis awarii").fill(opisNowe);
  await page.getByRole("button", { name: "Zgłoś awarię" }).click();
  await expect(page.getByText("Zapisano lokalnie, oczekuje na synchronizację")).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  // Nowe zgłoszenie się synchronizuje (znika znacznik "lokalnie"); teraz jesteśmy online, więc pełne
  // przeładowanie listy jest bezpieczne.
  await otworz(page, "/awarie");
  const kartaNowe = page.getByRole("link").filter({ hasText: opisNowe });
  await expect(kartaNowe.getByText("lokalnie")).toBeHidden({ timeout: 20_000 });

  // Odrzucona aktualizacja trafia do "Do sprawdzenia" (widoczne w nagłówku), reszta się nie blokuje.
  await expect(page.getByRole("button", { name: /do sprawdzenia/ })).toBeVisible({ timeout: 20_000 });

  // Baza pozostaje przy zmianie admina (odrzucona aktualizacja NIE nadpisała jej).
  await expect
    .poll(
      async () => {
        const { data } = await admin.from("awarie").select("status").eq("id", awaria?.id ?? "").single();
        return data?.status;
      },
      { timeout: 10_000 },
    )
    .toBe("zamknieta");
});
