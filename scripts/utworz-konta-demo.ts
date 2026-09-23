import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types.ts";
import { generujHasloTymczasowe } from "../src/lib/haslo.ts";

// Konta do pokazania aplikacji (po jednym na rolę). Hasła generowane losowo, pokazywane raz,
// bez wymuszonej zmiany hasła, żeby kilka osób mogło korzystać z tego samego konta demo.
const KONTA_DEMO = [
  { email: "demo.pracownik@zgloszenia-awarii.test", imie: "Demo Pracownik", rola: "pracownik" },
  { email: "demo.technik@zgloszenia-awarii.test", imie: "Demo Technik", rola: "technik" },
  { email: "demo.kierownik@zgloszenia-awarii.test", imie: "Demo Kierownik", rola: "kierownik" },
  { email: "demo.admin@zgloszenia-awarii.test", imie: "Demo Administrator", rola: "admin" },
] as const;

const potwierdzone = process.argv.includes("--tak");

try {
  process.loadEnvFile(".env");
} catch {
  console.error("Brak pliku .env z SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const url = process.env["SUPABASE_URL"];
const klucz = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !klucz) {
  console.error("W .env brakuje SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

console.log(`Docelowa baza: ${new URL(url).host}`);
if (!potwierdzone) {
  console.error("Dodaj --tak, aby utworzyć konta demo na tej bazie.");
  process.exit(1);
}

const admin = createClient<Database>(url, klucz, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: lista, error: bladListy } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 200,
});
if (bladListy) throw bladListy;

for (const konto of KONTA_DEMO) {
  if (lista.users.some((u) => u.email === konto.email)) {
    console.log(`${konto.email}: już istnieje, pomijam (hasło zresetujesz w panelu Admin).`);
    continue;
  }
  const haslo = generujHasloTymczasowe();
  const { data, error } = await admin.auth.admin.createUser({
    email: konto.email,
    password: haslo,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`Nie udało się utworzyć ${konto.email}.`);

  const { error: bladProfilu } = await admin.from("profiles").insert({
    id: data.user.id,
    email: konto.email,
    imie_nazwisko: konto.imie,
    rola: konto.rola,
    status: "aktywny",
    must_change_password: false,
  });
  if (bladProfilu) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw bladProfilu;
  }
  console.log(`${konto.rola.padEnd(10)} ${konto.email}  hasło: ${haslo}`);
}

console.log("Hasła są pokazane tylko raz. Zapisz je poza repozytorium.");
