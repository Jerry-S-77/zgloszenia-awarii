import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getQueue } from "./offline";
import type { AwariaLokalna, Urzadzenie } from "./types";

export const urzadzeniaQuery = queryOptions({
  queryKey: ["urzadzenia"],
  queryFn: async (): Promise<Urzadzenie[]> => {
    const { data, error } = await supabase
      .from("urzadzenia")
      .select("*")
      .eq("status_w_rejestrze", "Aktywne")
      .order("nr_technologiczny");
    if (error) throw error;
    return (data ?? []) as Urzadzenie[];
  },
});

export const awarieQuery = queryOptions({
  queryKey: ["awarie"],
  queryFn: async (): Promise<AwariaLokalna[]> => {
    let zdalne: AwariaLokalna[] = [];
    try {
      const { data, error } = await supabase
        .from("awarie")
        .select("*")
        .order("data_awarii", { ascending: false });
      if (error) throw error;
      zdalne = (data ?? []) as AwariaLokalna[];
    } catch {
      zdalne = [];
    }
    const kolejka = await getQueue();
    const lokalne = kolejka
      .filter((op) => op.type === "insert")
      .map((op) => ({ ...(op.payload as AwariaLokalna), _pending: true }));
    const zmiany = kolejka.filter((op) => op.type === "update");
    const wszystkie = [...lokalne, ...zdalne].map((a) => {
      const zm = zmiany.filter((z) => z.payload.id === a.id);
      return zm.length
        ? { ...a, ...Object.assign({}, ...zm.map((z) => z.payload)), _pending: true }
        : a;
    });
    return wszystkie.sort((a, b) => b.data_awarii.localeCompare(a.data_awarii));
  },
});

export type ProfilListy = Database["public"]["Tables"]["profiles"]["Row"];

export const profileQuery = queryOptions({
  queryKey: ["profiles"],
  queryFn: async (): Promise<ProfilListy[]> => {
    const { data, error } = await supabase.from("profiles").select("*").order("imie_nazwisko");
    if (error) throw error;
    return data ?? [];
  },
});
