import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAdresyBlobow } from "@/hooks/use-adresy-blobow";
import { zmniejszZdjecie } from "@/lib/zdjecia";

/**
 * Przycisk „Dodaj zdjęcie” z miniaturami. Zdjęcia są zmniejszane od razu po wyborze, więc do formularza
 * (i ewentualnie do kolejki offline) trafiają już małe pliki JPEG.
 */
export function WyborZdjec({
  zdjecia,
  onZmiana,
  limit,
  etykieta = "Dodaj zdjęcie",
}: {
  zdjecia: Blob[];
  onZmiana: (zdjecia: Blob[]) => void;
  limit: number;
  etykieta?: string;
}) {
  const pole = useRef<HTMLInputElement>(null);
  const [przetwarza, setPrzetwarza] = useState(false);
  const adresy = useAdresyBlobow(zdjecia);
  const wolne = limit - zdjecia.length;

  async function wybrano(e: React.ChangeEvent<HTMLInputElement>) {
    const wybrane = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (wybrane.length === 0) return;
    if (wybrane.length > wolne) toast.error(`Można dodać najwyżej ${limit} zdjęcia.`);
    setPrzetwarza(true);
    try {
      const male = await Promise.all(wybrane.slice(0, wolne).map((p) => zmniejszZdjecie(p)));
      onZmiana([...zdjecia, ...male]);
    } catch {
      toast.error("Nie udało się odczytać zdjęcia. Spróbuj zrobić je ponownie.");
    } finally {
      setPrzetwarza(false);
    }
  }

  return (
    <div className="space-y-2">
      {zdjecia.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {adresy.map((adres, i) => (
            <div key={adres} className="relative aspect-square overflow-hidden rounded-xl border">
              <img src={adres} alt={`Zdjęcie ${i + 1}`} className="size-full object-cover" />
              <button
                type="button"
                aria-label={`Usuń zdjęcie ${i + 1}`}
                onClick={() => onZmiana(zdjecia.filter((_, j) => j !== i))}
                className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-bl-xl bg-black/60 text-white"
              >
                <X className="size-5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {wolne > 0 && (
        <Button
          type="button"
          variant="outline"
          className="h-14 w-full text-base"
          disabled={przetwarza}
          onClick={() => pole.current?.click()}
        >
          <Camera className="size-5" />
          {przetwarza ? "Przygotowanie zdjęcia..." : `${etykieta} (${zdjecia.length}/${limit})`}
        </Button>
      )}
      <input
        ref={pole}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid="pole-zdjec"
        onChange={(e) => void wybrano(e)}
      />
    </div>
  );
}
