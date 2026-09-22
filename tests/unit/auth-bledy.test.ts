import { describe, expect, it } from "vitest";
import { komunikatBleduLogowania } from "@/lib/auth-bledy";

describe("komunikatBleduLogowania", () => {
  it("błędne dane", () => {
    expect(komunikatBleduLogowania({ code: "invalid_credentials", status: 400 })).toBe(
      "Nieprawidłowy e-mail lub hasło.",
    );
  });
  it("limit prób", () => {
    expect(komunikatBleduLogowania({ code: "over_request_rate_limit" })).toBe(
      "Zbyt wiele prób. Spróbuj ponownie za chwilę.",
    );
    expect(komunikatBleduLogowania({ status: 429 })).toBe(
      "Zbyt wiele prób. Spróbuj ponownie za chwilę.",
    );
  });
  it("brak sieci", () => {
    expect(
      komunikatBleduLogowania({
        name: "AuthRetryableFetchError",
        status: 0,
      }),
    ).toBe("Brak połączenia z internetem.");
  });
  it("nieznany błąd", () => {
    expect(komunikatBleduLogowania({})).toBe("Nie udało się zalogować. Spróbuj ponownie.");
  });
});
