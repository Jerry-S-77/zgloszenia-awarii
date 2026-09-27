import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { CzescZAwaria, StatusCzesci } from "./czesci-logika";

/**
 * Części zamienne przy awarii. Działają tylko online (jak zespół i komentarze); uprawnień i zamrożenia
 * po zamknięciu awarii pilnuje baza.
 */

export type Czesc = Database["public"]["Tables"]["awarie_czesci"]["Row"];

function wymagajSieci() {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Brak połączenia.");
}

function wymagajPolaczenia() {
  if (!navigator.onLine) throw new Error("Części zamienne wymagają połączenia z internetem.");
}

export function czesciAwariiQuery(awariaId: string) {
  return queryOptions({
    queryKey: ["awarie", awariaId, "czesci"],
    queryFn: async (): Promise<Czesc[]> => {
      wymagajSieci();
      const { data, error } = await supabase
        .from("awarie_czesci")
        .select("*")
        .eq("awaria_id", awariaId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Wszystkie części z awarii danego urządzenia (historia i podpowiedzi nazw), najnowsze pierwsze. */
export function czesciUrzadzeniaQuery(nr: string) {
  return queryOptions({
    queryKey: ["urzadzenia", nr, "czesci"],
    queryFn: async (): Promise<CzescZAwaria[]> => {
      wymagajSieci();
      const { data, error } = await supabase
        .from("awarie_czesci")
        .select(
          "nazwa, ilosc, status, created_at, awarie!inner(numer, data_awarii, nr_technologiczny)",
        )
        .eq("awarie.nr_technologiczny", nr)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((c) => ({
        nazwa: c.nazwa,
        ilosc: c.ilosc,
        status: c.status,
        awaria: { numer: c.awarie.numer, data_awarii: c.awarie.data_awarii },
      }));
    },
  });
}

/** Niedostarczone części awarii wstrzymanych na części (zestawienie „Czekają na części”). */
export const czesciOczekujaceQuery = queryOptions({
  queryKey: ["czesci", "oczekujace"],
  queryFn: async (): Promise<Czesc[]> => {
    wymagajSieci();
    const { data, error } = await supabase
      .from("awarie_czesci")
      .select("*, awarie!inner(status)")
      .eq("awarie.status", "oczekuje_na_czesc")
      .neq("status", "dostarczona")
      .order("created_at");
    if (error) throw error;
    return (data ?? []).map(({ awarie: _awaria, ...c }) => c);
  },
});

export async function dodajCzesc(dane: {
  awariaId: string;
  nazwa: string;
  ilosc: number;
  terminDostawy: string | null;
}): Promise<void> {
  wymagajPolaczenia();
  const { error } = await supabase.from("awarie_czesci").insert({
    awaria_id: dane.awariaId,
    nazwa: dane.nazwa,
    ilosc: dane.ilosc,
    termin_dostawy: dane.terminDostawy,
  });
  if (error) throw new Error("Nie udało się dodać części (awaria zamknięta albo brak uprawnień).");
}

export async function zmienStatusCzesci(id: string, status: StatusCzesci): Promise<void> {
  wymagajPolaczenia();
  const { data, error } = await supabase
    .from("awarie_czesci")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) throw new Error("Nie udało się zmienić statusu części.");
}

export async function usunCzesc(id: string): Promise<void> {
  wymagajPolaczenia();
  const { data, error } = await supabase.from("awarie_czesci").delete().eq("id", id).select("id");
  if (error || !data?.length) throw new Error("Nie udało się usunąć części.");
}
