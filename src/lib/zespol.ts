import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { wymagajSieci } from "./queries";

/**
 * Zespół przy awarii: kilka osób obsługi na jedno zgłoszenie. Tylko online (jak komentarze) — kto może dodać
 * kogo, pilnuje baza (technik tylko siebie, kierownik i admin dowolną osobę obsługi).
 */

export type CzlonekZespolu = Database["public"]["Tables"]["awarie_zespol"]["Row"];
export type OsobaObslugi = Database["public"]["Functions"]["osoby_obslugi"]["Returns"][number];

export function zespolQuery(awariaId: string) {
  return queryOptions({
    queryKey: ["awarie", awariaId, "zespol"],
    queryFn: async (): Promise<CzlonekZespolu[]> => {
      wymagajSieci();
      const { data, error } = await supabase
        .from("awarie_zespol")
        .select("*")
        .eq("awaria_id", awariaId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Id awarii, w których zespole jest dana osoba (widok „Zadania → Przypisane do mnie”). */
export function mojeZespolyQuery(uzytkownikId: string | null) {
  return queryOptions({
    queryKey: ["zespoly", uzytkownikId],
    queryFn: async (): Promise<string[]> => {
      wymagajSieci();
      if (!uzytkownikId) return [];
      const { data, error } = await supabase
        .from("awarie_zespol")
        .select("awaria_id")
        .eq("uzytkownik_id", uzytkownikId);
      if (error) throw error;
      return (data ?? []).map((w) => w.awaria_id);
    },
  });
}

export const osobyObslugiQuery = queryOptions({
  queryKey: ["osoby-obslugi"],
  queryFn: async (): Promise<OsobaObslugi[]> => {
    wymagajSieci();
    const { data, error } = await supabase.rpc("osoby_obslugi");
    if (error) throw error;
    return data ?? [];
  },
});

function wymagajPolaczenia() {
  if (!navigator.onLine) throw new Error("Zmiany w zespole wymagają połączenia z internetem.");
}

export async function dodajDoZespolu(awariaId: string, uzytkownikId: string): Promise<void> {
  wymagajPolaczenia();
  const { error } = await supabase
    .from("awarie_zespol")
    .insert({ awaria_id: awariaId, uzytkownik_id: uzytkownikId });
  if (error) {
    throw new Error(
      error.code === "23505"
        ? "Ta osoba jest już w zespole."
        : "Nie udało się dodać do zespołu (awaria zamknięta albo brak uprawnień).",
    );
  }
}

export async function usunZZespolu(awariaId: string, uzytkownikId: string): Promise<void> {
  wymagajPolaczenia();
  const { data, error } = await supabase
    .from("awarie_zespol")
    .delete()
    .eq("awaria_id", awariaId)
    .eq("uzytkownik_id", uzytkownikId)
    .select("uzytkownik_id");
  if (error) throw new Error("Nie udało się usunąć z zespołu.");
  if (!data || data.length === 0)
    throw new Error("Nie można zmienić zespołu (awaria zamknięta albo brak uprawnień).");
}
