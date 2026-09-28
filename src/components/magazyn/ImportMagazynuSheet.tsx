import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PrzelacznikOpcji } from "@/components/analizy/Pareto";
import { ImportZPlikuSheet, type KonfiguracjaImportu } from "@/components/ImportZPlikuSheet";
import {
  formatujIlosc,
  importujDostawe,
  importujInwentaryzacje,
  importujMagazyn,
  type CzescMagazynu,
} from "@/lib/magazyn";
import {
  mapujDostawe,
  mapujInwentaryzacje,
  mapujWiersze,
  type WierszDostawy,
  type WierszImportu,
  type WierszInwentaryzacji,
} from "@/lib/magazyn-import";

export const ADRES_WZORU = "/wzory/wzor-importu-magazynu.csv";
export const ADRES_WZORU_INWENTARYZACJI = "/wzory/wzor-inwentaryzacji.csv";
export const ADRES_WZORU_DOSTAWY = "/wzory/wzor-dostawy.csv";

type Rodzaj = "katalog" | "inwentaryzacja" | "dostawa";

/** Import do magazynu z pliku: katalog części, inwentaryzacja (stan faktyczny) albo dostawa zbiorcza. */
export function ImportMagazynuSheet({
  otwarte,
  onZmiana,
  czesci,
}: {
  otwarte: boolean;
  onZmiana: (o: boolean) => void;
  czesci: CzescMagazynu[];
}) {
  const qc = useQueryClient();
  const [rodzaj, setRodzaj] = useState<Rodzaj>("katalog");
  const poNumerze = useMemo(() => new Map(czesci.map((c) => [c.numer_katalogowy, c])), [czesci]);
  const numery = useMemo(() => new Set(poNumerze.keys()), [poNumerze]);
  const odswiez = () => qc.invalidateQueries({ queryKey: ["magazyn"] });
  const ilosc = (numer: string, n: number) =>
    formatujIlosc(n, poNumerze.get(numer)?.jednostka ?? "szt.");

  const katalog: KonfiguracjaImportu<WierszImportu> = {
    tytul: "Import części z pliku",
    opis: "CSV lub XLSX według wzoru. Istniejące numery katalogowe są aktualizowane (bez zmiany stanu), nowe dostają stan początkowy. Import zapisuje wszystko albo nic.",
    adresWzoru: ADRES_WZORU,
    mapuj: mapujWiersze,
    podsumowanie: (w) => {
      const nowe = w.filter((x) => !numery.has(x.numer_katalogowy)).length;
      return `${w.length} części: ${nowe} nowych, ${w.length - nowe} do aktualizacji.`;
    },
    pozycja: (w) => ({
      klucz: w.numer_katalogowy,
      tekst: `${numery.has(w.numer_katalogowy) ? "↻" : "+"} ${w.numer_katalogowy} — ${w.nazwa}${
        w.urzadzenia.length ? ` (${w.urzadzenia.join(", ")})` : ""
      }`,
    }),
    etykietaPrzycisku: (n) => `Importuj ${n} części`,
    importuj: async (w) => {
      const { nowe, zmienione } = await importujMagazyn(w);
      await odswiez();
      return `Zaimportowano: ${nowe} nowych, ${zmienione} zaktualizowanych`;
    },
  };

  const inwentaryzacja: KonfiguracjaImportu<WierszInwentaryzacji> = {
    tytul: "Inwentaryzacja z pliku",
    opis: "Stan faktyczny części według wzoru. Każda różnica zapisze się jako korekta z powodem „Inwentaryzacja”. Zapis wszystkiego albo nic.",
    adresWzoru: ADRES_WZORU_INWENTARYZACJI,
    mapuj: (w) => mapujInwentaryzacje(w, numery),
    podsumowanie: (w) => {
      const rozne = w.filter(
        (x) => Number(poNumerze.get(x.numer_katalogowy)?.stan) !== x.stan_faktyczny,
      ).length;
      return `${w.length} części: ${rozne} z różnicą, ${w.length - rozne} bez zmian.`;
    },
    pozycja: (w) => {
      const przed = Number(poNumerze.get(w.numer_katalogowy)?.stan ?? 0);
      return {
        klucz: w.numer_katalogowy,
        tekst:
          przed === w.stan_faktyczny
            ? `= ${w.numer_katalogowy}: ${ilosc(w.numer_katalogowy, przed)}`
            : `≠ ${w.numer_katalogowy}: ${ilosc(w.numer_katalogowy, przed)} → ${ilosc(
                w.numer_katalogowy,
                w.stan_faktyczny,
              )}`,
      };
    },
    etykietaPrzycisku: (n) => `Zapisz inwentaryzację (${n})`,
    importuj: async (w) => {
      const { zmienione, bez_zmian } = await importujInwentaryzacje(w);
      await odswiez();
      return `Inwentaryzacja: ${zmienione} korekt, ${bez_zmian} bez zmian`;
    },
  };

  const dostawa: KonfiguracjaImportu<WierszDostawy> = {
    tytul: "Dostawa z pliku",
    opis: "Pozycje dostawy według wzoru (np. z faktury lub WZ). Każda pozycja to przyjęcie z numerem dokumentu. Zapis wszystkiego albo nic.",
    adresWzoru: ADRES_WZORU_DOSTAWY,
    mapuj: (w) => mapujDostawe(w, numery),
    podsumowanie: (w) => `${w.length} pozycji dostawy.`,
    pozycja: (w, i) => ({
      klucz: `${i}`,
      tekst: `+ ${w.numer_katalogowy} — ${poNumerze.get(w.numer_katalogowy)?.nazwa ?? ""}: ${ilosc(
        w.numer_katalogowy,
        w.ilosc,
      )}${w.dokument ? ` (${w.dokument})` : ""}`,
    }),
    etykietaPrzycisku: (n) => `Przyjmij dostawę (${n} poz.)`,
    importuj: async (w) => {
      const { pozycje } = await importujDostawe(w);
      await odswiez();
      return `Przyjęto dostawę: ${pozycje} pozycji`;
    },
  };

  const przelacznik = (
    <PrzelacznikOpcji<Rodzaj>
      etykieta="Rodzaj importu"
      wartosc={rodzaj}
      onZmiana={setRodzaj}
      opcje={[
        { wartosc: "katalog", etykieta: "Katalog" },
        { wartosc: "inwentaryzacja", etykieta: "Inwentaryzacja" },
        { wartosc: "dostawa", etykieta: "Dostawa" },
      ]}
    />
  );
  const wspolne = { otwarte, onZmiana, nadWyborem: przelacznik };

  if (rodzaj === "inwentaryzacja")
    return <ImportZPlikuSheet {...wspolne} konfiguracja={inwentaryzacja} />;
  if (rodzaj === "dostawa") return <ImportZPlikuSheet {...wspolne} konfiguracja={dostawa} />;
  return <ImportZPlikuSheet {...wspolne} konfiguracja={katalog} />;
}
