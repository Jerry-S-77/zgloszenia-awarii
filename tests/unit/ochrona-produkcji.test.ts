import { describe, expect, it } from "vitest";
import { czyAdresProdukcyjny, odczytajRefProdukcyjny } from "../wspolne/ochrona-produkcji";

describe("odczytajRefProdukcyjny", () => {
  it("czyta project_id z config.toml", () => {
    expect(odczytajRefProdukcyjny('project_id = "abcdefghijklmnopqrst"\n')).toBe(
      "abcdefghijklmnopqrst",
    );
  });
  it("zwraca null, gdy nie ma project_id", () => {
    expect(odczytajRefProdukcyjny("[api]\nport = 1")).toBeNull();
  });
});

describe("czyAdresProdukcyjny", () => {
  it("rozpoznaje adres projektu produkcyjnego", () => {
    expect(czyAdresProdukcyjny("https://abc123.supabase.co", "abc123")).toBe(true);
  });
  it("nie myli innego projektu", () => {
    expect(czyAdresProdukcyjny("https://xyz789.supabase.co", "abc123")).toBe(false);
  });
  it("nie dopasowuje refa będącego tylko prefiksem innego hosta", () => {
    expect(czyAdresProdukcyjny("https://abc123.supabase.co", "abc")).toBe(false);
  });
  it("brak refa produkcyjnego oznacza brak dopasowania", () => {
    expect(czyAdresProdukcyjny("https://xyz789.supabase.co", null)).toBe(false);
  });
});
