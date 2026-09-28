import { useRef, useState, type ReactNode } from "react";
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
import { BladPliku, parsujCsv, type Komorka, type WynikImportu } from "@/lib/import-plik";

/** Wczytuje CSV albo XLSX (pierwszy arkusz) do tablicy wierszy. */
async function wczytajPlik(plik: File): Promise<Komorka[][]> {
  if (/\.xlsx$/i.test(plik.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    return (await readSheet(plik)) as Komorka[][];
  }
  return parsujCsv(await plik.text());
}

export type KonfiguracjaImportu<T> = {
  tytul: string;
  opis: string;
  adresWzoru: string;
  mapuj: (wiersze: Komorka[][]) => WynikImportu<T>;
  /** Jedno zdanie nad listą, np. „2 części: 2 nowych, 0 do aktualizacji.” */
  podsumowanie: (wiersze: T[]) => string;
  pozycja: (w: T, i: number) => { klucz: string; tekst: string };
  etykietaPrzycisku: (liczba: number) => string;
  /** Zapis; zwraca komunikat sukcesu. Błąd (np. „Wiersz 3: …” z bazy) pokazuje się jako toast. */
  importuj: (wiersze: T[]) => Promise<string>;
};

/**
 * Wspólny arkusz importu z pliku: wzór do pobrania, wybór pliku CSV/XLSX, podgląd z błędami i zapis
 * całości jednym wywołaniem bazy. `nadWyborem` pozwala dodać np. przełącznik rodzaju importu.
 */
export function ImportZPlikuSheet<T>({
  otwarte,
  onZmiana,
  konfiguracja: k,
  nadWyborem,
}: {
  otwarte: boolean;
  onZmiana: (o: boolean) => void;
  konfiguracja: KonfiguracjaImportu<T>;
  nadWyborem?: ReactNode;
}) {
  const online = useOnline();
  const pole = useRef<HTMLInputElement>(null);
  const [nazwaPliku, setNazwaPliku] = useState("");
  // Podgląd pamięta rodzaj importu (wzór), dla którego powstał, i jest pokazywany tylko przy tym samym
  // rodzaju — po przełączeniu (np. Katalog → Dostawa) plik jednego rodzaju nie trafi do innego importu.
  const [odczytany, setOdczytany] = useState<{ adres: string; wynik: WynikImportu<T> } | null>(
    null,
  );
  const wynik = odczytany?.adres === k.adresWzoru ? odczytany.wynik : null;
  const wyczysc = () => setOdczytany(null);
  const [zapis, setZapis] = useState(false);

  // Numer bieżącego odczytu: odczyt rozpoczęty przed wyborem kolejnego pliku albo przed zamknięciem
  // arkusza jest odrzucany.
  const odczyt = useRef(0);

  async function wybrano(e: React.ChangeEvent<HTMLInputElement>) {
    const plik = e.target.files?.[0];
    e.target.value = "";
    if (!plik) return;
    const moj = ++odczyt.current;
    const adres = k.adresWzoru;
    setNazwaPliku(plik.name);
    wyczysc();
    let nowy: WynikImportu<T>;
    try {
      nowy = k.mapuj(await wczytajPlik(plik));
    } catch (blad) {
      nowy = {
        wiersze: [],
        bledy: [
          blad instanceof BladPliku
            ? blad.message
            : "Nie udało się odczytać pliku. Użyj CSV albo XLSX z wzoru.",
        ],
      };
    }
    if (moj === odczyt.current) setOdczytany({ adres, wynik: nowy });
  }

  async function importuj() {
    if (!wynik || wynik.bledy.length || wynik.wiersze.length === 0) return;
    setZapis(true);
    try {
      toast.success(await k.importuj(wynik.wiersze));
      wyczysc();
      onZmiana(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import nie powiódł się.");
    } finally {
      setZapis(false);
    }
  }

  return (
    <Sheet
      open={otwarte}
      onOpenChange={(o) => {
        if (!o) {
          odczyt.current += 1;
          wyczysc();
        }
        onZmiana(o);
      }}
    >
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{k.tytul}</SheetTitle>
          <SheetDescription>{k.opis}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {nadWyborem}
          <Button asChild variant="outline" className="h-12 w-full">
            <a href={k.adresWzoru} download>
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
              ) : wynik.wiersze.length === 0 ? (
                <p>Plik nie ma wierszy z danymi.</p>
              ) : (
                <>
                  <p>{k.podsumowanie(wynik.wiersze)}</p>
                  <ul className="max-h-48 overflow-y-auto">
                    {wynik.wiersze.slice(0, 50).map((w, i) => {
                      const { klucz, tekst } = k.pozycja(w, i);
                      return <li key={klucz}>{tekst}</li>;
                    })}
                  </ul>
                  <Button
                    className="h-12 w-full font-bold"
                    disabled={zapis || !online}
                    onClick={() => void importuj()}
                  >
                    {zapis ? "Importowanie..." : k.etykietaPrzycisku(wynik.wiersze.length)}
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
