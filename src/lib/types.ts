import type { Database } from "@/integrations/supabase/types";
import type { KategoriaPrzyczyny } from "./kategorie-przyczyn";
import type { StatusAwarii } from "./statusy-awarii";

export type Urzadzenie = Database["public"]["Tables"]["urzadzenia"]["Row"];

export type Awaria = {
  id: string;
  nr_technologiczny: string;
  nazwa_urzadzenia: string;
  data_awarii: string;
  opis_awarii: string;
  przyczyna: string | null;
  czas_przestoju_h: number | null;
  krytycznosc_skutku: string;
  zglaszajacy_id: string | null;
  zglaszajacy_nazwa: string | null;
  status: StatusAwarii;
  data_zamkniecia: string | null;
  numer: string | null;
  wersja: number;
  /** Opcjonalne: wiersze i operacje kolejki sprzed dodania słownika przyczyn go nie mają. */
  kategoria_przyczyny?: KategoriaPrzyczyny | null;
};

export type AwariaLokalna = Awaria & { _pending?: boolean };
