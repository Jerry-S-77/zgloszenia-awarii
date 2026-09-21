import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { biezacyUserId, getQueue, syncQueue, usunOperacjeUzytkownika } from "@/lib/offline";
import { PROFIL_CACHE_KEY, stanPoStarcie } from "@/lib/uzytkownik-cache";
import type { Rola } from "./uprawnienia";

export type Profil = {
  id: string;
  email: string;
  imie_nazwisko: string;
  rola: Rola;
  status: "aktywny" | "zablokowany";
  must_change_password: boolean;
};

type Stan = { stan: "ladowanie" } | { stan: "brak" } | { stan: "zalogowany"; profil: Profil };
type Kontekst = Stan & { odswiezProfil: () => Promise<void>; wyloguj: () => Promise<boolean> };

const CACHE = PROFIL_CACHE_KEY;
const KOLUMNY = "id, email, imie_nazwisko, rola, status, must_change_password";

// Profil w pamięci lokalnej pozwala uruchomić aplikację offline. Służy wyłącznie do wyświetlania:
// o dostępie do danych i tak decyduje RLS.
function odczytajProfilCache(): Profil | null {
  try {
    const surowy = window.localStorage.getItem(CACHE);
    const profil = surowy ? (JSON.parse(surowy) as Profil | null) : null;
    return typeof profil?.id === "string" ? profil : null;
  } catch {
    return null;
  }
}
function odczytajCache(userId: string): Profil | null {
  const profil = odczytajProfilCache();
  return profil?.id === userId ? profil : null;
}
function zapiszCache(profil: Profil | null) {
  try {
    if (profil) window.localStorage.setItem(CACHE, JSON.stringify(profil));
    else window.localStorage.removeItem(CACHE);
  } catch {
    /* brak localStorage (tryb prywatny): aplikacja działa dalej */
  }
}

const AuthContext = createContext<Kontekst | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [stan, setStan] = useState<Stan>({ stan: "ladowanie" });

  // Numer ostatniego żądania: spóźniona odpowiedź nie może nadpisać nowszego stanu (np. po SIGNED_OUT).
  const numerZadania = useRef(0);
  // Użytkownik, którego profil wczytano ostatnio: przy zmianie konta czyścimy cache zapytań.
  const wczytanyId = useRef<string | null>(null);
  // Stan pochodzi z profilu w pamięci lokalnej (offline), a nie z bazy: po powrocie sieci odświeżamy.
  const zPamieci = useRef(false);

  const wczytaj = useCallback(
    async (userId: string | null) => {
      const zadanie = ++numerZadania.current;
      zPamieci.current = false;
      if (!userId) {
        wczytanyId.current = null;
        zapiszCache(null);
        setStan({ stan: "brak" });
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select(KOLUMNY)
        .eq("id", userId)
        .maybeSingle();
      if (numerZadania.current !== zadanie) return;
      if (error) {
        // Profil z pamięci lokalnej tylko przy problemach z siecią; inny błąd = brak dostępu.
        const siec = !navigator.onLine || /fetch|network/i.test(error.message);
        const zCache = siec ? odczytajCache(userId) : null;
        if (zCache) {
          wczytanyId.current = userId;
          zPamieci.current = true;
          setStan({ stan: "zalogowany", profil: zCache });
        } else {
          wczytanyId.current = null;
          setStan({ stan: "brak" });
        }
        return;
      }
      if (!data || data.status !== "aktywny") {
        toast.error(
          data
            ? "Konto jest zablokowane. Skontaktuj się z administratorem."
            : "Nie znaleziono profilu użytkownika. Skontaktuj się z administratorem.",
        );
        // Kolejka jest przypisana do konta, więc jej nie ruszamy: nie blokuje następnego użytkownika.
        await supabase.auth.signOut();
        if (numerZadania.current !== zadanie) return;
        wczytanyId.current = null;
        zapiszCache(null);
        setStan({ stan: "brak" });
        return;
      }
      if (wczytanyId.current !== null && wczytanyId.current !== userId) qc.clear();
      wczytanyId.current = userId;
      zapiszCache(data as Profil);
      setStan({ stan: "zalogowany", profil: data as Profil });
    },
    [qc],
  );

  /**
   * Wczytuje stan na podstawie sesji. Offline z wygasłym tokenem getSession() zwraca null, choć
   * użytkownik jest zalogowany: wtedy pokazujemy profil z pamięci lokalnej (tylko do wyświetlania,
   * o danych decyduje RLS), zamiast czyścić pamięć i odsyłać na logowanie, którego offline nie da się
   * dokończyć.
   */
  const wczytajZeStartu = useCallback(async () => {
    const cache = odczytajProfilCache();
    // Offline nie czekamy na getSession(): przy wygasłym tokenie odświeżenie zawodzi dopiero po
    // kilkudziesięciu sekundach. Online pamięci lokalnej nie ufamy (decyduje sesja).
    let sesjaId: string | null = null;
    if (navigator.onLine || !cache) {
      const { data } = await supabase.auth.getSession();
      sesjaId = data.session?.user.id ?? null;
    }
    if (stanPoStarcie(sesjaId, navigator.onLine, cache) === "cache" && cache) {
      ++numerZadania.current; // unieważnia spóźnione odpowiedzi wcześniejszych żądań
      wczytanyId.current = cache.id;
      zPamieci.current = true;
      setStan({ stan: "zalogowany", profil: cache });
      return;
    }
    await wczytaj(sesjaId);
  }, [wczytaj]);

  useEffect(() => {
    let anulowane = false;
    void wczytajZeStartu().then(
      () => undefined,
      () => undefined,
    );
    // Po powrocie sieci weryfikujemy profil pokazany z pamięci (auth-js sam odświeży token).
    const przyPowrocieSieci = () => {
      if (!anulowane && zPamieci.current) void wczytajZeStartu();
    };
    window.addEventListener("online", przyPowrocieSieci);
    const { data: sub } = supabase.auth.onAuthStateChange((zdarzenie, sesja) => {
      // Wywołania supabase wewnątrz tego callbacka mogą zawiesić klienta, stąd odroczenie.
      if (zdarzenie === "SIGNED_OUT") {
        setTimeout(() => {
          qc.clear();
          void wczytaj(null);
        }, 0);
      } else if (zdarzenie === "SIGNED_IN" || zdarzenie === "USER_UPDATED") {
        setTimeout(() => void wczytaj(sesja?.user.id ?? null), 0);
      }
    });
    return () => {
      anulowane = true;
      window.removeEventListener("online", przyPowrocieSieci);
      sub.subscription.unsubscribe();
    };
  }, [wczytaj, wczytajZeStartu, qc]);

  const odswiezProfil = wczytajZeStartu;

  /**
   * Wylogowanie zwraca false, gdy nie doszło do skutku. Niezsynchronizowane zgłoszenia tego konta
   * nie giną po cichu: najpierw próbujemy je wysłać, a usunąć je można tylko po potwierdzeniu.
   * Kolejka jest przypisana do konta, więc cudze operacje nie blokują wylogowania.
   */
  const wyloguj = useCallback(async () => {
    let userId: string | null;
    let usunPoWylogowaniu = false;
    let oczekujace: number;
    try {
      userId = await biezacyUserId(); // offline z wygasłym tokenem: id z zapisanego profilu
      oczekujace = userId ? (await getQueue(userId)).length : 0;
    } catch {
      toast.error("Nie udało się sprawdzić kolejki synchronizacji.");
      return false;
    }
    if (userId && oczekujace > 0) {
      if (!navigator.onLine) {
        toast.error(
          `Masz niezsynchronizowane zgłoszenia (${oczekujace}). Połącz się z internetem, poczekaj na synchronizację i wyloguj się ponownie.`,
        );
        return false;
      }
      try {
        await syncQueue();
        oczekujace = (await getQueue(userId)).length;
      } catch {
        toast.error("Nie udało się sprawdzić kolejki synchronizacji.");
        return false;
      }
      if (oczekujace > 0) {
        const mimoTo = window.confirm(
          `Masz niewysłane zgłoszenia (liczba: ${oczekujace}), których nie udało się wysłać. Wylogowanie je usunie. Wylogować mimo to?`,
        );
        if (!mimoTo) return false;
        usunPoWylogowaniu = true;
      }
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Nie udało się wylogować. Spróbuj ponownie.");
      return false;
    }
    // Zgłoszenia usuwamy dopiero po udanym wylogowaniu: przy błędzie nic nie ginie.
    if (userId && usunPoWylogowaniu) {
      try {
        await usunOperacjeUzytkownika(userId);
      } catch {
        toast.error("Wylogowano, ale nie udało się usunąć zgłoszeń z kolejki.");
      }
    }
    return true;
  }, []);

  const wartosc = useMemo<Kontekst>(
    () => ({ ...stan, odswiezProfil, wyloguj }),
    [stan, odswiezProfil, wyloguj],
  );
  return <AuthContext.Provider value={wartosc}>{children}</AuthContext.Provider>;
}

export function useAuth(): Kontekst {
  const kontekst = useContext(AuthContext);
  if (!kontekst) throw new Error("useAuth musi być użyty wewnątrz AuthProvider");
  return kontekst;
}
