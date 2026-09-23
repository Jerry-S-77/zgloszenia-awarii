import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { wymagajSieci } from "./queries";

/**
 * Przeglądy działają wyłącznie online (jak komentarze): nie przechodzą przez kolejkę offline awarii.
 * Reguły dat i propozycji pilnuje baza (triggery, RPC `przeglady_decyzja`).
 */

type Tabele = Database["public"]["Tables"];
export type Propozycja = Tabele["przeglady_propozycje"]["Row"];
export type Wykonanie = Tabele["przeglady_wykonania"]["Row"];
export type PrzegladZUrzadzeniem = Tabele["przeglady"]["Row"] & {
  urzadzenia: Pick<
    Tabele["urzadzenia"]["Row"],
    "nazwa_urzadzenia" | "wlasciciel_nazwa" | "status" | "lokalizacja"
  > | null;
  przeglady_propozycje: Propozycja[];
};
export type ZmianyHarmonogramu = Pick<
  Tabele["przeglady"]["Update"],
  "typ_czynnosci" | "czestotliwosc_dni" | "data_najblizszego" | "wykonawca" | "uwagi"
>;

export type PowodPropozycji = {
  awarie_90?: number;
  wysokie_60?: number;
  przestoj_30?: number;
  awarie?: { numer: string | null; data: string }[];
};

export const przegladyQuery = queryOptions({
  queryKey: ["przeglady"],
  queryFn: async (): Promise<PrzegladZUrzadzeniem[]> => {
    wymagajSieci();
    const { data, error } = await supabase
      .from("przeglady")
      .select(
        "*, urzadzenia(nazwa_urzadzenia, wlasciciel_nazwa, status, lokalizacja), przeglady_propozycje(*)",
      );
    if (error) throw error;
    // Przeglądy wycofanych urządzeń nie są już do wykonania.
    return ((data ?? []) as PrzegladZUrzadzeniem[]).filter(
      (p) => p.urzadzenia?.status !== "wycofane",
    );
  },
});

export function wykonaniaQuery(przegladId: string) {
  return queryOptions({
    queryKey: ["przeglady", przegladId, "wykonania"],
    queryFn: async (): Promise<Wykonanie[]> => {
      wymagajSieci();
      const { data, error } = await supabase
        .from("przeglady_wykonania")
        .select("*")
        .eq("przeglad_id", przegladId)
        .order("data_wykonania", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function oczekujacaPropozycja(p: PrzegladZUrzadzeniem): Propozycja | undefined {
  return p.przeglady_propozycje.find((x) => x.status === "oczekuje");
}

function wymagajPolaczenia() {
  if (!navigator.onLine) throw new Error("Przeglądy wymagają połączenia z internetem.");
}

export async function odnotujWykonanie(dane: {
  przegladId: string;
  dataWykonania: string;
  wykonawca: string | null;
  uwagi: string | null;
}): Promise<void> {
  wymagajPolaczenia();
  const { error } = await supabase.from("przeglady_wykonania").insert({
    przeglad_id: dane.przegladId,
    data_wykonania: dane.dataWykonania,
    wykonawca: dane.wykonawca,
    uwagi: dane.uwagi,
  });
  if (error) {
    throw new Error(
      error.message.includes("przyszłości")
        ? "Data wykonania nie może być w przyszłości."
        : "Nie udało się zapisać wykonania przeglądu.",
    );
  }
}

export async function zapiszHarmonogram(id: string, zmiany: ZmianyHarmonogramu): Promise<void> {
  wymagajPolaczenia();
  const { data, error } = await supabase.from("przeglady").update(zmiany).eq("id", id).select("id");
  if (error) throw new Error("Nie udało się zapisać harmonogramu.");
  if (!data || data.length === 0) throw new Error("Brak uprawnień do zmiany harmonogramu.");
}

export async function zdecydujPropozycje(id: string, zatwierdz: boolean): Promise<void> {
  wymagajPolaczenia();
  const { error } = await supabase.rpc("przeglady_decyzja", {
    p_propozycja_id: id,
    p_zatwierdz: zatwierdz,
  });
  if (error) {
    throw new Error(
      error.message.includes("rozpatrzona")
        ? "Ktoś już rozpatrzył tę propozycję. Odśwież."
        : "Nie udało się zapisać decyzji.",
    );
  }
}
