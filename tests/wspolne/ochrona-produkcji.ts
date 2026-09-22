import { readFileSync } from "node:fs";

export function odczytajRefProdukcyjny(configToml: string): string | null {
  const dopasowanie = /^\s*project_id\s*=\s*"([^"]+)"/m.exec(configToml);
  return dopasowanie?.[1] ?? null;
}

export function czyAdresProdukcyjny(url: string, refProdukcyjny: string | null): boolean {
  return refProdukcyjny !== null && new URL(url).hostname.startsWith(`${refProdukcyjny}.`);
}

/** Rzuca błąd, jeśli adres to projekt produkcyjny (project_id z supabase/config.toml) lub gdy nie da się tego sprawdzić. */
export function wymagajNieprodukcyjnego(url: string): void {
  let ref: string | null = null;
  try {
    ref = odczytajRefProdukcyjny(readFileSync("supabase/config.toml", "utf8"));
  } catch {
    /* obsłużone niżej */
  }
  if (ref === null) {
    throw new Error(
      "Nie można odczytać project_id z supabase/config.toml, więc nie da się sprawdzić, czy to projekt produkcyjny.",
    );
  }
  if (czyAdresProdukcyjny(url, ref)) {
    throw new Error(
      "Testy i skrypty deweloperskie nie mogą działać na projekcie produkcyjnym (project_id z supabase/config.toml).",
    );
  }
}
