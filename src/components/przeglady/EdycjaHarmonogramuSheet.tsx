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
import { zapiszHarmonogram, type PrzegladZUrzadzeniem } from "@/lib/przeglady-zapytania";

type Props = {
  przeglad: PrzegladZUrzadzeniem;
  otwarte: boolean;
  onZmiana: (otwarte: boolean) => void;
};

export function EdycjaHarmonogramuSheet({ przeglad, otwarte, onZmiana }: Props) {
  const qc = useQueryClient();
  const [typ, setTyp] = useState("");
  const [czestotliwosc, setCzestotliwosc] = useState("");
  const [termin, setTermin] = useState("");
  const [wykonawca, setWykonawca] = useState("");
  const [uwagi, setUwagi] = useState("");
  const [zapis, setZapis] = useState(false);

  useEffect(() => {
    if (!otwarte) return;
    setTyp(przeglad.typ_czynnosci ?? "");
    setCzestotliwosc(przeglad.czestotliwosc_dni?.toString() ?? "");
    setTermin(przeglad.data_najblizszego ?? "");
    setWykonawca(przeglad.wykonawca ?? "");
    setUwagi(przeglad.uwagi ?? "");
  }, [otwarte, przeglad]);

  async function zapisz(e: React.FormEvent) {
    e.preventDefault();
    const dni = czestotliwosc === "" ? null : Number(czestotliwosc);
    if (dni !== null && (!Number.isInteger(dni) || dni < 1 || dni > 3650)) {
      return void toast.error("Częstotliwość: liczba dni od 1 do 3650.");
    }
    setZapis(true);
    try {
      await zapiszHarmonogram(przeglad.id, {
        typ_czynnosci: typ.trim() || null,
        czestotliwosc_dni: dni,
        data_najblizszego: termin || null,
        wykonawca: wykonawca.trim() || null,
        uwagi: uwagi.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ["przeglady"] });
      toast.success("Zapisano harmonogram");
      onZmiana(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać harmonogramu.");
    } finally {
      setZapis(false);
    }
  }

  return (
    <Sheet open={otwarte} onOpenChange={onZmiana}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edytuj harmonogram</SheetTitle>
          <SheetDescription>{przeglad.nr_technologiczny}</SheetDescription>
        </SheetHeader>
        <form onSubmit={zapisz} className="space-y-4 px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="typ" className="text-base">
              Typ czynności
            </Label>
            <Input
              id="typ"
              value={typ}
              maxLength={200}
              onChange={(e) => setTyp(e.target.value)}
              className="h-14 text-base"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="czestotliwosc" className="text-base">
                Co ile dni
              </Label>
              <Input
                id="czestotliwosc"
                type="number"
                inputMode="numeric"
                min={1}
                max={3650}
                value={czestotliwosc}
                onChange={(e) => setCzestotliwosc(e.target.value)}
                className="h-14 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="termin" className="text-base">
                Najbliższy termin
              </Label>
              <Input
                id="termin"
                type="date"
                value={termin}
                onChange={(e) => setTermin(e.target.value)}
                className="h-14 text-base"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wykonawca-plan" className="text-base">
              Wykonawca
            </Label>
            <Input
              id="wykonawca-plan"
              value={wykonawca}
              maxLength={200}
              onChange={(e) => setWykonawca(e.target.value)}
              className="h-14 text-base"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="uwagi-plan" className="text-base">
              Uwagi
            </Label>
            <Textarea
              id="uwagi-plan"
              rows={3}
              maxLength={4000}
              value={uwagi}
              onChange={(e) => setUwagi(e.target.value)}
              className="text-base"
            />
          </div>
          <Button type="submit" disabled={zapis} className="h-16 w-full text-lg font-bold">
            {zapis ? "Zapisywanie..." : "Zapisz harmonogram"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
