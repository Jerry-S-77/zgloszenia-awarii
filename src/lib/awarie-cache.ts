import type { AwariaLokalna } from "./types";

/**
 * Zdalne wiersze do listy awarii: udane pobranie, a przy porażce (offline, błąd API) wiersze z
 * poprzedniego pobrania tego samego zapytania, żeby lista nie zawężała się do samej kolejki lokalnej.
 * Znacznik `_pending` zdejmujemy: wiersze oczekujące są ponownie wyprowadzane z kolejki lokalnej
 * (wstawienia i zmiany), a wiersz zdalny ze zmianą w kolejce nie może przy tym zniknąć.
 */
export function zdalneLubZCache(
  pobrane: AwariaLokalna[] | null,
  cache: AwariaLokalna[] | undefined,
): AwariaLokalna[] {
  if (pobrane) return pobrane;
  return (cache ?? []).map(({ _pending: _pominiety, ...reszta }) => reszta);
}
