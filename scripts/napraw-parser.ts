// Uruchamiany automatycznie po `npm install` / `npm ci` (skrypt „postinstall”) oraz ręcznie: `npm run napraw-parser`.
//
// TanStack Start używa biblioteki oxc-parser z natywnym plikiem .node. Na Windows zasady kontroli aplikacji
// (Smart App Control / WDAC) potrafią zablokować świeżo pobrany plik; wtedy `npm run dev` i `npm run build`
// kończą się błędem „Cannot find native binding … An Application Control policy has blocked this file”.
// Biblioteka ma zapasowy wariant WebAssembly, którego Windows nie blokuje — ten skrypt doinstalowuje go
// lokalnie (bez zapisu w package.json i package-lock.json), w wersji zgodnej z zainstalowanym oxc-parser.
//
// Skrypt nigdy nie przerywa instalacji: gdy parser działa (Linux, Vercel, Windows bez blokady) albo nie
// jest zainstalowany, nie robi nic.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const katalog = process.cwd();
const wymagaj = createRequire(join(katalog, "package.json"));

function parserDziala(): boolean {
  try {
    // Osobny proces: nieudane ładowanie natywnego pliku zostaje w pamięci podręcznej modułów.
    execFileSync(process.execPath, ["-e", "require('oxc-parser')"], {
      cwd: katalog,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function wersjaParsera(): string | null {
  try {
    const plik = wymagaj.resolve("oxc-parser/package.json");
    return (JSON.parse(readFileSync(plik, "utf8")) as { version: string }).version;
  } catch {
    return null;
  }
}

const wersja = wersjaParsera();
if (wersja === null || process.platform !== "win32" || parserDziala()) process.exit(0);

// Zagnieżdżone `npm install` uruchamia ten skrypt ponownie — wtedy parser już działa i skrypt kończy wyżej;
// zmienna jest dodatkowym zabezpieczeniem przed pętlą, gdyby instalacja zapasowa nie pomogła.
if (process.env["NAPRAW_PARSER_W_TOKU"] === "1") process.exit(0);

console.log(
  `[napraw-parser] Windows zablokował natywny plik oxc-parser — instaluję wariant WebAssembly (${wersja})...`,
);
try {
  execFileSync(
    "npm",
    [
      "install",
      "--no-save",
      "--force",
      "--no-audit",
      "--no-fund",
      `@oxc-parser/binding-wasm32-wasi@${wersja}`,
    ],
    {
      cwd: katalog,
      stdio: "ignore",
      shell: true,
      env: { ...process.env, NAPRAW_PARSER_W_TOKU: "1" },
    },
  );
} catch {
  // Wynik sprawdzamy niżej.
}

if (parserDziala()) {
  console.log("[napraw-parser] Gotowe: parser działa w wariancie WebAssembly.");
} else {
  console.warn(
    "[napraw-parser] Nie udało się naprawić automatycznie. Uruchom ręcznie:\n" +
      `  npm install --no-save --force @oxc-parser/binding-wasm32-wasi@${wersja}`,
  );
}
