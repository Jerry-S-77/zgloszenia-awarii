export type BladAuth = {
  code?: string | undefined;
  status?: number | undefined;
  name?: string | undefined;
};

export function komunikatBleduLogowania(blad: BladAuth): string {
  if (blad.code === "invalid_credentials") return "Nieprawidłowy e-mail lub hasło.";
  if (blad.code === "over_request_rate_limit" || blad.status === 429) {
    return "Zbyt wiele prób. Spróbuj ponownie za chwilę.";
  }
  if (blad.name === "AuthRetryableFetchError" || blad.status === 0)
    return "Brak połączenia z internetem.";
  return "Nie udało się zalogować. Spróbuj ponownie.";
}
