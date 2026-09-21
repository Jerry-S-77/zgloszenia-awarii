import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ProfilListy } from "@/lib/queries";
import { ETYKIETY_ROL, ROLE, type Rola } from "@/lib/uprawnienia";
import { resetujHasloFn, zmienRoleLubStatusFn } from "@/lib/uzytkownicy.functions";
import type { DaneHasla } from "./HasloTymczasoweDialog";

type Props = {
  profil: ProfilListy | null;
  wlasneId: string;
  onZamknij: () => void;
  onHaslo: (dane: DaneHasla) => void;
};

export function EdycjaUzytkownikaSheet({ profil, wlasneId, onZamknij, onHaslo }: Props) {
  const qc = useQueryClient();
  const [pracuje, setPracuje] = useState(false);
  const wlasne = profil?.id === wlasneId;

  async function wykonaj(praca: () => Promise<void>) {
    setPracuje(true);
    try {
      await praca();
      await qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch {
      toast.error("Operacja nie powiodła się. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setPracuje(false);
    }
  }

  const zmienRole = (rola: Rola) =>
    wykonaj(async () => {
      if (!profil) return;
      const wynik = await zmienRoleLubStatusFn({ data: { userId: profil.id, rola } });
      if (!wynik.ok) return void toast.error(wynik.komunikat);
      toast.success(`Rola zmieniona na: ${ETYKIETY_ROL[rola]}.`);
      onZamknij();
    });

  const zmienStatus = (status: "aktywny" | "zablokowany") =>
    wykonaj(async () => {
      if (!profil) return;
      const wynik = await zmienRoleLubStatusFn({ data: { userId: profil.id, status } });
      if (!wynik.ok) return void toast.error(wynik.komunikat);
      toast.success(status === "zablokowany" ? "Konto zablokowane." : "Konto odblokowane.");
      onZamknij();
    });

  const resetuj = () =>
    wykonaj(async () => {
      if (!profil) return;
      const wynik = await resetujHasloFn({ data: { userId: profil.id } });
      if (!wynik.ok) return void toast.error(wynik.komunikat);
      onZamknij();
      onHaslo({ email: profil.email, haslo: wynik.dane.hasloTymczasowe });
    });

  return (
    <Sheet open={profil !== null} onOpenChange={(otwarte) => !otwarte && onZamknij()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{profil?.imie_nazwisko}</SheetTitle>
          <SheetDescription>{profil?.email}</SheetDescription>
        </SheetHeader>
        {profil && (
          <div className="space-y-5 px-4 pb-6">
            {wlasne && (
              <p className="rounded-xl bg-accent p-3 text-sm text-accent-foreground">
                To Twoje konto. Roli ani statusu nie zmieniasz tutaj, żeby nie odciąć sobie dostępu.
              </p>
            )}
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Rola
              </p>
              <div className="grid grid-cols-2 gap-2">
                {ROLE.map((r) => (
                  <Button
                    key={r}
                    type="button"
                    disabled={pracuje || wlasne || profil.rola === r}
                    variant={profil.rola === r ? "default" : "outline"}
                    className="h-14 text-base"
                    onClick={() => void zmienRole(r)}
                  >
                    {ETYKIETY_ROL[r]}
                  </Button>
                ))}
              </div>
            </div>

            {profil.status === "aktywny" ? (
              <Button
                variant="destructive"
                disabled={pracuje || wlasne}
                className="h-14 w-full text-base"
                onClick={() => void zmienStatus("zablokowany")}
              >
                Zablokuj konto
              </Button>
            ) : (
              <Button
                disabled={pracuje}
                className="h-14 w-full text-base"
                onClick={() => void zmienStatus("aktywny")}
              >
                Odblokuj konto
              </Button>
            )}

            <div className="space-y-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={pracuje || wlasne}
                    className="h-14 w-full text-base"
                  >
                    Resetuj hasło
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Zresetować hasło?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Użytkownik dostanie nowe hasło tymczasowe, a dotychczasowe przestanie działać.
                      Przy najbliższym logowaniu będzie musiał ustawić własne.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Anuluj</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void resetuj()}>Resetuj</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {wlasne && (
                <p className="text-sm text-muted-foreground">Własne hasło zmienisz w menu konta.</p>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
