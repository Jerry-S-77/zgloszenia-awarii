import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImportZPlikuSheet, type KonfiguracjaImportu } from "@/components/ImportZPlikuSheet";
import { profileQuery } from "@/lib/queries";
import type { Urzadzenie } from "@/lib/types";
import { ETYKIETY_STATUSU_URZADZENIA } from "@/lib/urzadzenia";
import { mapujUrzadzenia, type WierszUrzadzenia } from "@/lib/urzadzenia-import";
import { importujUrzadzenia } from "@/lib/urzadzenia-zapytania";

export const ADRES_WZORU_URZADZEN = "/wzory/wzor-importu-urzadzen.csv";

/** Import rejestru urządzeń z pliku (admin). */
export function ImportUrzadzenSheet({
  otwarte,
  onZmiana,
  urzadzenia,
}: {
  otwarte: boolean;
  onZmiana: (o: boolean) => void;
  urzadzenia: Urzadzenie[];
}) {
  const qc = useQueryClient();
  const { data: konta = [] } = useQuery({ ...profileQuery, enabled: otwarte });
  const numery = useMemo(() => new Set(urzadzenia.map((u) => u.nr_technologiczny)), [urzadzenia]);
  // Bez wczytanej listy kont nie oceniamy e-maili w podglądzie — i tak sprawdza je baza.
  const emaile = useMemo(
    () => (konta.length ? new Set(konta.map((k) => k.email.toLowerCase())) : undefined),
    [konta],
  );

  const konfiguracja: KonfiguracjaImportu<WierszUrzadzenia> = {
    tytul: "Import urządzeń z pliku",
    opis: "CSV lub XLSX według wzoru. Nowe numery trafiają do rejestru (domyślnie jako „Proponowane”), istniejące są aktualizowane; puste pola nie kasują danych. Import zapisuje wszystko albo nic.",
    adresWzoru: ADRES_WZORU_URZADZEN,
    mapuj: (w) => mapujUrzadzenia(w, numery, emaile),
    podsumowanie: (w) => {
      const nowe = w.filter((x) => !numery.has(x.nr_technologiczny)).length;
      return `${w.length} urządzeń: ${nowe} nowych, ${w.length - nowe} do aktualizacji.`;
    },
    pozycja: (w) => ({
      klucz: w.nr_technologiczny,
      tekst: `${numery.has(w.nr_technologiczny) ? "↻" : "+"} ${w.nr_technologiczny} — ${
        w.nazwa_urzadzenia
      }${w.status ? ` · ${ETYKIETY_STATUSU_URZADZENIA[w.status]}` : ""}`,
    }),
    etykietaPrzycisku: (n) => `Importuj ${n} urządzeń`,
    importuj: async (w) => {
      const { nowe, zmienione } = await importujUrzadzenia(w);
      // Aktywacja tworzy przeglądy, a lista urządzeń zasila formularz zgłoszenia.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["urzadzenia"] }),
        qc.invalidateQueries({ queryKey: ["przeglady"] }),
      ]);
      return `Zaimportowano: ${nowe} nowych, ${zmienione} zaktualizowanych`;
    },
  };

  return <ImportZPlikuSheet otwarte={otwarte} onZmiana={onZmiana} konfiguracja={konfiguracja} />;
}
