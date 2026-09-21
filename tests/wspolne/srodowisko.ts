import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { wymagajNieprodukcyjnego } from "./ochrona-produkcji";

try {
  process.loadEnvFile(".env.test");
} catch {
  throw new Error(
    "Brak pliku .env.test. Skopiuj .env.test.example i uzupełnij dane projektu testowego.",
  );
}

export const HASLO_TESTOWE = "Test-Haslo-12345!";

function env(nazwa: string): string {
  const wartosc = process.env[nazwa];
  if (!wartosc) throw new Error(`Brak ${nazwa} w .env.test`);
  return wartosc;
}

export function url(): string {
  const u = env("SUPABASE_URL");
  wymagajNieprodukcyjnego(u);
  return u;
}

const OPCJE = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export function klientAdmin(): SupabaseClient<Database> {
  return createClient<Database>(url(), env("SUPABASE_SERVICE_ROLE_KEY"), OPCJE);
}

export function klientAnon(): SupabaseClient<Database> {
  return createClient<Database>(url(), env("SUPABASE_PUBLISHABLE_KEY"), OPCJE);
}

export async function zaloguj(
  email: string,
  haslo = HASLO_TESTOWE,
): Promise<SupabaseClient<Database>> {
  const klient = klientAnon();
  const { error } = await klient.auth.signInWithPassword({ email, password: haslo });
  if (error) throw new Error(`Logowanie ${email} nie powiodło się: ${error.message}`);
  return klient;
}

export const KONTA = {
  pracownik: {
    email: "test-pracownik@example.test",
    rola: "pracownik",
    status: "aktywny",
    zmiana: false,
  },
  pracownik2: {
    email: "test-pracownik2@example.test",
    rola: "pracownik",
    status: "aktywny",
    zmiana: false,
  },
  technik: {
    email: "test-technik@example.test",
    rola: "technik",
    status: "aktywny",
    zmiana: false,
  },
  kierownik: {
    email: "test-kierownik@example.test",
    rola: "kierownik",
    status: "aktywny",
    zmiana: false,
  },
  admin: { email: "test-admin@example.test", rola: "admin", status: "aktywny", zmiana: false },
  zablokowany: {
    email: "test-zablokowany@example.test",
    rola: "pracownik",
    status: "zablokowany",
    zmiana: false,
  },
  zmianaHasla: {
    email: "test-zmiana-hasla@example.test",
    rola: "pracownik",
    status: "aktywny",
    zmiana: true,
  },
} as const;

export type KluczKonta = keyof typeof KONTA;

/** Tworzy (lub przywraca do stanu wyjściowego) konta testowe. Zwraca ich identyfikatory. */
export async function przygotujKonta(): Promise<Record<KluczKonta, string>> {
  const admin = klientAdmin();
  const { data: lista, error: blad } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (blad) throw blad;
  const wynik = {} as Record<KluczKonta, string>;

  for (const [klucz, konto] of Object.entries(KONTA) as [
    KluczKonta,
    (typeof KONTA)[KluczKonta],
  ][]) {
    const istniejacy = lista.users.find((u) => u.email === konto.email);
    let id = istniejacy?.id;
    if (id) {
      const { error } = await admin.auth.admin.updateUserById(id, {
        password: HASLO_TESTOWE,
        ban_duration: "none",
      });
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: konto.email,
        password: HASLO_TESTOWE,
        email_confirm: true,
      });
      if (error || !data.user) throw error ?? new Error("createUser bez użytkownika");
      id = data.user.id;
    }
    const { error } = await admin.from("profiles").upsert(
      {
        id,
        email: konto.email,
        imie_nazwisko: `Test ${klucz}`,
        rola: konto.rola,
        status: konto.status,
        must_change_password: konto.zmiana,
      },
      { onConflict: "id" },
    );
    if (error) throw error;
    wynik[klucz] = id;
  }
  return wynik;
}
