import type { StatusAwarii } from "./statusy-awarii";

export type Urzadzenie = {
  nr_technologiczny: string;
  nazwa_urzadzenia: string;
  kategoria: string | null;
  lokalizacja: string | null;
  krytycznosc: string | null;
  wlasciciel: string | null;
  status_w_rejestrze: string;
};

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
  przypisany_technik_id: string | null;
};

export type AwariaLokalna = Awaria & { _pending?: boolean };
