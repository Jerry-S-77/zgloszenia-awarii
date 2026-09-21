import { supabase } from "@/integrations/supabase/client";
import { czyDuplikat } from "./kolejka-bledy";
import type { Awaria } from "./types";

const DB_NAME = "awarie-offline";
const STORE = "queue";

export type QueueOp =
  | { opId: string; type: "insert"; payload: Awaria; createdAt: number }
  | {
      opId: string;
      type: "update";
      payload: { id: string } & Partial<Awaria>;
      createdAt: number;
    };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "opId" });
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

export async function enqueue(op: QueueOp) {
  await tx("readwrite", (s) => s.put(op));
  window.dispatchEvent(new Event("queue-changed"));
}

export async function getQueue(): Promise<QueueOp[]> {
  if (typeof indexedDB === "undefined") return [];
  const all = await tx<QueueOp[]>("readonly", (s) => s.getAll());
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

async function remove(opId: string) {
  await tx("readwrite", (s) => s.delete(opId));
}

let syncing = false;

export async function syncQueue(): Promise<number> {
  if (syncing || typeof navigator === "undefined" || !navigator.onLine) return 0;
  const { data: sesja } = await supabase.auth.getSession();
  if (!sesja.session) return 0; // bez zalogowania kolejka czeka, nic nie ginie
  syncing = true;
  let done = 0;
  try {
    const ops = await getQueue();
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

/** Zapisuje zgłoszenie: online -> prosto do bazy, offline -> kolejka lokalna. */
export async function zapiszAwarie(rekord: Awaria): Promise<"zsynchronizowano" | "lokalnie"> {
  if (navigator.onLine) {
    const { error } = await supabase.from("awarie").insert(rekord);
    if (!error) return "zsynchronizowano";
  }
  await enqueue({
    opId: crypto.randomUUID(),
    type: "insert",
    payload: rekord,
    createdAt: Date.now(),
  });
  return "lokalnie";
}

export async function aktualizujAwarie(
  id: string,
  zmiany: Partial<Awaria>,
): Promise<"zsynchronizowano" | "lokalnie"> {
  if (navigator.onLine) {
    const { error } = await supabase.from("awarie").update(zmiany).eq("id", id);
    if (!error) return "zsynchronizowano";
  }
  await enqueue({
    opId: crypto.randomUUID(),
    type: "update",
    payload: { id, ...zmiany },
    createdAt: Date.now(),
  });
  return "lokalnie";
}
