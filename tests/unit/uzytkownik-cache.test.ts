import { describe, expect, it } from "vitest";
import { wybierzUserId } from "@/lib/uzytkownik-cache";

describe("wybierzUserId", () => {
  it("id z sesji ma pierwszeństwo, także offline", () => {
    expect(wybierzUserId("sesja", true, "cache")).toBe("sesja");
    expect(wybierzUserId("sesja", false, "cache")).toBe("sesja");
  });
  it("brak sesji i offline: id z pamięci lokalnej", () => {
    expect(wybierzUserId(null, false, "cache")).toBe("cache");
  });
  it("brak sesji i online: null, bez zgadywania z pamięci lokalnej", () => {
    expect(wybierzUserId(null, true, "cache")).toBeNull();
  });
  it("brak sesji, offline i brak pamięci lokalnej: null", () => {
    expect(wybierzUserId(null, false, null)).toBeNull();
  });
});
