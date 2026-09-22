import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Komentarz = Database["public"]["Tables"]["awarie_komentarze"]["Row"];

export function komentarzeQuery(awariaId: string) {
  return queryOptions({
    queryKey: ["awarie", awariaId, "komentarze"],
    queryFn: async (): Promise<Komentarz[]> => {
      if (typeof navigator !== "undefined" && !navigator.onLine)
        throw new Error("Brak połączenia.");
      const { data, error } = await supabase
        .from("awarie_komentarze")
        .select("*")
        .eq("awaria_id", awariaId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Komentarze wymagają połączenia (nie przechodzą przez kolejkę offline — patrz Global Constraints planu etapu 2). */
export async function dodajKomentarz(awariaId: string, tresc: string): Promise<void> {
  if (!navigator.onLine) throw new Error("Komentarze wymagają połączenia z internetem.");
  const { error } = await supabase.from("awarie_komentarze").insert({ awaria_id: awariaId, tresc });
  if (error) throw new Error("Nie udało się zapisać komentarza.");
}
