import { describe, expect, it } from "vitest";
import { klasyfikujProbeHasla } from "@/lib/uzytkownicy.server";

describe("klasyfikujProbeHasla", () => {
  it("brak błędu oznacza, że hasło pasuje", () => {
    expect(klasyfikujProbeHasla(null)).toBe("pasuje");
  });
  it("odrzucenie danych logowania oznacza brak dopasowania", () => {
    expect(klasyfikujProbeHasla({ code: "invalid_credentials" })).toBe("nie_pasuje");
    expect(klasyfikujProbeHasla({ code: "invalid_credentials", status: 400 })).toBe("nie_pasuje");
    expect(klasyfikujProbeHasla({ code: "user_banned" })).toBe("nie_pasuje");
  });
  it("limit zapytań, błąd sieci i nieznany błąd to błąd sprawdzenia, nie brak dopasowania", () => {
    expect(klasyfikujProbeHasla({ status: 429 })).toBe("blad");
    expect(klasyfikujProbeHasla({ code: "over_request_rate_limit" })).toBe("blad");
    expect(klasyfikujProbeHasla({ status: 500 })).toBe("blad");
    expect(klasyfikujProbeHasla({})).toBe("blad");
  });
});
