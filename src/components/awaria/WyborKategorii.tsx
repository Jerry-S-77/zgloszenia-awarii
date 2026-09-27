import { Button } from "@/components/ui/button";
import {
  KATEGORIE_PRZYCZYN,
  KROTKIE_ETYKIETY_KATEGORII,
  type KategoriaPrzyczyny,
} from "@/lib/kategorie-przyczyn";

/** Kategoria przyczyny jako duże przyciski (jeden wybór), wygodne w rękawicach. */
export function WyborKategorii({
  wartosc,
  onZmiana,
}: {
  wartosc: KategoriaPrzyczyny | null;
  onZmiana: (k: KategoriaPrzyczyny) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Kategoria przyczyny" className="grid grid-cols-2 gap-2">
      {KATEGORIE_PRZYCZYN.map((k) => (
        <Button
          key={k}
          type="button"
          role="radio"
          aria-checked={wartosc === k}
          variant={wartosc === k ? "default" : "outline"}
          className="h-12 text-base"
          onClick={() => onZmiana(k)}
        >
          {KROTKIE_ETYKIETY_KATEGORII[k]}
        </Button>
      ))}
    </div>
  );
}
