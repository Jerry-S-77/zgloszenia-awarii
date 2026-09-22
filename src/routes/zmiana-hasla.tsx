import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EkranAuth } from "@/components/EkranAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { noweHasloSchema } from "@/lib/haslo";
import { zmienWlasneHasloFn } from "@/lib/uzytkownicy.functions";

export const Route = createFileRoute("/zmiana-hasla")({
  head: () => ({ meta: [{ title: "Zmiana hasła — Ewidencja awarii urządzeń" }] }),
  component: ZmianaHasla,
});

function ZmianaHasla() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [aktualne, setAktualne] = useState("");
  const [nowe, setNowe] = useState("");
  const [powtorz, setPowtorz] = useState("");
  const [zapisuje, setZapisuje] = useState(false);

  useEffect(() => {
    if (auth.stan === "brak") void navigate({ to: "/logowanie" });
  }, [auth.stan, navigate]);

  if (auth.stan !== "zalogowany") return null;
  const wymuszona = auth.profil.must_change_password;

  async function zapisz(e: React.FormEvent) {
    e.preventDefault();
    const parsed = noweHasloSchema.safeParse(nowe);
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Nieprawidłowe hasło.");
    if (nowe !== powtorz) return void toast.error("Hasła nie są takie same.");
    setZapisuje(true);
    try {
      // Aktualne hasło wysyłamy tylko przy dobrowolnej zmianie; przy wymuszonej serwer go nie wymaga.
      const wynik = await zmienWlasneHasloFn({
        data: wymuszona ? { noweHaslo: nowe } : { noweHaslo: nowe, aktualneHaslo: aktualne },
      });
      if (!wynik.ok) return void toast.error(wynik.komunikat);
      await auth.odswiezProfil();
      toast.success("Hasło zostało zmienione.");
      void navigate({ to: "/" });
    } catch {
      toast.error("Nie udało się zmienić hasła. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setZapisuje(false);
    }
  }

  return (
    <EkranAuth
      tytul="Zmiana hasła"
      podtytul={
        wymuszona
          ? "To Twoje pierwsze logowanie (lub hasło zostało zresetowane). Ustaw własne hasło, żeby korzystać z aplikacji."
          : "Ustaw nowe hasło."
      }
    >
      <form onSubmit={zapisz} className="space-y-5">
        {!wymuszona && (
          <div className="space-y-2">
            <Label htmlFor="aktualne" className="text-base">
              Aktualne hasło
            </Label>
            <Input
              id="aktualne"
              type="password"
              autoComplete="current-password"
              required
              value={aktualne}
              onChange={(e) => setAktualne(e.target.value)}
              className="h-14 text-base"
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="nowe" className="text-base">
            Nowe hasło (min. 12 znaków)
          </Label>
          <Input
            id="nowe"
            type="password"
            autoComplete="new-password"
            required
            value={nowe}
            onChange={(e) => setNowe(e.target.value)}
            className="h-14 text-base"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="powtorz" className="text-base">
            Powtórz hasło
          </Label>
          <Input
            id="powtorz"
            type="password"
            autoComplete="new-password"
            required
            value={powtorz}
            onChange={(e) => setPowtorz(e.target.value)}
            className="h-14 text-base"
          />
        </div>
        <Button type="submit" disabled={zapisuje} className="h-16 w-full text-lg font-bold">
          {zapisuje ? "Zapisywanie..." : "Zapisz hasło"}
        </Button>
        {!wymuszona && (
          <Button
            type="button"
            variant="outline"
            className="h-14 w-full text-base"
            onClick={() => void navigate({ to: "/" })}
          >
            Anuluj
          </Button>
        )}
      </form>
    </EkranAuth>
  );
}
