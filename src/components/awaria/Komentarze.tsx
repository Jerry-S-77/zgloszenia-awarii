import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { dodajKomentarz, komentarzeQuery } from "@/lib/komentarze";

export function Komentarze({ awariaId }: { awariaId: string }) {
  const qc = useQueryClient();
  const { data: komentarze = [], isLoading, isError } = useQuery(komentarzeQuery(awariaId));
  const [tresc, setTresc] = useState("");
  const [zapis, setZapis] = useState(false);

  async function wyslij() {
    if (!tresc.trim()) return;
    setZapis(true);
    try {
      await dodajKomentarz(awariaId, tresc.trim());
      setTresc("");
      await qc.invalidateQueries({ queryKey: ["awarie", awariaId, "komentarze"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać komentarza.");
    } finally {
      setZapis(false);
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-bold uppercase">Komentarze</h2>
      {isLoading && <p className="text-sm text-muted-foreground">Wczytywanie...</p>}
      {isError && (
        <p className="text-sm text-destructive">
          Nie udało się wczytać komentarzy. Sprawdź połączenie.
        </p>
      )}
      {!isLoading && !isError && komentarze.length === 0 && (
        <p className="text-sm text-muted-foreground">Brak komentarzy.</p>
      )}
      <div className="space-y-2">
        {komentarze.map((k) => (
          <div key={k.id} className="rounded-xl bg-muted p-3">
            <p className="text-sm">{k.tresc}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(k.created_at).toLocaleString("pl-PL")}
            </p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Textarea
          value={tresc}
          onChange={(e) => setTresc(e.target.value)}
          rows={2}
          placeholder="Dodaj komentarz..."
          className="text-base"
        />
        <Button onClick={wyslij} disabled={zapis || !tresc.trim()} className="h-12 w-full">
          {zapis ? "Zapisywanie..." : "Dodaj komentarz"}
        </Button>
      </div>
    </div>
  );
}
