import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { dodajCzescMagazynu } from "@/lib/magazyn";

const PUSTE = { numer: "", nazwa: "", jednostka: "szt.", min: "0", lokalizacja: "" };

/** Nowa część w katalogu (stan 0 — towar przyjmuje się potem „Przyjęciem dostawy”). */
export function NowaCzescSheet({
  otwarte,
  onZmiana,
}: {
  otwarte: boolean;
  onZmiana: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [d, setD] = useState(PUSTE);
  const [zapis, setZapis] = useState(false);

  async function zapisz(e: React.FormEvent) {
    e.preventDefault();
    const min = Number(d.min.replace(",", "."));
    if (!d.numer.trim() || !d.nazwa.trim()) {
      return void toast.error("Podaj numer katalogowy i nazwę.");
    }
    if (!(min >= 0)) return void toast.error("Stan minimalny: 0 lub więcej.");
    setZapis(true);
    try {
      await dodajCzescMagazynu({
        numer_katalogowy: d.numer.trim(),
        nazwa: d.nazwa.trim(),
        jednostka: d.jednostka.trim() || "szt.",
        stan_minimalny: min,
        lokalizacja: d.lokalizacja.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ["magazyn"] });
      toast.success("Dodano część — przyjmij dostawę, żeby pojawiła się na stanie");
      setD(PUSTE);
      onZmiana(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się dodać części.");
    } finally {
      setZapis(false);
    }
  }

  const pole = (
    id: keyof typeof PUSTE,
    etykieta: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`nowa-${id}`}>{etykieta}</Label>
      <Input
        id={`nowa-${id}`}
        value={d[id]}
        onChange={(e) => setD({ ...d, [id]: e.target.value })}
        className="h-12 text-base"
        {...props}
      />
    </div>
  );

  return (
    <Sheet open={otwarte} onOpenChange={onZmiana}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nowa część w magazynie</SheetTitle>
          <SheetDescription>Stan początkowy wprowadzisz przyjęciem dostawy.</SheetDescription>
        </SheetHeader>
        <form onSubmit={zapisz} className="space-y-3 px-4 pb-6">
          {pole("numer", "Numer katalogowy", { maxLength: 100 })}
          {pole("nazwa", "Nazwa", { maxLength: 200 })}
          <div className="grid grid-cols-2 gap-2">
            {pole("jednostka", "Jednostka", { maxLength: 20 })}
            {pole("min", "Stan minimalny", { inputMode: "decimal" })}
          </div>
          {pole("lokalizacja", "Lokalizacja w magazynie", { maxLength: 200 })}
          <Button type="submit" disabled={zapis} className="h-14 w-full text-base font-bold">
            {zapis ? "Zapisywanie..." : "Dodaj część"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
