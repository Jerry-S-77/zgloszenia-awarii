import { supabase } from "@/integrations/supabase/client";
import { czyBladSieci, czyDuplikat } from "./kolejka-bledy";
import type { Awaria } from "./types";
import { odczytajIdZCache, wybierzUserId } from "./uzytkownik-cache";

const DB_NAME = "awarie-offline";
const DB_VERSION = 2;
const STORE = "queue";

// Każda operacja należy do konta, które ją zapisało: na wspólnym telefonie zgłoszenie
// jednej osoby nie może zostać wysłane (ani wyświetlone) na koncie innej.
export type QueueOp =
  | { opId: string; type: "insert"; payload: Awaria; createdAt: number; userId: string }
  | {
      opId: string;
      type: "update";
      payload: { id: string } & Partial<Awaria>;
      createdAt: number;
      userId: string;
    };

/** Operacja bez opId, daty i właściciela: te pola dokłada `zakolejkuj`. */
export type NowaOperacja =
  | { type: "insert"; payload: Awaria }
  | { type: "update"; payload: { id: string } & Partial<Awaria> };

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

// Offline z wygasłym tokenem getSession() zwraca null (odświeżenie się nie udaje), więc tylko wtedy
// bierzemy id z zapisanego profilu. Online brak sesji oznacza brak zalogowania.
export async function biezacyUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const online = typeof navigator === "undefined" || navigator.onLine;
  return wybierzUserId(data.session?.user.id ?? null, online, odczytajIdZCache());
}

export async function enqueue(op: QueueOp) {
  await tx("readwrite", (s) => s.put(op));
  window.dispatchEvent(new Event("queue-changed"));
}

/** Dokłada do kolejki operację zalogowanego użytkownika; bez sesji nic nie zapisuje. */
async function zakolejkuj(op: NowaOperacja) {
  const userId = await biezacyUserId();
  if (!userId) throw new Error("Zaloguj się, aby zapisać zgłoszenie.");
  await enqueue({ ...op, opId: crypto.randomUUID(), createdAt: Date.now(), userId } as QueueOp);
}

/** Cała kolejka (wszystkie konta) albo, gdy podano `userId`, tylko operacje tego konta. */
export async function getQueue(userId?: string): Promise<QueueOp[]> {
  if (typeof indexedDB === "undefined") return [];
  const all = await tx<QueueOp[]>("readonly", (s) => s.getAll());
  return all
    .filter((op) => userId === undefined || op.userId === userId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Operacje zalogowanego użytkownika; bez sesji pusta lista. */
export async function getMojaKolejka(): Promise<QueueOp[]> {
  if (typeof indexedDB === "undefined") return [];
  const userId = await biezacyUserId();
  return userId ? getQueue(userId) : [];
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

let syncing = false;

export async function syncQueue(): Promise<number> {
  if (syncing || typeof navigator === "undefined" || !navigator.onLine) return 0;
  const userId = await biezacyUserId();
  if (!userId) return 0; // bez zalogowania kolejka czeka, nic nie ginie
  syncing = true;
  let done = 0;
  try {
    // Tylko operacje bieżącego konta; cudze zostają na miejscu i nie blokują reszty.
    const ops = await getQueue(userId);
    for (const op of ops) {
      if (op.type === "insert") {
        // insert zamiast upsert: upsert wymaga też polityki UPDATE, której pracownik nie ma
        const { error } = await supabase.from("awarie").insert(op.payload);
        if (error && !czyDuplikat(error)) break;
      } else {
        const { id, ...rest } = op.payload;
        // Pod RLS update bez uprawnień zwraca sukces, ale zmienia 0 wierszy. Pusty wynik
        // traktujemy jak błąd: operacja zostaje w kolejce, zamiast po cichu zniknąć.
        const { data, error } = await supabase
          .from("awarie")
          .update(rest)
          .eq("id", id)
          .select("id");
        if (error || !data || data.length === 0) break;
      }
      await remove(op.opId);
      done++;
    }
  } finally {
    syncing = false;
    if (done > 0) window.dispatchEvent(new Event("queue-changed"));
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

export async function aktualizujAwarie(
  id: string,
  zmiany: Partial<Awaria>,
): Promise<"zsynchronizowano" | "lokalnie"> {
  if (navigator.onLine) {
    // Pod RLS update bez uprawnień kończy się bez błędu, ale zmienia 0 wierszy: bez .select
    // aplikacja pokazałaby sukces, choć nic się nie zapisało.
    const { data, error } = await supabase.from("awarie").update(zmiany).eq("id", id).select("id");
    if (!error) {
      if (data && data.length > 0) return "zsynchronizowano";
      throw new Error("Nie udało się zapisać zmiany: brak uprawnień lub zgłoszenie nie istnieje.");
    }
    if (!czyBladSieci(error)) {
      throw new Error(`Nie udało się zapisać zmiany: ${powodBledu(error)}`);
    }
  }
  await zakolejkuj({ type: "update", payload: { id, ...zmiany } });
  return "lokalnie";
}
