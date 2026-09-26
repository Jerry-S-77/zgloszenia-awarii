import { describe, expect, it } from "vitest";
import {
  naglowkiBezpieczenstwa,
  politykaCsp,
  zNaglowkamiBezpieczenstwa,
} from "@/lib/naglowki-bezpieczenstwa";

describe("politykaCsp", () => {
  it("produkcja: bez eval, połączenia tylko z własną domeną i Supabase, bez osadzania w ramce", () => {
    const csp = politykaCsp(false);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co;");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("https://fonts.googleapis.com");
    expect(csp).not.toContain("localhost");
  });
  it("tryb deweloperski dopuszcza eval i HMR Vite", () => {
    const csp = politykaCsp(true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
  });
});

describe("zNaglowkamiBezpieczenstwa", () => {
  it("dopisuje nagłówki, zachowuje status, treść i istniejące nagłówki", async () => {
    const wejscie = new Response("tresc", {
      status: 201,
      headers: { "content-type": "text/html", "X-Frame-Options": "SAMEORIGIN" },
    });
    const wynik = zNaglowkamiBezpieczenstwa(wejscie, false);
    expect(wynik.status).toBe(201);
    expect(await wynik.text()).toBe("tresc");
    expect(wynik.headers.get("content-type")).toBe("text/html");
    expect(wynik.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(wynik.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(wynik.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  });
  it("zawiera komplet nagłówków", () => {
    expect(Object.keys(naglowkiBezpieczenstwa(false)).sort()).toEqual([
      "Content-Security-Policy",
      "Permissions-Policy",
      "Referrer-Policy",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ]);
  });
});
