import { czyRola, type Rola } from "./uprawnienia";

export type MozliwosciOffline = { mozna: string[]; niemozna: string[] };

/**
 * Co da się zrobić bez internetu, a co nie — dla baneru „Brak połączenia”. Zgodne z architekturą: przez kolejkę
 * offline idą tylko zgłoszenia, zdjęcia do awarii i zmiany statusu awarii; reszta (komentarze, zespół, przeglądy, urządzenia,
 * konta, analizy) działa wyłącznie online.
 */
export function mozliwosciOffline(rola: Rola): MozliwosciOffline {
  const obsluga = czyRola(rola, ["technik", "kierownik", "admin"]);
  const decyzje = czyRola(rola, ["kierownik", "admin"]);

  const mozna = [
    "Zgłosić awarię — wyśle się sama po powrocie sieci",
    "Dodać zdjęcia do awarii (do 3) — wyślą się po powrocie sieci",
  ];
  if (obsluga) {
    mozna.push("Zmienić status awarii (przyjęcie, naprawa, zamknięcie) — zapisze się w kolejce");
  }
  mozna.push("Przeglądać awarie pobrane przy ostatniej synchronizacji");

  const niemozna = ["Dodawać komentarzy"];
  if (obsluga) {
    niemozna.push("Dołączać do zespołu przy awarii ani go zmieniać");
    niemozna.push("Oglądać przeglądów i odnotowywać ich wykonania");
  }
  if (decyzje) {
    niemozna.push("Decydować o przyspieszeniu przeglądów i zmieniać harmonogramu");
    niemozna.push("Oglądać aktualnych progów alarmowych w Analizach");
  }
  if (rola === "admin") niemozna.push("Zarządzać kontami i urządzeniami");
  return { mozna, niemozna };
}
