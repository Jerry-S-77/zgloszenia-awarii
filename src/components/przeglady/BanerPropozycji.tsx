import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatujDate } from "@/lib/przeglady";
import type { PowodPropozycji, Propozycja } from "@/lib/przeglady-zapytania";

type Props = {
  propozycja: Propozycja;
  mozeDecydowac: boolean;
  zapis: boolean;
  onDecyzja: (zatwierdz: boolean) => void;
};

function opisPowodu(powod: PowodPropozycji): string[] {
  const linie: string[] = [];
  if ((powod.awarie_90 ?? 0) >= 3) linie.push(`${powod.awarie_90} awarie w 90 dni (próg: 3)`);
  if ((powod.wysokie_60 ?? 0) >= 2)
    linie.push(`${powod.wysokie_60} awarie „Wysoka” w 60 dni (próg: 2)`);
  if (Number(powod.przestoj_30 ?? 0) >= 8)
    linie.push(`${powod.przestoj_30} h przestoju w 30 dni (próg: 8 h)`);
  return linie;
}

export function BanerPropozycji({ propozycja, mozeDecydowac, zapis, onDecyzja }: Props) {
  const powod = (propozycja.powod ?? {}) as PowodPropozycji;
  return (
    <div className="rounded-2xl border border-warning bg-warning/15 p-4">
      <p className="flex items-center gap-2 font-bold">
        <TrendingUp className="size-5" /> Zalecane przyspieszenie przeglądu
      </p>
      <ul className="mt-2 list-disc pl-5 text-sm">
        {opisPowodu(powod).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="mt-2 text-sm">
        {propozycja.proponowany_termin ? (
          <>
            Sugerowany termin: <b>{formatujDate(propozycja.proponowany_termin)}</b> (dziś + 7 dni).
          </>
        ) : (
          <b>Przegląd jest już opóźniony albo termin jest bliski — wykonaj go pilnie.</b>
        )}
      </p>
      {mozeDecydowac ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            onClick={() => onDecyzja(true)}
            disabled={zapis}
            className="h-12 text-base font-bold"
          >
            Zatwierdź
          </Button>
          <Button
            variant="outline"
            onClick={() => onDecyzja(false)}
            disabled={zapis}
            className="h-12 text-base font-bold"
          >
            Odrzuć
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Decyzję podejmuje kierownik.</p>
      )}
    </div>
  );
}
