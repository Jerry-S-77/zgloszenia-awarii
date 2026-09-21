import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { ETYKIETY_ROL, ROLE, type Rola } from "@/lib/uprawnienia";
import { nowyUzytkownikSchema } from "@/lib/uzytkownicy.schemas";
import { utworzKontoFn } from "@/lib/uzytkownicy.functions";
import type { DaneHasla } from "./HasloTymczasoweDialog";

type Props = {
  otwarte: boolean;
  onZmiana: (otwarte: boolean) => void;
  onUtworzono: (dane: DaneHasla) => void;
};

export function NoweKontoSheet({ otwarte, onZmiana, onUtworzono }: Props) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [imieNazwisko, setImieNazwisko] = useState("");
  const [rola, setRola] = useState<Rola>("pracownik");
  const [pracuje, setPracuje] = useState(false);

  async function utworz(e: React.FormEvent) {
    e.preventDefault();
    const parsed = nowyUzytkownikSchema.safeParse({ email, imieNazwisko, rola });
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Sprawdź dane.");
    setPracuje(true);
    try {
      const wynik = await utworzKontoFn({ data: parsed.data });
      if (!wynik.ok) return void toast.error(wynik.komunikat);
      onUtworzono({ email: wynik.dane.email, haslo: wynik.dane.hasloTymczasowe });
      onZmiana(false);
      setEmail("");
      setImieNazwisko("");
      setRola("pracownik");
      await qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch {
      toast.error("Nie udało się utworzyć konta. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setPracuje(false);
    }
  }

  return (
    <Sheet open={otwarte} onOpenChange={onZmiana}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nowe konto</SheetTitle>
          <SheetDescription>
            Aplikacja wygeneruje hasło tymczasowe i pokaże je raz.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={utworz} className="space-y-4 px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="nowy-email" className="text-base">
              E-mail (login)
            </Label>
            <Input
              id="nowy-email"
              type="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-14 text-base"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nowy-imie" className="text-base">
              Imię i nazwisko
            </Label>
            <Input
              id="nowy-imie"
              required
              value={imieNazwisko}
              onChange={(e) => setImieNazwisko(e.target.value)}
              className="h-14 text-base"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-base">Rola</Label>
            <div className="grid grid-cols-2 gap-2">
              {ROLE.map((r) => (
                <Button
                  key={r}
                  type="button"
                  aria-pressed={rola === r}
                  variant={rola === r ? "default" : "outline"}
                  className="h-14 text-base"
                  onClick={() => setRola(r)}
                >
                  {ETYKIETY_ROL[r]}
                </Button>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={pracuje} className="h-16 w-full text-lg font-bold">
            {pracuje ? "Tworzenie..." : "Utwórz konto"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
