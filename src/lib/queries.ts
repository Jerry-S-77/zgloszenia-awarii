import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { scalAwarie, zdalneLubZCache } from "./awarie-cache";
import { getMojaKolejka } from "./offline";
import type { AwariaLokalna, Urzadzenie } from "./types";

/**
 * Offline każde zapytanie do Supabase najpierw czeka na getSession(), które przy wygasłym tokenie
 * ponawia odświeżenie przez kilkadziesiąt sekund. Zapytania, które i tak by zawiodły, kończymy więc
 * od razu. Ekran zachowuje poprzednie dane, bo TanStack trzyma `data` mimo błędu; zapytanie o awarie
 * zamiast błędu zwraca połączony widok, więc samo sięga po swoje poprzednie wiersze (awarieQuery).
 */
export function wymagajSieci() {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Brak połączenia.");
}

export const urzadzeniaQuery = queryOptions({
  queryKey: ["urzadzenia"],
  queryFn: async (): Promise<Urzadzenie[]> => {
    wymagajSieci();
    const { data, error } = await supabase
      .from("urzadzenia")
      .select("*")
      .eq("status", "aktywne")
      .order("nr_technologiczny");
    if (error) throw error;
    return data ?? [];
  },
});

export const awarieQuery = queryOptions({
  queryKey: ["awarie"],
  queryFn: async ({ client, queryKey }): Promise<AwariaLokalna[]> => {
    let pobrane: AwariaLokalna[] | null = null;
    try {
      wymagajSieci(); // offline nie czekamy na sesję: zostają wiersze z poprzedniego pobrania
      const { data, error } = await supabase
        .from("awarie")
        .select("*")
        .order("data_awarii", { ascending: false });
      if (error) throw error;
      pobrane = (data ?? []) as AwariaLokalna[];
    } catch {
      pobrane = null;
    }
    // Poprzednie wiersze bierzemy z pamięci zapytań (czyszczonej przy zmianie użytkownika), a nie
    // ze zmiennej modułu, która przeciekałaby między kontami.
    const zdalne = zdalneLubZCache(pobrane, client.getQueryData<AwariaLokalna[]>(queryKey));
    const kolejka = await getMojaKolejka();
    return scalAwarie(zdalne, kolejka);
  },
});

export type StatystykaProgow =
  Database["public"]["Functions"]["statystyki_progow_urzadzen"]["Returns"][number];

/** Progi awaryjności liczy baza (jedno źródło reguł; te same dane zasilają propozycje przeglądów). */
export const progiQuery = queryOptions({
  queryKey: ["progi"],
  queryFn: async (): Promise<StatystykaProgow[]> => {
    wymagajSieci();
    const { data, error } = await supabase.rpc("statystyki_progow_urzadzen");
    if (error) throw error;
    return (data ?? [])
      .map((s) => ({ ...s, przestoj_30: Number(s.przestoj_30) }))
      .sort((a, b) => b.razem - a.razem || b.awarie_90 - a.awarie_90);
  },
});

export type ProfilListy = Database["public"]["Tables"]["profiles"]["Row"];

export const profileQuery = queryOptions({
  queryKey: ["profiles"],
  queryFn: async (): Promise<ProfilListy[]> => {
    wymagajSieci();
    const { data, error } = await supabase.from("profiles").select("*").order("imie_nazwisko");
    if (error) throw error;
    return data ?? [];
  },
});

export type WpisHistorii = Database["public"]["Tables"]["awarie_historia"]["Row"];

export function historiaQuery(awariaId: string) {
  return queryOptions({
    queryKey: ["awarie", awariaId, "historia"],
    queryFn: async (): Promise<WpisHistorii[]> => {
      wymagajSieci();
      const { data, error } = await supabase
        .from("awarie_historia")
        .select("*")
        .eq("awaria_id", awariaId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}
