import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types.ts";
import { generujHasloTymczasowe } from "../src/lib/haslo.ts";

const [emailWejscie, imieNazwisko] = process.argv.slice(2);
if (!emailWejscie || !imieNazwisko) {
  console.error('Użycie: node scripts/utworz-admina.ts <email> "<Imię Nazwisko>"');
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

const email = emailWejscie.trim().toLowerCase();
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
  imie_nazwisko: imieNazwisko.trim(),
  rola: "admin",
  status: "aktywny",
  must_change_password: true,
});
if (bladProfilu) {
  await admin.auth.admin.deleteUser(data.user.id);
  throw bladProfilu;
}

console.log(`Utworzono administratora ${email}.`);
console.log(`Hasło tymczasowe (pokazane raz, zmiana wymuszona przy logowaniu): ${haslo}`);
