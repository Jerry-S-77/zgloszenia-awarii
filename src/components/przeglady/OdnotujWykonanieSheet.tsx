import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { dzisLokalnie, formatujDate, nastepnyTermin } from "@/lib/przeglady";
import { odnotujWykonanie, type PrzegladZUrzadzeniem } from "@/lib/przeglady-zapytania";

type Props = {
  przeglad: PrzegladZUrzadzeniem;
  otwarte: boolean;
  onZmiana: (otwarte: boolean) => void;
};

export function OdnotujWykonanieSheet({ przeglad, otwarte, onZmiana }: Props) {
  const qc = useQueryClient();
  const dzis = dzisLokalnie();
  const [data, setData] = useState(dzis);
  const [wykonawca, setWykonawca] = useState(przeglad.wykonawca ?? "");
  const [uwagi, setUwagi] = useState("");
  const [zapis, setZapis] = useState(false);

  useEffect(() => {
    if (otwarte) {
      setData(dzisLokalnie());
      setWykonawca(przeglad.wykonawca ?? "");
      setUwagi("");
    }
  }, [otwarte, przeglad.wykonawca]);

  const nastepny = data ? nastepnyTermin(data, przeglad.czestotliwosc_dni) : null;

  async function zapisz(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return void toast.error("Podaj datę wykonania.");
    if (data > dzis) return void toast.error("Data wykonania nie może być w przyszłości.");
    setZapis(true);
    try {
      await odnotujWykonanie({
        przegladId: przeglad.id,
        dataWykonania: data,
        wykonawca: wykonawca.trim() || null,
        uwagi: uwagi.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ["przeglady"] });
      toast.success("Odnotowano wykonanie przeglądu");
      onZmiana(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać wykonania.");
    } finally {
      setZapis(false);
    }
  }

  return (
    <Sheet open={otwarte} onOpenChange={onZmiana}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Odnotuj wykonanie</SheetTitle>
          <SheetDescription>
            {przeglad.nr_technologiczny} · {przeglad.typ_czynnosci ?? "przegląd"}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={zapisz} className="space-y-4 px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="data-wykonania" className="text-base">
              Data wykonania
            </Label>
            <Input
              id="data-wykonania"
              type="date"
              max={dzis}
              required
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="h-14 text-base"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wykonawca" className="text-base">
              Wykonawca
            </Label>
            <Input
              id="wykonawca"
              value={wykonawca}
              maxLength={200}
              onChange={(e) => setWykonawca(e.target.value)}
              className="h-14 text-base"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="uwagi-wykonania" className="text-base">
              Uwagi
            </Label>
            <Textarea
              id="uwagi-wykonania"
              rows={3}
              maxLength={2000}
              placeholder="Opcjonalnie"
              value={uwagi}
              onChange={(e) => setUwagi(e.target.value)}
              className="text-base"
            />
          </div>
          <div className="rounded-xl border border-success bg-success/10 p-3 text-sm">
            {nastepny ? (
              <>
                <b>Następny termin: {formatujDate(nastepny)}</b>
                <br />
                Data wykonania + {przeglad.czestotliwosc_dni} dni. Wyliczone automatycznie.
              </>
            ) : (
              <>Brak częstotliwości — następny termin ustali kierownik w harmonogramie.</>
            )}
          </div>
          <Button type="submit" disabled={zapis} className="h-16 w-full text-lg font-bold">
            {zapis ? "Zapisywanie..." : "Zapisz"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
