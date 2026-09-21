import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type DaneHasla = { email: string; haslo: string };

export function HasloTymczasoweDialog({
  dane,
  onZamknij,
}: {
  dane: DaneHasla | null;
  onZamknij: () => void;
}) {
  async function kopiuj() {
    if (!dane) return;
    try {
      await navigator.clipboard.writeText(dane.haslo);
      toast.success("Hasło skopiowane.");
    } catch {
      toast.error("Nie udało się skopiować. Zaznacz hasło i skopiuj ręcznie.");
    }
  }

  return (
    <Dialog open={dane !== null} onOpenChange={(otwarte) => !otwarte && onZamknij()}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Hasło tymczasowe</DialogTitle>
          <DialogDescription>
            Konto: {dane?.email}. Hasło jest pokazane tylko raz. Przekaż je osobie. Przy pierwszym
            logowaniu system wymusi ustawienie własnego hasła.
          </DialogDescription>
        </DialogHeader>
        <p
          data-testid="haslo-tymczasowe"
          className="select-all rounded-xl bg-foreground p-4 text-center font-mono text-2xl tracking-widest text-background"
        >
          {dane?.haslo}
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-12" onClick={() => void kopiuj()}>
            Skopiuj hasło
          </Button>
          <Button className="h-12" onClick={onZamknij}>
            Zamknij
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
