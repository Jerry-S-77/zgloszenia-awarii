import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { wymagajSieci } from "./queries";
import type { Urzadzenie } from "./types";
import type { DaneUrzadzenia, StatusUrzadzenia } from "./urzadzenia";

/** Rejestr urządzeń (admin). Tylko online; uprawnienia i niezmienność numeru pilnuje baza. */
export const wszystkieUrzadzeniaQuery = queryOptions({
  queryKey: ["urzadzenia", "wszystkie"],
  queryFn: async (): Promise<Urzadzenie[]> => {
    wymagajSieci();
    const { data, error } = await supabase
      .from("urzadzenia")
      .select("*")
      .order("status")
      .order("nr_technologiczny");
    if (error) throw error;
    return data ?? [];
  },
});

function wymagajPolaczenia() {
  if (!navigator.onLine) throw new Error("Zmiany w rejestrze urządzeń wymagają połączenia.");
}

export async function dodajUrzadzenie(dane: DaneUrzadzenia): Promise<void> {
  wymagajPolaczenia();
  const { error } = await supabase
    .from("urzadzenia")
    .insert({ ...dane, wlasciciel_nazwa: null, status: "proponowane" });
  if (error) {
    throw new Error(
      error.code === "23505"
        ? "Urządzenie o tym numerze technologicznym już istnieje."
        : "Nie udało się dodać urządzenia.",
    );
  }
}

/**
 * `odpietoKonto`: admin usunął właściciela, który był kontem — wtedy czyścimy też jego nazwisko.
 * Nazwisko bez konta (z importu arkusza) zostaje; przy wyborze konta nazwisko wpisze trigger w bazie.
 */
export async function zapiszUrzadzenie(
  nr: string,
  dane: Omit<DaneUrzadzenia, "nr_technologiczny">,
  odpietoKonto: boolean,
): Promise<void> {
  wymagajPolaczenia();
  const zmiany = odpietoKonto ? { ...dane, wlasciciel_nazwa: null } : dane;
  const { data, error } = await supabase
    .from("urzadzenia")
    .update(zmiany)
    .eq("nr_technologiczny", nr)
    .select("nr_technologiczny");
  if (error) throw new Error("Nie udało się zapisać urządzenia.");
  if (!data || data.length === 0) throw new Error("Brak uprawnień do zmiany urządzenia.");
}

export async function zmienStatusUrzadzenia(nr: string, status: StatusUrzadzenia): Promise<void> {
  wymagajPolaczenia();
  const { data, error } = await supabase
    .from("urzadzenia")
    .update({ status })
    .eq("nr_technologiczny", nr)
    .select("nr_technologiczny");
  if (error) throw new Error("Nie udało się zmienić statusu urządzenia.");
  if (!data || data.length === 0) throw new Error("Brak uprawnień do zmiany urządzenia.");
}
