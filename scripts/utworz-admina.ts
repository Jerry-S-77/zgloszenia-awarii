import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types.ts";
import { generujHasloTymczasowe } from "../src/lib/haslo.ts";

const argumenty = process.argv.slice(2);
const potwierdzone = argumenty.includes("--tak");
const pozycyjne = argumenty.filter((a) => a !== "--tak");
const [emailWejscie, imieWejscie] = pozycyjne;
// Dokładnie dwa argumenty: niecytowane "Jan Kowalski" to trzy i nie może założyć konta "Jan".
if (pozycyjne.length !== 2 || !emailWejscie || !imieWejscie) {
  console.error('Użycie: node scripts/utworz-admina.ts <email> "<Imię Nazwisko>" [--tak]');
  process.exit(1);
}

// Walidacja przed jakimkolwiek połączeniem z bazą.
const email = emailWejscie.trim().toLowerCase();
const imieNazwisko = imieWejscie.trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Nieprawidłowy adres e-mail.");
  process.exit(1);
}
if (imieNazwisko.length < 2 || imieNazwisko.length > 120) {
  console.error("Imię i nazwisko muszą mieć od 2 do 120 znaków.");
  process.exit(1);
}

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

// Zmienne już wyeksportowane w powłoce mają pierwszeństwo przed .env, więc pokazujemy realny cel.
const host = new URL(url).host;
console.log(`Docelowa baza: ${host}`);
if (!potwierdzone) {
  console.error("Dodaj --tak, aby utworzyć konto na tej bazie.");
  process.exit(1);
}

const admin = createClient<Database>(url, klucz, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { count, error: bladLiczenia } = await admin
  .from("profiles")
  .select("id", { count: "exact", head: true })
  .eq("rola", "admin")
  .eq("status", "aktywny");
if (bladLiczenia) throw bladLiczenia;
if ((count ?? 0) > 0) {
  console.error("Aktywny administrator już istnieje. Kolejne konta zakładaj w panelu Admin.");
  process.exit(1);
}

const haslo = generujHasloTymczasowe();
const { data, error } = await admin.auth.admin.createUser({
  email,
  password: haslo,
  email_confirm: true,
});
if (error || !data.user) throw error ?? new Error("Nie udało się utworzyć konta.");

const { error: bladProfilu } = await admin.from("profiles").insert({
  id: data.user.id,
  email,
  imie_nazwisko: imieNazwisko,
  rola: "admin",
  status: "aktywny",
  must_change_password: true,
});
if (bladProfilu) {
  const { error: bladUsuniecia } = await admin.auth.admin.deleteUser(data.user.id);
  if (bladUsuniecia) {
    console.error(
      `Nie udało się wycofać konta auth (osierocone). id: ${data.user.id}, e-mail: ${email}. ` +
        `Usuń je ręcznie w panelu Supabase (Authentication > Users). Błąd: ${bladUsuniecia.message}`,
    );
  }
  throw bladProfilu;
}

console.log(`Utworzono administratora ${email}.`);
console.log(`Hasło tymczasowe (pokazane raz, zmiana wymuszona przy logowaniu): ${haslo}`);
