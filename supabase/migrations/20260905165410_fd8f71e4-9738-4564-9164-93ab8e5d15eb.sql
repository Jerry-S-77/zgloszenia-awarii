CREATE TABLE public.pracownicy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imie_nazwisko text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pracownicy TO authenticated;
GRANT SELECT ON public.pracownicy TO anon;
GRANT ALL ON public.pracownicy TO service_role;
ALTER TABLE public.pracownicy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pracownicy_read_all" ON public.pracownicy FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.urzadzenia (
  nr_technologiczny text PRIMARY KEY,
  nazwa_urzadzenia text NOT NULL,
  kategoria text,
  lokalizacja text,
  krytycznosc text,
  wlasciciel text,
  status_w_rejestrze text NOT NULL DEFAULT 'Aktywne',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.urzadzenia TO authenticated;
GRANT SELECT ON public.urzadzenia TO anon;
GRANT ALL ON public.urzadzenia TO service_role;
ALTER TABLE public.urzadzenia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "urzadzenia_read_all" ON public.urzadzenia FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.awarie (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nr_technologiczny text NOT NULL REFERENCES public.urzadzenia(nr_technologiczny),
  nazwa_urzadzenia text NOT NULL,
  data_awarii timestamptz NOT NULL DEFAULT now(),
  opis_awarii text NOT NULL,
  przyczyna text,
  czas_przestoju_h numeric,
  krytycznosc_skutku text NOT NULL,
  osoba_zglaszajaca_id uuid REFERENCES public.pracownicy(id),
  status text NOT NULL DEFAULT 'Otwarta',
  data_zamkniecia timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.awarie TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.awarie TO anon;
GRANT ALL ON public.awarie TO service_role;
ALTER TABLE public.awarie ENABLE ROW LEVEL SECURITY;
CREATE POLICY "awarie_read_all" ON public.awarie FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "awarie_insert_all" ON public.awarie FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "awarie_update_all" ON public.awarie FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX awarie_data_idx ON public.awarie (data_awarii DESC);
CREATE INDEX awarie_nr_idx ON public.awarie (nr_technologiczny);

INSERT INTO public.pracownicy (imie_nazwisko) VALUES
 ('Jan Kowalski'),('Piotr Nowak'),('Anna Wisniewska'),('Marek Zielinski'),('Tomasz Krawczyk'),
 ('Katarzyna Nowicka'),('Pawel Adamczyk'),('Lukasz Dabrowski'),('Grzegorz Wojcik'),('Robert Kaczmarek');

INSERT INTO public.urzadzenia (nr_technologiczny, nazwa_urzadzenia, kategoria, lokalizacja, krytycznosc, status_w_rejestrze) VALUES
 ('HVAC-01','AHU nr 1 - strefa CNC HPAPI','HVAC','Hala CNC - AHU1','Wysoka','Aktywne'),
 ('WFI-02','Stacja wody oczyszczonej WFI-2','Woda oczyszczona / media krytyczne','Pomieszczenie mediow','Wysoka','Aktywne'),
 ('DCS-03','System DCS linia B','Automatyka DCS/PLC/SCADA','Sterownia linia B','Wysoka','Aktywne'),
 ('ISO-04','Izolator do syntezy nr 4','Izolatory produkcyjne','Hala syntez','Wysoka','Aktywne'),
 ('CO-05','Instalacja CO - kociol 2','CT/CO','Kotlownia','Srednia','Aktywne'),
 ('HVAC-06','AHU nr 6 - magazyn','HVAC','Magazyn surowcow','Niska','Aktywne');