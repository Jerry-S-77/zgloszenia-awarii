import { spawn } from "node:child_process";

try {
  process.loadEnvFile(".env.test");
} catch {
  throw new Error("Brak pliku .env.test. Skopiuj .env.test.example i uzupełnij dane projektu testowego.");
}

const url = process.env["SUPABASE_URL"];
const klucz = process.env["SUPABASE_PUBLISHABLE_KEY"];
if (!url || !klucz) throw new Error("W .env.test brakuje SUPABASE_URL lub SUPABASE_PUBLISHABLE_KEY.");
if (url.includes("fujutpwdtnnooeusivdr")) {
  throw new Error("Ten skrypt nie może działać na projekcie produkcyjnym.");
}

const dziecko = spawn("npx", ["vite", "dev", "--port", "8081"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: klucz },
});
dziecko.on("exit", (kod) => process.exit(kod ?? 0));
