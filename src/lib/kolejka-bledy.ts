/** Powtórzone wstawienie tego samego zgłoszenia (np. po zgubionej odpowiedzi) traktujemy jak sukces. */
export function czyDuplikat(blad: { code?: string | undefined } | null | undefined): boolean {
  return blad?.code === "23505";
}
