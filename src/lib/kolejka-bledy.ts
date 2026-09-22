/** Powtórzone wstawienie tego samego zgłoszenia (np. po zgubionej odpowiedzi) traktujemy jak sukces. */
export function czyDuplikat(blad: { code?: string | undefined } | null | undefined): boolean {
  return blad?.code === "23505";
}

/**
 * Błąd sieci (brak połączenia, przerwane żądanie) to jedyny powód, dla którego wolno odłożyć
 * operację do kolejki. Błąd z kodem Postgresa/PostgREST (np. 42501, 23514, PGRST...) oznacza,
 * że serwer odpowiedział odmownie: ponawianie z kolejki nic by nie zmieniło. Błędy fetch
 * ("Failed to fetch", "Load failed", "NetworkError...") kodu nie mają.
 */
export function czyBladSieci(
  blad: { code?: string | undefined; message?: string | undefined } | null | undefined,
): boolean {
  if (!blad) return false;
  return !blad.code;
}
