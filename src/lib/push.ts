import { supabase } from "@/integrations/supabase/client";

/**
 * Powiadomienia push na tym urządzeniu (przeglądarce). Subskrypcja trafia do bazy przez RPC
 * `push_zapisz_subskrypcje`; wysyła serwer (`/api/push`). Na iPhonie push działa tylko w aplikacji dodanej do
 * ekranu początkowego (iOS 16.4+).
 */

export type StanPush =
  | { stan: "nieobslugiwane" }
  | { stan: "brak-klucza" }
  | { stan: "ios-zainstaluj" }
  | { stan: "zablokowane" }
  | { stan: "wylaczone" }
  | { stan: "wlaczone"; tylkoKrytyczne: boolean };

const KLUCZ = import.meta.env["VITE_VAPID_PUBLIC_KEY"] as string | undefined;

function czyIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function czyZainstalowana(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function obslugiwane(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Klucz VAPID (base64url) → bajty dla `applicationServerKey`. */
export function kluczNaBajty(klucz: string): Uint8Array<ArrayBuffer> {
  const dopelnienie = "=".repeat((4 - (klucz.length % 4)) % 4);
  const base64 = (klucz + dopelnienie).replace(/-/g, "+").replace(/_/g, "/");
  const surowe = atob(base64);
  const bajty = new Uint8Array(new ArrayBuffer(surowe.length));
  for (let i = 0; i < surowe.length; i++) bajty[i] = surowe.charCodeAt(i);
  return bajty;
}

async function biezacaSubskrypcja(): Promise<PushSubscription | null> {
  const rejestracja = await navigator.serviceWorker.getRegistration("/");
  return (await rejestracja?.pushManager.getSubscription()) ?? null;
}

export async function stanPush(): Promise<StanPush> {
  if (typeof window === "undefined") return { stan: "nieobslugiwane" };
  if (czyIos() && !czyZainstalowana()) return { stan: "ios-zainstaluj" };
  if (!obslugiwane()) return { stan: "nieobslugiwane" };
  if (!KLUCZ) return { stan: "brak-klucza" };
  if (Notification.permission === "denied") return { stan: "zablokowane" };
  const subskrypcja = await biezacaSubskrypcja();
  if (!subskrypcja) return { stan: "wylaczone" };
  const { data } = await supabase
    .from("push_subskrypcje")
    .select("tylko_krytyczne")
    .eq("endpoint", subskrypcja.endpoint)
    .maybeSingle();
  // Subskrypcja w przeglądarce bez wpisu w bazie (np. zapisana dla innego konta) = wyłączone dla tego konta.
  return data ? { stan: "wlaczone", tylkoKrytyczne: data.tylko_krytyczne } : { stan: "wylaczone" };
}

export async function wlaczPush(tylkoKrytyczne: boolean): Promise<void> {
  if (!navigator.onLine) throw new Error("Włączenie powiadomień wymaga połączenia z internetem.");
  if (!KLUCZ) throw new Error("Powiadomienia push nie są skonfigurowane na serwerze.");
  const zgoda = await Notification.requestPermission();
  if (zgoda !== "granted") {
    throw new Error("Brak zgody na powiadomienia — zmień to w ustawieniach przeglądarki.");
  }
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const rejestracja = await navigator.serviceWorker.ready;
  const subskrypcja =
    (await rejestracja.pushManager.getSubscription()) ??
    (await rejestracja.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: kluczNaBajty(KLUCZ),
    }));
  const klucze = subskrypcja.toJSON().keys ?? {};
  const { data: token, error } = await supabase.rpc("push_zapisz_subskrypcje", {
    p_endpoint: subskrypcja.endpoint,
    p_p256dh: klucze["p256dh"] ?? "",
    p_auth: klucze["auth"] ?? "",
    p_tylko_krytyczne: tylkoKrytyczne,
  });
  if (error || !token) throw new Error("Nie udało się zapisać subskrypcji powiadomień.");
  zapisz(KLUCZ_BIEZACEJ, { endpoint: subskrypcja.endpoint, token });
}

export async function ustawTrybPush(tylkoKrytyczne: boolean): Promise<void> {
  const subskrypcja = await biezacaSubskrypcja();
  if (!subskrypcja) throw new Error("Powiadomienia na tym urządzeniu są wyłączone.");
  const { error } = await supabase
    .from("push_subskrypcje")
    .update({ tylko_krytyczne: tylkoKrytyczne })
    .eq("endpoint", subskrypcja.endpoint);
  if (error) throw new Error("Nie udało się zmienić ustawienia.");
}

/**
 * Subskrypcja zapisana z tej przeglądarki: adres i losowy token nadany przez bazę. Usunąć rekord w bazie
 * można tylko z tym tokenem, więc nikt inny (ani zaległe wyrejestrowanie poprzedniej osoby) nie skasuje
 * subskrypcji zapisanej później — ta dostaje nowy token.
 */
type Zapisana = { endpoint: string; token: string };
const KLUCZ_BIEZACEJ = "push-subskrypcja";
const KLUCZ_ZALEGLEJ = "push-do-wyrejestrowania";

function odczytaj(klucz: string): Zapisana | null {
  try {
    const w = JSON.parse(localStorage.getItem(klucz) ?? "null") as Partial<Zapisana> | null;
    return w?.endpoint && w.token ? { endpoint: w.endpoint, token: w.token } : null;
  } catch {
    return null;
  }
}

function zapisz(klucz: string, wartosc: Zapisana | null) {
  try {
    if (wartosc) localStorage.setItem(klucz, JSON.stringify(wartosc));
    else localStorage.removeItem(klucz);
  } catch {
    // Brak dostępu do pamięci przeglądarki: nic więcej nie zrobimy.
  }
}

async function usunWBazie(z: Zapisana): Promise<boolean> {
  const { error } = await supabase.rpc("push_usun_subskrypcje", {
    p_endpoint: z.endpoint,
    p_token: z.token,
  });
  return !error;
}

/**
 * Wyłącza push na tym urządzeniu: usuwa rekord w bazie (z tokenem) i subskrypcję przeglądarki. Gdy usunięcie
 * w bazie się nie uda (np. wylogowanie bez sieci), zapamiętuje je i `dokonczWyrejestrowaniePush` kończy to przy
 * następnym połączeniu — żeby na wspólnym telefonie nie przychodziły powiadomienia poprzedniej osoby.
 */
export async function wylaczPush(): Promise<void> {
  if (typeof window === "undefined" || !obslugiwane()) return;
  const subskrypcja = await biezacaSubskrypcja();
  const zapisana = odczytaj(KLUCZ_BIEZACEJ);
  zapisz(KLUCZ_BIEZACEJ, null);
  if (zapisana && !(await usunWBazie(zapisana))) zapisz(KLUCZ_ZALEGLEJ, zapisana);
  if (!zapisana && subskrypcja) {
    // Subskrypcja sprzed tokenów: własny rekord usuwamy zwykłym zapytaniem (RLS: tylko własne wiersze).
    await supabase.from("push_subskrypcje").delete().eq("endpoint", subskrypcja.endpoint);
  }
  await subskrypcja?.unsubscribe().catch(() => false);
}

/**
 * Dokańcza wyrejestrowanie zapamiętane przy wylogowaniu bez sieci. Tylko w bazie i tylko rekordu z zapamiętanym
 * tokenem — subskrypcji przeglądarki nie ruszamy, bo mogła ją już przejąć kolejna osoba (z nowym tokenem).
 */
export async function dokonczWyrejestrowaniePush(): Promise<void> {
  if (typeof window === "undefined" || !navigator.onLine) return;
  const zalegla = odczytaj(KLUCZ_ZALEGLEJ);
  if (zalegla && (await usunWBazie(zalegla))) zapisz(KLUCZ_ZALEGLEJ, null);
}
