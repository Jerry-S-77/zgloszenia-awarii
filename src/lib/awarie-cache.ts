import type { QueueOp } from "./offline";
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

/**
 * Łączy wiersze zdalne z kolejką lokalną: wstawienia jeszcze niezsynchronizowane dokładają się do
 * listy (bez duplikatu, gdy to samo id trafiło już zdalnie), a aktualizacje z kolejki nakładają się
 * na odpowiadający wiersz. Wywołujący (queries.ts) musi wcześniej odfiltrować operacje `do_sprawdzenia`
 * (przez `getMojaKolejka`) — ta funkcja ufa, że dostała tylko aktywne operacje.
 */
export function scalAwarie(zdalne: AwariaLokalna[], kolejka: QueueOp[]): AwariaLokalna[] {
  const lokalne = kolejka
    .filter((op) => op.type === "insert")
    .map((op) => ({ ...(op.payload as AwariaLokalna), _pending: true }));
  const zmiany = kolejka.filter((op) => op.type === "update");
  const lokalneId = new Set(lokalne.map((a) => a.id));
  const wszystkie = [...lokalne, ...zdalne.filter((a) => !lokalneId.has(a.id))].map((a) => {
    const zm = zmiany.filter((z) => z.payload.id === a.id);
    return zm.length
      ? { ...a, ...Object.assign({}, ...zm.map((z) => z.payload)), _pending: true }
      : a;
  });
  return wszystkie.sort((a, b) => b.data_awarii.localeCompare(a.data_awarii));
}
