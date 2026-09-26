import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CloudOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAdresyBlobow } from "@/hooks/use-adresy-blobow";
import { useOnline } from "@/hooks/use-online";
import type { Rola } from "@/lib/uprawnienia";
import {
  dodajZdjecia,
  LIMIT_ZDJEC,
  usunZdjecie,
  zdjeciaOczekujace,
  zdjeciaQuery,
  zmniejszZdjecie,
  type Zdjecie,
  type ZdjecieOczekujace,
} from "@/lib/zdjecia";

type Podglad = { url: string; zdjecie: Zdjecie | null };

export function Zdjecia({
  awariaId,
  rola,
  userId,
}: {
  awariaId: string;
  rola: Rola | null;
  userId: string | null;
}) {
  const qc = useQueryClient();
  const online = useOnline();
  const { data: wyslane = [], isError, isLoading } = useQuery(zdjeciaQuery(awariaId));
  const [oczekujace, setOczekujace] = useState<ZdjecieOczekujace[]>([]);
  const [dodaje, setDodaje] = useState(false);
  const [podglad, setPodglad] = useState<Podglad | null>(null);
  const [usuwa, setUsuwa] = useState(false);
  const pole = useRef<HTMLInputElement>(null);
  const blobyOczekujace = useMemo(() => oczekujace.map((z) => z.plik), [oczekujace]);
  const plikiOczekujace = useAdresyBlobow(blobyOczekujace);

  useEffect(() => {
    let anulowane = false;
    let poprzednio = 0;
    const odswiez = async () => {
      const lista = await zdjeciaOczekujace(awariaId);
      if (anulowane) return;
      // Zdjęcie zniknęło z kolejki, czyli właśnie się wysłało: pobieramy listę z serwera.
      if (lista.length < poprzednio)
        void qc.invalidateQueries({ queryKey: zdjeciaQuery(awariaId).queryKey });
      poprzednio = lista.length;
      setOczekujace(lista);
    };
    void odswiez();
    window.addEventListener("queue-changed", odswiez);
    return () => {
      anulowane = true;
      window.removeEventListener("queue-changed", odswiez);
    };
  }, [awariaId, qc]);

  const wolne = LIMIT_ZDJEC - wyslane.length - oczekujace.length;

  async function wybrano(e: React.ChangeEvent<HTMLInputElement>) {
    const wybrane = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (wybrane.length === 0) return;
    if (wybrane.length > wolne)
      toast.error(`Do awarii można dodać najwyżej ${LIMIT_ZDJEC} zdjęcia.`);
    setDodaje(true);
    try {
      const male = await Promise.all(wybrane.slice(0, wolne).map((p) => zmniejszZdjecie(p)));
      const wynik = await dodajZdjecia(awariaId, male);
      await qc.invalidateQueries({ queryKey: ["awarie", awariaId] });
      toast.success(
        wynik === "zsynchronizowano"
          ? "Zdjęcie dodane"
          : "Zdjęcie zapisane w telefonie, wyśle się po powrocie sieci",
      );
    } catch (blad) {
      toast.error(blad instanceof Error ? blad.message : "Nie udało się dodać zdjęcia.");
    } finally {
      setDodaje(false);
    }
  }

  async function usun(zdjecie: Zdjecie) {
    setUsuwa(true);
    try {
      await usunZdjecie(awariaId, zdjecie.id);
      setPodglad(null);
      await qc.invalidateQueries({ queryKey: ["awarie", awariaId] });
      toast.success("Zdjęcie usunięte");
    } catch (blad) {
      toast.error(blad instanceof Error ? blad.message : "Nie udało się usunąć zdjęcia.");
    } finally {
      setUsuwa(false);
    }
  }

  const mozeUsunac = (z: Zdjecie) => online && (z.autor_id === userId || rola === "admin");
  const brak = !isLoading && wyslane.length === 0 && oczekujace.length === 0;

  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-bold uppercase">Zdjęcia</h2>
      {isError && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CloudOff className="size-4 shrink-0" /> Wysłane zdjęcia są widoczne po połączeniu z
          internetem.
        </p>
      )}
      {brak && !isError && <p className="text-sm text-muted-foreground">Brak zdjęć.</p>}
      {(wyslane.length > 0 || oczekujace.length > 0) && (
        <div className="grid grid-cols-3 gap-2">
          {wyslane.map((z, i) => (
            <button
              key={z.id}
              type="button"
              aria-label={`Zdjęcie ${i + 1}`}
              disabled={!z.url}
              onClick={() => z.url && setPodglad({ url: z.url, zdjecie: z })}
              className="aspect-square overflow-hidden rounded-xl border bg-muted"
            >
              {z.url && <img src={z.url} alt="" className="size-full object-cover" />}
            </button>
          ))}
          {plikiOczekujace.map((url, i) => (
            <button
              key={url}
              type="button"
              aria-label={`Zdjęcie czekające na wysłanie ${i + 1}`}
              onClick={() => setPodglad({ url, zdjecie: null })}
              className="relative aspect-square overflow-hidden rounded-xl border"
            >
              <img src={url} alt="" className="size-full object-cover opacity-70" />
              <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-[11px] font-semibold text-white">
                Czeka na wysłanie
              </span>
            </button>
          ))}
        </div>
      )}
      {wolne > 0 && (
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full"
          disabled={dodaje}
          onClick={() => pole.current?.click()}
        >
          <Camera className="size-5" />
          {dodaje ? "Dodawanie..." : `Dodaj zdjęcie (${LIMIT_ZDJEC - wolne}/${LIMIT_ZDJEC})`}
        </Button>
      )}
      <input
        ref={pole}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid="pole-zdjec-karty"
        onChange={(e) => void wybrano(e)}
      />

      <Dialog open={podglad !== null} onOpenChange={(o) => !o && setPodglad(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] p-3">
          <DialogTitle className="text-base">
            {podglad?.zdjecie
              ? `Dodał(a): ${podglad.zdjecie.autor_nazwa ?? "—"}, ${new Date(podglad.zdjecie.created_at).toLocaleString("pl-PL")}`
              : "Zdjęcie czeka na wysłanie"}
          </DialogTitle>
          {podglad && (
            <img
              src={podglad.url}
              alt="Zdjęcie awarii"
              className="max-h-[70dvh] w-full rounded-lg object-contain"
            />
          )}
          {podglad?.zdjecie && mozeUsunac(podglad.zdjecie) && (
            <Button
              variant="outline"
              className="h-12 w-full text-destructive"
              disabled={usuwa}
              onClick={() => podglad.zdjecie && void usun(podglad.zdjecie)}
            >
              <Trash2 className="size-5" /> {usuwa ? "Usuwanie..." : "Usuń zdjęcie"}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
