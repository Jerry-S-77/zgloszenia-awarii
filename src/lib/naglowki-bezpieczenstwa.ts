/**
 * Nagłówki bezpieczeństwa dodawane do każdej odpowiedzi serwera (`src/server.ts`). CSP pozwala tylko na
 * własną domenę, czcionki Google i połączenia z Supabase (REST, Auth, Realtime). Skrypty inline są dozwolone,
 * bo SSR TanStack Start wstrzykuje w HTML stan do hydratacji; `frame-ancestors 'none'` blokuje osadzanie
 * aplikacji w cudzej ramce (clickjacking).
 */
export function politykaCsp(deweloperski: boolean): string {
  const skrypty = ["'self'", "'unsafe-inline'", ...(deweloperski ? ["'unsafe-eval'"] : [])];
  const polaczenia = [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    ...(deweloperski ? ["ws:", "http://localhost:*"] : []),
  ];
  return [
    "default-src 'self'",
    `script-src ${skrypty.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // Podpisane linki do zdjęć awarii w Supabase Storage.
    "img-src 'self' data: blob: https://*.supabase.co",
    `connect-src ${polaczenia.join(" ")}`,
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function naglowkiBezpieczenstwa(deweloperski: boolean): Record<string, string> {
  return {
    "Content-Security-Policy": politykaCsp(deweloperski),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}

/** Zwraca odpowiedź z dopisanymi nagłówkami (treść i status bez zmian; nagłówki już ustawione zostają). */
export function zNaglowkamiBezpieczenstwa(odpowiedz: Response, deweloperski: boolean): Response {
  const naglowki = new Headers(odpowiedz.headers);
  for (const [nazwa, wartosc] of Object.entries(naglowkiBezpieczenstwa(deweloperski))) {
    if (!naglowki.has(nazwa)) naglowki.set(nazwa, wartosc);
  }
  return new Response(odpowiedz.body, {
    status: odpowiedz.status,
    statusText: odpowiedz.statusText,
    headers: naglowki,
  });
}
