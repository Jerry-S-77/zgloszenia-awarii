import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { WierszImportu } from "./magazyn-import";

/**
 * Magazyn części. Tylko online. Stan zmieniają wyłącznie funkcje bazy (przyjęcie, korekta, pobranie do awarii,
 * import) — każda zostawia ruch w historii; uprawnień pilnuje baza.
 */

type Tabele = Database["public"]["Tables"];
export type CzescMagazynu = Tabele["magazyn_czesci"]["Row"] & {
  urzadzenia_czesci: { nr_technologiczny: string; krytyczna: boolean }[];
};
export type RuchMagazynu = Tabele["magazyn_ruchy"]["Row"];
export type CzescUrzadzenia = {
  krytyczna: boolean;
  magazyn_czesci: Tabele["magazyn_czesci"]["Row"];
};

function wymagajSieci() {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Brak połączenia.");
}

function wymagajPolaczenia() {
  if (!navigator.onLine) throw new Error("Magazyn wymaga połączenia z internetem.");
}

/** Komunikat z bazy, gdy jest po polsku i konkretny (np. „Za mało na stanie…”); inaczej ogólny. */
function blad(error: { message?: string } | null, ogolny: string): Error {
  const m = error?.message ?? "";
  return new Error(/[ąćęłńóśźż]|Za mało|Wiersz|Podaj|wymaga/i.test(m) ? m : ogolny);
}

export const magazynQuery = queryOptions({
  queryKey: ["magazyn"],
  queryFn: async (): Promise<CzescMagazynu[]> => {
    wymagajSieci();
    const { data, error } = await supabase
      .from("magazyn_czesci")
      .select("*, urzadzenia_czesci(nr_technologiczny, krytyczna)")
      .order("nazwa");
    if (error) throw error;
    return (data ?? []).map((c) => ({
      ...c,
      stan: Number(c.stan),
      stan_minimalny: Number(c.stan_minimalny),
    }));
  },
});

export function ruchyQuery(czescId: string) {
  return queryOptions({
    queryKey: ["magazyn", czescId, "ruchy"],
    queryFn: async (): Promise<RuchMagazynu[]> => {
      wymagajSieci();
      const { data, error } = await supabase
        .from("magazyn_ruchy")
        .select("*")
        .eq("czesc_id", czescId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        zmiana: Number(r.zmiana),
        stan_po: Number(r.stan_po),
      }));
    },
  });
}

/** Części przypisane do urządzenia (karta urządzenia, pobieranie do awarii). */
export function czesciMagazynuUrzadzeniaQuery(nr: string) {
  return queryOptions({
    queryKey: ["magazyn", "urzadzenie", nr],
    queryFn: async (): Promise<CzescUrzadzenia[]> => {
      wymagajSieci();
      const { data, error } = await supabase
        .from("urzadzenia_czesci")
        .select("krytyczna, magazyn_czesci(*)")
        .eq("nr_technologiczny", nr);
      if (error) throw error;
      return (data ?? [])
        .filter((w) => w.magazyn_czesci)
        .map((w) => ({
          krytyczna: w.krytyczna,
          magazyn_czesci: {
            ...w.magazyn_czesci,
            stan: Number(w.magazyn_czesci.stan),
            stan_minimalny: Number(w.magazyn_czesci.stan_minimalny),
          },
        }))
        .sort((a, b) => a.magazyn_czesci.nazwa.localeCompare(b.magazyn_czesci.nazwa));
    },
  });
}

export type DaneCzesciMagazynu = {
  nazwa: string;
  jednostka: string;
  stan_minimalny: number;
  lokalizacja: string | null;
};

export async function dodajCzescMagazynu(
  dane: DaneCzesciMagazynu & { numer_katalogowy: string },
): Promise<void> {
  wymagajPolaczenia();
  const { error } = await supabase.from("magazyn_czesci").insert(dane);
  if (error) {
    throw new Error(
      error.code === "23505"
        ? "Część o tym numerze katalogowym już jest w magazynie."
        : "Nie udało się dodać części.",
    );
  }
}

export async function zapiszCzescMagazynu(
  id: string,
  zmiany: Partial<DaneCzesciMagazynu> & { aktywna?: boolean },
): Promise<void> {
  wymagajPolaczenia();
  const { data, error } = await supabase
    .from("magazyn_czesci")
    .update(zmiany)
    .eq("id", id)
    .select("id");
  if (error || !data?.length) throw new Error("Nie udało się zapisać części.");
}

export async function przyjmijDostawe(czescId: string, ilosc: number, uwagi: string | null) {
  wymagajPolaczenia();
  const { error } = await supabase.rpc("magazyn_przyjecie", {
    p_czesc: czescId,
    p_ilosc: ilosc,
    ...(uwagi ? { p_uwagi: uwagi } : {}),
  });
  if (error) throw blad(error, "Nie udało się przyjąć dostawy.");
}

export async function korygujStan(czescId: string, nowyStan: number, uwagi: string) {
  wymagajPolaczenia();
  const { error } = await supabase.rpc("magazyn_korekta", {
    p_czesc: czescId,
    p_nowy_stan: nowyStan,
    p_uwagi: uwagi,
  });
  if (error) throw blad(error, "Nie udało się skorygować stanu.");
}

export async function pobierzDoAwarii(czescId: string, awariaId: string, ilosc: number) {
  wymagajPolaczenia();
  const { error } = await supabase.rpc("magazyn_pobierz_do_awarii", {
    p_czesc: czescId,
    p_awaria: awariaId,
    p_ilosc: ilosc,
  });
  if (error) throw blad(error, "Nie udało się pobrać części z magazynu.");
}

/** Ustawia listę urządzeń części: dopisuje nowe, zmienia „krytyczna”, usuwa odznaczone. */
export async function ustawUrzadzeniaCzesci(
  czescId: string,
  obecne: { nr_technologiczny: string; krytyczna: boolean }[],
  nowe: { nr_technologiczny: string; krytyczna: boolean }[],
): Promise<void> {
  wymagajPolaczenia();
  // Najpierw dopisujemy, dopiero potem usuwamy: zerwane połączenie w połowie zostawia nadmiar, nie brak.
  if (nowe.length) {
    const { error } = await supabase.from("urzadzenia_czesci").upsert(
      nowe.map((n) => ({ ...n, czesc_id: czescId })),
      { onConflict: "nr_technologiczny,czesc_id" },
    );
    if (error) throw new Error("Nie udało się zapisać urządzeń części.");
  }
  const doUsuniecia = obecne
    .filter((o) => !nowe.some((n) => n.nr_technologiczny === o.nr_technologiczny))
    .map((o) => o.nr_technologiczny);
  if (doUsuniecia.length) {
    const { error } = await supabase
      .from("urzadzenia_czesci")
      .delete()
      .eq("czesc_id", czescId)
      .in("nr_technologiczny", doUsuniecia);
    if (error) throw new Error("Nie udało się zapisać urządzeń części.");
  }
}

export async function importujMagazyn(
  wiersze: WierszImportu[],
): Promise<{ nowe: number; zmienione: number }> {
  wymagajPolaczenia();
  const { data, error } = await supabase.rpc("magazyn_import", { p_wiersze: wiersze });
  if (error) throw blad(error, "Import nie powiódł się — nic nie zostało zapisane.");
  return data as { nowe: number; zmienione: number };
}

export function niskiStan(c: { stan: number; stan_minimalny: number }): boolean {
  return c.stan_minimalny > 0 && c.stan < c.stan_minimalny;
}

export function formatujIlosc(n: number, jednostka: string): string {
  return `${n.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} ${jednostka}`;
}
