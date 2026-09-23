import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { profileQuery } from "@/lib/queries";
import type { Urzadzenie } from "@/lib/types";
import {
  akcjeStatusu,
  ETYKIETY_STATUSU_URZADZENIA,
  KRYTYCZNOSCI,
  urzadzenieSchema,
  type StatusUrzadzenia,
} from "@/lib/urzadzenia";
import {
  dodajUrzadzenie,
  zapiszUrzadzenie,
  zmienStatusUrzadzenia,
} from "@/lib/urzadzenia-zapytania";

const BRAK = "__brak__";

type Props = {
  /** null = nowe urządzenie. */
  urzadzenie: Urzadzenie | null;
  otwarte: boolean;
  onZmiana: (otwarte: boolean) => void;
};

export function UrzadzenieSheet({ urzadzenie, otwarte, onZmiana }: Props) {
  const qc = useQueryClient();
  const { data: profile = [] } = useQuery({ ...profileQuery, enabled: otwarte });
  const aktywneKonta = profile.filter((p) => p.status === "aktywny");
  const [nr, setNr] = useState("");
  const [nazwa, setNazwa] = useState("");
  const [kategoria, setKategoria] = useState("");
  const [lokalizacja, setLokalizacja] = useState("");
  const [krytycznosc, setKrytycznosc] = useState<string>("Srednia");
  const [wlasciciel, setWlasciciel] = useState(BRAK);
  const [uwagi, setUwagi] = useState("");
  const [zapis, setZapis] = useState(false);

  useEffect(() => {
    if (!otwarte) return;
    setNr(urzadzenie?.nr_technologiczny ?? "");
    setNazwa(urzadzenie?.nazwa_urzadzenia ?? "");
    setKategoria(urzadzenie?.kategoria ?? "");
    setLokalizacja(urzadzenie?.lokalizacja ?? "");
    setKrytycznosc(urzadzenie?.krytycznosc ?? "Srednia");
    setWlasciciel(urzadzenie?.wlasciciel_id ?? BRAK);
    setUwagi(urzadzenie?.uwagi ?? "");
  }, [otwarte, urzadzenie]);

  async function odswiez() {
    await qc.invalidateQueries({ queryKey: ["urzadzenia"] });
    await qc.invalidateQueries({ queryKey: ["przeglady"] });
  }

  async function zapisz(e: React.FormEvent) {
    e.preventDefault();
    const parsed = urzadzenieSchema.safeParse({
      nr_technologiczny: nr,
      nazwa_urzadzenia: nazwa,
      kategoria,
      lokalizacja,
      krytycznosc,
      wlasciciel_id: wlasciciel === BRAK ? null : wlasciciel,
      uwagi,
    });
    if (!parsed.success)
      return void toast.error(parsed.error.issues[0]?.message ?? "Sprawdź dane.");
    setZapis(true);
    try {
      if (urzadzenie) {
        const { nr_technologiczny: _pominiety, ...zmiany } = parsed.data;
        await zapiszUrzadzenie(
          urzadzenie.nr_technologiczny,
          zmiany,
          urzadzenie.wlasciciel_id !== null && zmiany.wlasciciel_id === null,
        );
        toast.success("Zapisano urządzenie");
      } else {
        await dodajUrzadzenie(parsed.data);
        toast.success("Dodano urządzenie (status: Proponowane)");
      }
      await odswiez();
      onZmiana(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać urządzenia.");
    } finally {
      setZapis(false);
    }
  }

  async function zmienStatus(na: StatusUrzadzenia) {
    if (!urzadzenie) return;
    setZapis(true);
    try {
      await zmienStatusUrzadzenia(urzadzenie.nr_technologiczny, na);
      toast.success(`Status: ${ETYKIETY_STATUSU_URZADZENIA[na]}`);
      await odswiez();
      onZmiana(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zmienić statusu.");
    } finally {
      setZapis(false);
    }
  }

  return (
    <Sheet open={otwarte} onOpenChange={onZmiana}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{urzadzenie ? urzadzenie.nr_technologiczny : "Nowe urządzenie"}</SheetTitle>
          <SheetDescription>
            {urzadzenie
              ? `Status: ${ETYKIETY_STATUSU_URZADZENIA[urzadzenie.status]}`
              : "Nowe urządzenie ma status „Proponowane” do czasu aktywacji."}
          </SheetDescription>
        </SheetHeader>

        {urzadzenie && (
          <div className="grid gap-2 px-4">
            {akcjeStatusu(urzadzenie.status).map((a) => (
              <Button
                key={a.na}
                type="button"
                variant={a.na === "aktywne" ? "default" : "outline"}
                disabled={zapis}
                onClick={() => void zmienStatus(a.na)}
                className="h-12 text-base font-bold"
              >
                {a.etykieta}
              </Button>
            ))}
          </div>
        )}

        <form onSubmit={zapisz} className="space-y-4 px-4 pb-6">
          {!urzadzenie && (
            <Pole id="nr" etykieta="Numer technologiczny" wartosc={nr} onZmiana={setNr} max={40} />
          )}
          <Pole id="nazwa" etykieta="Nazwa" wartosc={nazwa} onZmiana={setNazwa} max={300} />
          <Pole
            id="kategoria"
            etykieta="Kategoria"
            wartosc={kategoria}
            onZmiana={setKategoria}
            max={200}
          />
          <Pole
            id="lokalizacja"
            etykieta="Lokalizacja"
            wartosc={lokalizacja}
            onZmiana={setLokalizacja}
            max={300}
          />
          <div className="space-y-2">
            <Label className="text-base">Krytyczność</Label>
            <div className="grid grid-cols-3 gap-2">
              {KRYTYCZNOSCI.map((k) => (
                <Button
                  key={k}
                  type="button"
                  aria-pressed={krytycznosc === k}
                  variant={krytycznosc === k ? "default" : "outline"}
                  onClick={() => setKrytycznosc(k)}
                  className="h-12 text-base"
                >
                  {k}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-base">Właściciel</Label>
            <Select value={wlasciciel} onValueChange={setWlasciciel}>
              <SelectTrigger className="h-14 text-base" aria-label="Właściciel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BRAK} className="py-3 text-base">
                  {urzadzenie?.wlasciciel_nazwa && !urzadzenie.wlasciciel_id
                    ? `Bez konta (${urzadzenie.wlasciciel_nazwa})`
                    : "Brak"}
                </SelectItem>
                {aktywneKonta.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="py-3 text-base">
                    {p.imie_nazwisko}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="uwagi-urz" className="text-base">
              Uwagi
            </Label>
            <Textarea
              id="uwagi-urz"
              rows={3}
              maxLength={2000}
              value={uwagi}
              onChange={(e) => setUwagi(e.target.value)}
              className="text-base"
            />
          </div>
          <Button type="submit" disabled={zapis} className="h-16 w-full text-lg font-bold">
            {zapis ? "Zapisywanie..." : urzadzenie ? "Zapisz zmiany" : "Dodaj urządzenie"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Pole(props: {
  id: string;
  etykieta: string;
  wartosc: string;
  onZmiana: (v: string) => void;
  max: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id} className="text-base">
        {props.etykieta}
      </Label>
      <Input
        id={props.id}
        value={props.wartosc}
        maxLength={props.max}
        onChange={(e) => props.onZmiana(e.target.value)}
        className="h-14 text-base"
      />
    </div>
  );
}
