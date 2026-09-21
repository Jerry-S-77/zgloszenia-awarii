import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getQueue } from "@/lib/offline";
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

const CACHE = "profil-cache-v1";
const KOLUMNY = "id, email, imie_nazwisko, rola, status, must_change_password";

// Profil w pamięci lokalnej pozwala uruchomić aplikację offline. Służy wyłącznie do wyświetlania:
// o dostępie do danych i tak decyduje RLS.
function odczytajCache(userId: string): Profil | null {
  try {
    const surowy = window.localStorage.getItem(CACHE);
    const profil = surowy ? (JSON.parse(surowy) as Profil) : null;
    return profil?.id === userId ? profil : null;
  } catch {
    return null;
  }
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

  const wczytaj = useCallback(async (userId: string | null) => {
    if (!userId) {
      zapiszCache(null);
      setStan({ stan: "brak" });
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select(KOLUMNY)
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      const zCache = odczytajCache(userId); // offline lub chwilowy błąd sieci
      setStan(zCache ? { stan: "zalogowany", profil: zCache } : { stan: "brak" });
      return;
    }
    if (!data || data.status !== "aktywny") {
      toast.error("Konto jest zablokowane. Skontaktuj się z administratorem.");
      await supabase.auth.signOut();
      zapiszCache(null);
      setStan({ stan: "brak" });
      return;
    }
    zapiszCache(data as Profil);
    setStan({ stan: "zalogowany", profil: data as Profil });
  }, []);

  useEffect(() => {
    let anulowane = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!anulowane) void wczytaj(data.session?.user.id ?? null);
    });
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
      sub.subscription.unsubscribe();
    };
  }, [wczytaj, qc]);

  const odswiezProfil = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await wczytaj(data.session?.user.id ?? null);
  }, [wczytaj]);

  /** Wylogowanie zwraca false, gdy w kolejce są niezsynchronizowane zgłoszenia (nie wolno ich zgubić). */
  const wyloguj = useCallback(async () => {
    const oczekujace = (await getQueue()).length;
    if (oczekujace > 0) {
      toast.error(
        `Masz niezsynchronizowane zgłoszenia (${oczekujace}). Połącz się z internetem, poczekaj na synchronizację i wyloguj się ponownie.`,
      );
      return false;
    }
    await supabase.auth.signOut();
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
