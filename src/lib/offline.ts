import { supabase } from "@/integrations/supabase/client";
import { czyBladSieci, czyDuplikat } from "./kolejka-bledy";
import type { Awaria } from "./types";
import { wyslijZdjecie, type ZdjecieDoWyslania } from "./zdjecia-wysylka";
import { klasyfikujSesje, odczytajIdZCache, wybierzUserId } from "./uzytkownik-cache";

const DB_NAME = "awarie-offline";
const DB_VERSION = 2;
const STORE = "queue";

export type StatusOperacji = "oczekuje" | "do_sprawdzenia";

// Każda operacja należy do konta, które ją zapisało: na wspólnym telefonie zgłoszenie
// jednej osoby nie może zostać wysłane (ani wyświetlone) na koncie innej.
export type QueueOp =
  | {
      opId: string;
      type: "insert";
      payload: Awaria;
      createdAt: number;
      userId: string;
      status: StatusOperacji;
      powod?: string;
    }
  | {
      opId: string;
      type: "update";
      payload: { id: string } & Partial<Awaria>;
      createdAt: number;
      userId: string;
      status: StatusOperacji;
      powod?: string;
      oczekiwanaWersja?: number;
    }
  | {
      opId: string;
      type: "zdjecie";
      payload: ZdjecieDoWyslania;
      /** Zmniejszony JPEG; IndexedDB przechowuje Blob bez konwersji. */
      plik: Blob;
      createdAt: number;
      userId: string;
      status: StatusOperacji;
      powod?: string;
    };

/** Operacja bez opId, daty, statusu i właściciela: te pola dokłada `zakolejkuj`. */
export type NowaOperacja =
  | { type: "insert"; payload: Awaria }
  | { type: "update"; payload: { id: string } & Partial<Awaria>; oczekiwanaWersja?: number }
  | { type: "zdjecie"; payload: ZdjecieDoWyslania; plik: Blob };

export class KonfliktWersjiError extends Error {
  constructor() {
    super("Ktoś już zmienił tę awarię, odśwież.");
    this.name = "KonfliktWersjiError";
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "opId" });
      } else if (event.oldVersion < 2) {
        // Wersja 1 zapisywała operacje bez właściciela (userId): nie da się ich bezpiecznie
        // przypisać do konta, a danych produkcyjnych jeszcze nie ma, więc kolejkę czyścimy.
        req.transaction?.objectStore(STORE).clear();
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

// Offline z wygasłym tokenem getSession() zwraca null dopiero po wielu nieudanych próbach odświeżenia
// (kilkadziesiąt sekund), więc offline bierzemy id z zapisanego profilu od razu. Online sesję null
// z błędem (nieudane odświeżenie tokenu, tak jak offline) traktujemy jak nieokreśloną, nie jak
// wylogowanie: inaczej mutacje w tym oknie poszłyby anonimowo zamiast trafić do kolejki.
export async function biezacyUserId(): Promise<string | null> {
  const online = typeof navigator === "undefined" || navigator.onLine;
  const zCache = odczytajIdZCache();
  if (!online && zCache) return zCache;
  const { data, error } = await supabase.auth.getSession();
  const sesjaId = data.session?.user.id ?? null;
  if (klasyfikujSesje(sesjaId, error) === "nieokreslona" && zCache) return zCache;
  return wybierzUserId(sesjaId, online, zCache);
}

export async function enqueue(op: QueueOp) {
  await tx("readwrite", (s) => s.put(op));
  window.dispatchEvent(new Event("queue-changed"));
}

/** Dokłada do kolejki operację zalogowanego użytkownika; bez sesji nic nie zapisuje. */
export async function zakolejkuj(op: NowaOperacja) {
  const userId = await biezacyUserId();
  if (!userId) throw new Error("Zaloguj się, aby zapisać zgłoszenie.");
  await enqueue({
    ...op,
    opId: crypto.randomUUID(),
    createdAt: Date.now(),
    userId,
    status: "oczekuje",
  } as QueueOp);
}

/** Cała kolejka (wszystkie konta) albo, gdy podano `userId`, tylko operacje tego konta. Rekordy
 *  zapisane przed dodaniem pola `status` (etap 1) dostają domyślnie "oczekuje". */
export async function getQueue(userId?: string): Promise<QueueOp[]> {
  if (typeof indexedDB === "undefined") return [];
  const all = await tx<QueueOp[]>("readonly", (s) => s.getAll());
  return all
    .map((op) => (op.status ? op : { ...op, status: "oczekuje" as const }))
    .filter((op) => userId === undefined || op.userId === userId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Aktywne operacje zalogowanego użytkownika (bez "do_sprawdzenia"); bez sesji pusta lista. */
export async function getMojaKolejka(): Promise<QueueOp[]> {
  if (typeof indexedDB === "undefined") return [];
  const userId = await biezacyUserId();
  if (!userId) return [];
  return (await getQueue(userId)).filter((op) => op.status === "oczekuje");
}

/** Operacje zalogowanego użytkownika odrzucone z powodu konfliktu biznesowego, do ręcznego przejrzenia. */
export async function getDoSprawdzenia(): Promise<QueueOp[]> {
  if (typeof indexedDB === "undefined") return [];
  const userId = await biezacyUserId();
  if (!userId) return [];
  return (await getQueue(userId)).filter((op) => op.status === "do_sprawdzenia");
}

async function remove(opId: string) {
  await tx("readwrite", (s) => s.delete(opId));
}

/** Usuwa z kolejki wszystkie operacje danego konta (np. przy świadomym wylogowaniu). */
export async function usunOperacjeUzytkownika(userId: string): Promise<void> {
  const ops = await getQueue(userId);
  for (const op of ops) await remove(op.opId);
  if (ops.length > 0) window.dispatchEvent(new Event("queue-changed"));
}

/** Odrzuca (usuwa) wpis z listy „Do sprawdzenia" po ręcznym przejrzeniu przez użytkownika. */
export async function odrzucOperacjeDoSprawdzenia(opId: string): Promise<void> {
  await remove(opId);
  window.dispatchEvent(new Event("queue-changed"));
}

async function oznaczDoSprawdzenia(opId: string, powod: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    const req = store.get(opId);
    req.onsuccess = () => {
      const op = req.result as QueueOp | undefined;
      if (!op) return resolve();
      const zapis = store.put({ ...op, status: "do_sprawdzenia", powod });
      zapis.onsuccess = () => resolve();
      zapis.onerror = () => reject(zapis.error);
    };
    req.onerror = () => reject(req.error);
  });
  window.dispatchEvent(new Event("queue-changed"));
}

/**
 * Rozróżnia błąd sieci (operacja wraca do kolejki, spróbujemy ponownie) od odrzucenia biznesowego
 * (nieaktualna wersja — zero zmienionych wierszy, `blad` jest wtedy `null` — albo wyjątek z
 * triggera/RLS, np. niedozwolone przejście statusu): to drugie trafia do "Do sprawdzenia" i NIE
 * blokuje reszty kolejki.
 */
export function klasyfikujOdrzucenie(
  blad: { code?: string | undefined; message?: string | undefined } | null | undefined,
): "siec" | "biznesowy" {
  return blad && czyBladSieci(blad) ? "siec" : "biznesowy";
}

function opisOdrzucenia(
  blad: { message?: string | undefined } | null | undefined,
  brakWierszy: boolean,
): string {
  if (blad?.message) return blad.message;
  if (brakWierszy) return "Zgłoszenie zostało już zmienione albo nie istnieje.";
  return "Zapis został odrzucony.";
}

/**
 * Operacje zapisane w kolejce przed etapem 3b mogą zawierać usuniętą kolumnę `przypisany_technik_id`.
 * Zdejmujemy ją przed wysłaniem (inaczej baza odrzuci cały zapis). Stare „Przypisz do mnie” zamieniamy na
 * dołączenie do zespołu, a aktualizacja, której nic już nie zostało, tylko podbija wersję — żeby kolejne
 * operacje na tej awarii (liczone z podbitą wersją) nie trafiały do „Do sprawdzenia”.
 */
export function oczyscPrzestarzalePola(
  payload: Record<string, unknown>,
  oczekiwanaWersja: number | undefined,
): { pola: Record<string, unknown>; dawnePrzypisanie: string | null } {
  const { przypisany_technik_id: przypisanie, ...pola } = payload;
  const dawnePrzypisanie = typeof przypisanie === "string" ? przypisanie : null;
  if (Object.keys(pola).length === 0) {
    return { pola: { wersja: oczekiwanaWersja ?? 0 }, dawnePrzypisanie };
  }
  return { pola, dawnePrzypisanie };
}

let syncing = false;

/** Konflikt biznesowy nie przerywa pętli: trafia do "Do sprawdzenia", a reszta kolejki idzie dalej. */
export async function syncQueue(): Promise<number> {
  if (syncing || typeof navigator === "undefined" || !navigator.onLine) return 0;
  const userId = await biezacyUserId();
  if (!userId) return 0;
  syncing = true;
  let done = 0;
  try {
    const ops = (await getQueue(userId)).filter((op) => op.status === "oczekuje");
    for (const op of ops) {
      let blad: { code?: string; message?: string } | null = null;
      let brakWierszy = false;
      let dolaczDoZespolu: { awariaId: string; uzytkownikId: string } | null = null;
      if (op.type === "zdjecie") {
        blad = await wyslijZdjecie(op.payload, op.plik);
      } else if (op.type === "insert") {
        const { pola } = oczyscPrzestarzalePola(op.payload, undefined);
        const { error } = await supabase.from("awarie").insert(pola as typeof op.payload);
        if (error && !czyDuplikat(error)) blad = error;
      } else {
        const { id, ...reszta } = op.payload;
        const { pola, dawnePrzypisanie } = oczyscPrzestarzalePola(reszta, op.oczekiwanaWersja);
        if (dawnePrzypisanie) dolaczDoZespolu = { awariaId: id, uzytkownikId: dawnePrzypisanie };
        let zapytanie = supabase
          .from("awarie")
          .update(pola as typeof reszta)
          .eq("id", id);
        if (op.oczekiwanaWersja !== undefined) {
          zapytanie = zapytanie.eq("wersja", op.oczekiwanaWersja);
        }
        const { data, error } = await zapytanie.select("id");
        if (error) blad = error;
        else if (!data || data.length === 0) brakWierszy = true;
      }
      if (!blad && !brakWierszy) {
        if (dolaczDoZespolu) {
          // Najbliższy odpowiednik starego przypisania; błąd (np. osoba już w zespole) pomijamy.
          await supabase.from("awarie_zespol").insert({
            awaria_id: dolaczDoZespolu.awariaId,
            uzytkownik_id: dolaczDoZespolu.uzytkownikId,
          });
        }
        await remove(op.opId);
        done++;
        continue;
      }
      if (klasyfikujOdrzucenie(blad) === "siec") break;
      await oznaczDoSprawdzenia(op.opId, opisOdrzucenia(blad, brakWierszy));
    }
  } finally {
    syncing = false;
    window.dispatchEvent(new Event("queue-changed"));
  }
  return done;
}

function powodBledu(blad: { code?: string | undefined }): string {
  return blad.code === "42501"
    ? "brak uprawnień lub konto jest zablokowane."
    : "serwer odrzucił zapis. Spróbuj ponownie lub skontaktuj się z administratorem.";
}

/**
 * Zapisuje zgłoszenie: online -> prosto do bazy, offline lub przy błędzie sieci -> kolejka
 * lokalna. Odmowa serwera (RLS, ograniczenia) rzuca błąd zamiast trafiać do kolejki, bo
 * ponawianie takiej operacji nigdy by się nie udało.
 */
export async function zapiszAwarie(rekord: Awaria): Promise<"zsynchronizowano" | "lokalnie"> {
  if (navigator.onLine) {
    const { error } = await supabase.from("awarie").insert(rekord);
    if (!error || czyDuplikat(error)) return "zsynchronizowano";
    if (!czyBladSieci(error)) {
      throw new Error(`Nie udało się zapisać zgłoszenia: ${powodBledu(error)}`);
    }
  }
  await zakolejkuj({ type: "insert", payload: rekord });
  return "lokalnie";
}

/**
 * `oczekiwanaWersja`, gdy podana, chroni przed nadpisaniem cudzej zmiany: zero zmienionych wierszy
 * przy istniejącym rekordzie online rzuca `KonfliktWersjiError` zamiast ogólnego błędu.
 */
export async function aktualizujAwarie(
  id: string,
  zmiany: Partial<Awaria>,
  oczekiwanaWersja?: number,
): Promise<"zsynchronizowano" | "lokalnie"> {
  if (navigator.onLine) {
    let zapytanie = supabase.from("awarie").update(zmiany).eq("id", id);
    if (oczekiwanaWersja !== undefined) zapytanie = zapytanie.eq("wersja", oczekiwanaWersja);
    const { data, error } = await zapytanie.select("id");
    if (!error) {
      if (data && data.length > 0) return "zsynchronizowano";
      // Zero zmienionych wierszy: sprawdzamy, czy rekord istnieje, żeby odróżnić konflikt wersji od
      // braku uprawnień/rekordu. Błąd SIECI tego sprawdzenia nie może sam zostać odrzucony jako
      // "nie istnieje" — dołącza do tej samej ścieżki kolejkowania co błąd sieci głównego zapisu.
      let bladSieciPrzySprawdzeniu = false;
      if (oczekiwanaWersja !== undefined) {
        const { data: istnieje, error: bladSprawdzenia } = await supabase
          .from("awarie")
          .select("id")
          .eq("id", id)
          .maybeSingle();
        if (bladSprawdzenia && czyBladSieci(bladSprawdzenia)) {
          bladSieciPrzySprawdzeniu = true;
        } else if (istnieje) {
          throw new KonfliktWersjiError();
        }
      }
      if (!bladSieciPrzySprawdzeniu) {
        throw new Error(
          "Nie udało się zapisać zmiany: brak uprawnień lub zgłoszenie nie istnieje.",
        );
      }
    } else if (!czyBladSieci(error)) {
      throw new Error(`Nie udało się zapisać zmiany: ${powodBledu(error)}`);
    }
  }
  await zakolejkuj({
    type: "update",
    payload: { id, ...zmiany },
    ...(oczekiwanaWersja !== undefined ? { oczekiwanaWersja } : {}),
  });
  return "lokalnie";
}
