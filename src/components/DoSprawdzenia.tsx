import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getDoSprawdzenia, odrzucOperacjeDoSprawdzenia, type QueueOp } from "@/lib/offline";

export function DoSprawdzenia() {
  const [otwarte, setOtwarte] = useState(false);
  const [operacje, setOperacje] = useState<QueueOp[]>([]);

  useEffect(() => {
    let anulowane = false;
    const odswiez = async () => {
      const lista = await getDoSprawdzenia();
      if (!anulowane) setOperacje(lista);
    };
    void odswiez();
    window.addEventListener("queue-changed", odswiez);
    return () => {
      anulowane = true;
      window.removeEventListener("queue-changed", odswiez);
    };
  }, []);

  if (operacje.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOtwarte(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 text-xs font-bold text-destructive-foreground"
      >
        <AlertTriangle className="size-4 shrink-0" /> {operacje.length} do sprawdzenia
      </button>
      <Sheet open={otwarte} onOpenChange={setOtwarte}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Do sprawdzenia</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {operacje.map((op) => (
              <div key={op.opId} className="rounded-2xl border border-destructive/50 bg-card p-3">
                <p className="text-sm font-semibold">
                  {op.type === "insert" ? "Zgłoszenie" : `Zmiana zgłoszenia`}
                  {op.type === "update" ? ` ${op.payload.id.slice(0, 8)}` : ""}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {op.powod ?? "Zapis został odrzucony."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void odrzucOperacjeDoSprawdzenia(op.opId)}
                >
                  <X className="size-4" /> Odrzuć
                </Button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
