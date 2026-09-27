import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useOnline } from "@/hooks/use-online";
import { importujMagazyn } from "@/lib/magazyn";
import { mapujWiersze, parsujCsv, type WynikParsowania } from "@/lib/magazyn-import";

export const ADRES_WZORU = "/wzory/wzor-importu-magazynu.csv";

/** Wczytuje CSV albo XLSX (pierwszy arkusz) do tablicy wierszy. */
async function wczytajPlik(plik: File): Promise<(string | number | boolean | null)[][]> {
  if (/\.xlsx$/i.test(plik.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    return (await readSheet(plik)) as (string | number | boolean | null)[][];
  }
  return parsujCsv(await plik.text());
}

export function ImportMagazynuSheet({
  otwarte,
  onZmiana,
  istniejaceNumery,
}: {
  otwarte: boolean;
  onZmiana: (o: boolean) => void;
  istniejaceNumery: Set<string>;
}) {
  const qc = useQueryClient();
  const online = useOnline();
  const pole = useRef<HTMLInputElement>(null);
  const [nazwaPliku, setNazwaPliku] = useState("");
  const [wynik, setWynik] = useState<WynikParsowania | null>(null);
  const [zapis, setZapis] = useState(false);

  async function wybrano(e: React.ChangeEvent<HTMLInputElement>) {
    const plik = e.target.files?.[0];
    e.target.value = "";
    if (!plik) return;
    setNazwaPliku(plik.name);
    try {
      setWynik(mapujWiersze(await wczytajPlik(plik)));
    } catch {
      setWynik({
        wiersze: [],
        bledy: ["Nie udało się odczytać pliku. Użyj CSV albo XLSX z wzoru."],
      });
    }
  }

  async function importuj() {
    if (!wynik || wynik.bledy.length || wynik.wiersze.length === 0) return;
    setZapis(true);
    try {
      const { nowe, zmienione } = await importujMagazyn(wynik.wiersze);
      await qc.invalidateQueries({ queryKey: ["magazyn"] });
      toast.success(`Zaimportowano: ${nowe} nowych, ${zmienione} zaktualizowanych`);
      setWynik(null);
      onZmiana(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import nie powiódł się.");
    } finally {
      setZapis(false);
    }
  }

  const nowe = wynik?.wiersze.filter((w) => !istniejaceNumery.has(w.numer_katalogowy)).length ?? 0;
  const aktualizowane = (wynik?.wiersze.length ?? 0) - nowe;

  return (
    <Sheet
      open={otwarte}
      onOpenChange={(o) => {
        if (!o) setWynik(null);
        onZmiana(o);
      }}
    >
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Import części z pliku</SheetTitle>
          <SheetDescription>
            CSV lub XLSX według wzoru. Istniejące numery katalogowe są aktualizowane (bez zmiany
            stanu), nowe dostają stan początkowy. Import zapisuje wszystko albo nic.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          <Button asChild variant="outline" className="h-12 w-full">
            <a href={ADRES_WZORU} download>
              <Download className="size-5" /> Pobierz wzór pliku
            </a>
          </Button>
          <Button className="h-12 w-full" onClick={() => pole.current?.click()}>
            <FileUp className="size-5" /> Wybierz plik
          </Button>
          <input
            ref={pole}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            data-testid="plik-importu"
            onChange={(e) => void wybrano(e)}
          />
          {wynik && (
            <div className="space-y-2 rounded-xl bg-muted p-3 text-sm">
              <p className="font-semibold">{nazwaPliku}</p>
              {wynik.bledy.length > 0 ? (
                <>
                  <p className="font-semibold text-destructive">
                    Plik ma błędy — popraw je i wybierz plik ponownie:
                  </p>
                  <ul className="list-disc pl-5 text-destructive">
                    {wynik.bledy.slice(0, 20).map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p>
                    {wynik.wiersze.length} części: {nowe} nowych, {aktualizowane} do aktualizacji.
                  </p>
                  <ul className="max-h-48 overflow-y-auto">
                    {wynik.wiersze.slice(0, 50).map((w) => (
                      <li key={w.numer_katalogowy}>
                        {istniejaceNumery.has(w.numer_katalogowy) ? "↻" : "+"} {w.numer_katalogowy}{" "}
                        — {w.nazwa}
                        {w.urzadzenia.length ? ` (${w.urzadzenia.join(", ")})` : ""}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="h-12 w-full font-bold"
                    disabled={zapis || !online || wynik.wiersze.length === 0}
                    onClick={() => void importuj()}
                  >
                    {zapis ? "Importowanie..." : `Importuj ${wynik.wiersze.length} części`}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
