import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOnline } from "@/hooks/use-online";
import { dodajCzesc } from "@/lib/czesci";
import {
  czesciMagazynuUrzadzeniaQuery,
  formatujIlosc,
  magazynQuery,
  pobierzDoAwarii,
} from "@/lib/magazyn";

/**
 * Część z katalogu magazynu: gdy jest na stanie — „Pobierz z magazynu” (zdejmuje ze stanu i wpisuje część jako
 * dostarczoną), gdy brakuje — „Zamów” (część przy awarii jako potrzebna, powiązana z pozycją magazynu).
 * Części przypisane do urządzenia są na górze listy.
 */
export function PobierzZMagazynu({
  awariaId,
  nr,
  onGotowe,
  onAnuluj,
}: {
  awariaId: string;
  nr: string;
  onGotowe: () => Promise<unknown>;
  onAnuluj: () => void;
}) {
  const online = useOnline();
  const { data: katalog = [], isError } = useQuery(magazynQuery);
  const { data: urzadzenia = [] } = useQuery(czesciMagazynuUrzadzeniaQuery(nr));
  const [czescId, setCzescId] = useState("");
  const [ilosc, setIlosc] = useState("1");
  const [zapis, setZapis] = useState(false);

  const { tegoUrzadzenia, pozostale } = useMemo(() => {
    const aktywne = katalog.filter((c) => c.aktywna);
    const przypisane = new Set(urzadzenia.map((u) => u.magazyn_czesci.id));
    return {
      tegoUrzadzenia: aktywne.filter((c) => przypisane.has(c.id)),
      pozostale: aktywne.filter((c) => !przypisane.has(c.id)),
    };
  }, [katalog, urzadzenia]);

  const wybrana = katalog.find((c) => c.id === czescId);
  const liczba = Number(ilosc);
  const poprawnaIlosc = Number.isInteger(liczba) && liczba >= 1 && liczba <= 9999;
  const naStanie = wybrana ? wybrana.stan >= liczba : false;

  async function wykonaj(dzialanie: () => Promise<void>, sukces: string) {
    if (!wybrana) return void toast.error("Wybierz część z magazynu.");
    if (!poprawnaIlosc) return void toast.error("Ilość: liczba całkowita od 1 do 9999.");
    setZapis(true);
    try {
      await dzialanie();
      await onGotowe();
      toast.success(sukces);
      onAnuluj();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać.");
    } finally {
      setZapis(false);
    }
  }

  const opcja = (c: (typeof katalog)[number]) => (
    <option key={c.id} value={c.id}>
      {c.nazwa} ({c.numer_katalogowy}) — {formatujIlosc(c.stan, c.jednostka)}
    </option>
  );

  if (isError) {
    return <p className="text-sm text-muted-foreground">Magazyn jest widoczny po połączeniu.</p>;
  }

  return (
    <div className="space-y-3 rounded-xl bg-muted p-3">
      <div className="space-y-1">
        <Label htmlFor={`magazyn-czesc-${awariaId}`}>Część z magazynu</Label>
        <select
          id={`magazyn-czesc-${awariaId}`}
          value={czescId}
          onChange={(e) => setCzescId(e.target.value)}
          className="h-12 w-full rounded-md border border-input bg-card px-3 text-base"
        >
          <option value="">— wybierz —</option>
          {tegoUrzadzenia.length > 0 && (
            <optgroup label={`Części urządzenia ${nr}`}>{tegoUrzadzenia.map(opcja)}</optgroup>
          )}
          {pozostale.length > 0 && <optgroup label="Pozostałe">{pozostale.map(opcja)}</optgroup>}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`magazyn-ilosc-${awariaId}`}>Ilość</Label>
        <Input
          id={`magazyn-ilosc-${awariaId}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={9999}
          value={ilosc}
          onChange={(e) => setIlosc(e.target.value)}
          className="h-12 bg-card text-base"
        />
      </div>
      {wybrana && poprawnaIlosc && !naStanie && (
        <p className="text-sm text-destructive">
          Na stanie tylko {formatujIlosc(wybrana.stan, wybrana.jednostka)} — możesz zamówić część
          dla tej awarii.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="h-12" onClick={onAnuluj}>
          Anuluj
        </Button>
        {naStanie || !wybrana ? (
          <Button
            type="button"
            className="h-12 font-bold"
            disabled={zapis || !online || !wybrana}
            onClick={() =>
              void wykonaj(
                () => pobierzDoAwarii(wybrana!.id, awariaId, liczba),
                "Pobrano część z magazynu",
              )
            }
          >
            {zapis ? "Zapisywanie..." : "Pobierz z magazynu"}
          </Button>
        ) : (
          <Button
            type="button"
            className="h-12 font-bold"
            disabled={zapis || !online}
            onClick={() =>
              void wykonaj(
                () =>
                  dodajCzesc({
                    awariaId,
                    nazwa: `${wybrana.nazwa} (${wybrana.numer_katalogowy})`,
                    ilosc: liczba,
                    terminDostawy: null,
                    magazynCzescId: wybrana.id,
                  }),
                "Dodano część do zamówienia",
              )
            }
          >
            {zapis ? "Zapisywanie..." : "Zamów"}
          </Button>
        )}
      </div>
    </div>
  );
}
