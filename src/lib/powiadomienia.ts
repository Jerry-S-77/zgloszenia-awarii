import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { wymagajSieci } from "./queries";

/**
 * Powiadomienia w aplikacji. Tworzy je baza (triggery i codzienne zadanie pg_cron); klient tylko czyta
 * własne i oznacza je jako przeczytane. Nowe przychodzą na żywo przez Supabase Realtime.
 */

export type Powiadomienie = Database["public"]["Tables"]["powiadomienia"]["Row"];

const LIMIT = 50;

export function powiadomieniaQuery(uzytkownikId: string | null) {
  return queryOptions({
    queryKey: ["powiadomienia", uzytkownikId],
    queryFn: async (): Promise<Powiadomienie[]> => {
      wymagajSieci();
      if (!uzytkownikId) return [];
      const { data, error } = await supabase
        .from("powiadomienia")
        .select("*")
        .eq("uzytkownik_id", uzytkownikId)
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export async function oznaczPrzeczytane(id: string): Promise<void> {
  const { error } = await supabase.from("powiadomienia").update({ przeczytane: true }).eq("id", id);
  if (error) throw new Error("Nie udało się oznaczyć powiadomienia.");
}

export async function oznaczWszystkie(uzytkownikId: string): Promise<void> {
  if (!navigator.onLine) throw new Error("Oznaczanie wymaga połączenia z internetem.");
  const { error } = await supabase
    .from("powiadomienia")
    .update({ przeczytane: true })
    .eq("uzytkownik_id", uzytkownikId)
    .eq("przeczytane", false);
  if (error) throw new Error("Nie udało się oznaczyć powiadomień.");
}

/** Nasłuch nowych powiadomień na żywo (RLS obowiązuje także w Realtime: każdy słyszy tylko swoje). */
export function useNaZywoPowiadomienia(uzytkownikId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!uzytkownikId) return;
    const kanal = supabase
      // Unikalna nazwa: przy nawigacji dzwonek montuje się na nowo, a kanał o tej samej nazwie może jeszcze
      // być w trakcie zamykania — realtime-js zwróciłby wtedy ten zamykany kanał i nasłuch by przepadł.
      .channel(`powiadomienia:${uzytkownikId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "powiadomienia",
          filter: `uzytkownik_id=eq.${uzytkownikId}`,
        },
        () => void qc.invalidateQueries({ queryKey: ["powiadomienia", uzytkownikId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(kanal);
    };
  }, [uzytkownikId, qc]);
}
