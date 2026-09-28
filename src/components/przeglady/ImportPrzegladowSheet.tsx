import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImportZPlikuSheet, type KonfiguracjaImportu } from "@/components/ImportZPlikuSheet";
import { kluczTekstu } from "@/lib/import-plik";
import { mapujPrzeglady, type WierszPrzegladu } from "@/lib/przeglady-import";
import { importujPrzeglady, type PrzegladZUrzadzeniem } from "@/lib/przeglady-zapytania";
import { wszystkieUrzadzeniaQuery } from "@/lib/urzadzenia-zapytania";

export const ADRES_WZORU_PRZEGLADOW = "/wzory/wzor-importu-przegladow.csv";

/** Import harmonogramu przeglądów z listami kontrolnymi (kierownik, admin). */
export function ImportPrzegladowSheet({
  otwarte,
  onZmiana,
  przeglady,
  dzis,
}: {
  otwarte: boolean;
  onZmiana: (o: boolean) => void;
  przeglady: PrzegladZUrzadzeniem[];
  dzis: string;
}) {
  const qc = useQueryClient();
  const { data: urzadzenia = [] } = useQuery({ ...wszystkieUrzadzeniaQuery, enabled: otwarte });
  const numery = useMemo(
    () => (urzadzenia.length ? new Set(urzadzenia.map((u) => u.nr_technologiczny)) : undefined),
    [urzadzenia],
  );
  const istniejace = useMemo(
    () =>
      new Set(
        przeglady
          .filter((p) => p.typ_czynnosci)
          .map((p) => `${p.nr_technologiczny}|${kluczTekstu(p.typ_czynnosci)}`),
      ),
    [przeglady],
  );
  const jestNa = (w: WierszPrzegladu) =>
    istniejace.has(`${w.nr_technologiczny}|${kluczTekstu(w.typ_czynnosci)}`);

  const konfiguracja: KonfiguracjaImportu<WierszPrzegladu> = {
    tytul: "Import harmonogramu z pliku",
    opis: "CSV lub XLSX według wzoru. Przegląd rozpoznawany po urządzeniu i typie czynności: istniejący jest aktualizowany, nowy dodawany. Najbliższy termin = ostatni + częstotliwość, jeśli go nie podasz. Lista kontrolna: punkty rozdzielone „|”.",
    adresWzoru: ADRES_WZORU_PRZEGLADOW,
    mapuj: (w) => mapujPrzeglady(w, dzis, numery),
    podsumowanie: (w) => {
      const nowe = w.filter((x) => !jestNa(x)).length;
      return `${w.length} przeglądów: ${nowe} nowych, ${w.length - nowe} do aktualizacji.`;
    },
    pozycja: (w) => ({
      klucz: `${w.nr_technologiczny}|${w.typ_czynnosci}`,
      tekst: `${jestNa(w) ? "↻" : "+"} ${w.nr_technologiczny} — ${w.typ_czynnosci}${
        w.data_najblizszego ? ` · termin ${w.data_najblizszego}` : ""
      }${w.lista_kontrolna ? ` · ${w.lista_kontrolna.length} pkt listy` : ""}`,
    }),
    etykietaPrzycisku: (n) => `Importuj ${n} przeglądów`,
    importuj: async (w) => {
      const { nowe, zmienione } = await importujPrzeglady(w);
      await qc.invalidateQueries({ queryKey: ["przeglady"] });
      return `Zaimportowano: ${nowe} nowych, ${zmienione} zaktualizowanych`;
    },
  };

  return <ImportZPlikuSheet otwarte={otwarte} onZmiana={onZmiana} konfiguracja={konfiguracja} />;
}
