import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOnline } from "@/hooks/use-online";
import {
  czesciAwariiQuery,
  czesciUrzadzeniaQuery,
  dodajCzesc,
  usunCzesc,
  zmienStatusCzesci,
} from "@/lib/czesci";
import { ETYKIETY_STATUSU_CZESCI, nastepnyEtap, podpowiedziNazw } from "@/lib/czesci-logika";
import { formatujDate } from "@/lib/przeglady";
import { PobierzZMagazynu } from "./PobierzZMagazynu";

const KOLOR_STATUSU = {
  potrzebna: "bg-destructive/10 text-destructive",
  zamowiona: "bg-warning text-warning-foreground",
  dostarczona: "bg-success/15 text-success",
} as const;

export function Czesci({
  awariaId,
  nr,
  zamknieta,
  czekaNaCzesc,
  obsluga,
}: {
  awariaId: string;
  nr: string;
  zamknieta: boolean;
  czekaNaCzesc: boolean;
  obsluga: boolean;
}) {
  const qc = useQueryClient();
  const online = useOnline();
  const { data: czesci = [], isError, isLoading } = useQuery(czesciAwariiQuery(awariaId));
  const edycja = obsluga && !zamknieta;
  const { data: historiaUrzadzenia = [] } = useQuery({
    ...czesciUrzadzeniaQuery(nr),
    enabled: edycja,
  });
  const [formularz, setFormularz] = useState(false);
  const [zMagazynu, setZMagazynu] = useState(false);
  const [nazwa, setNazwa] = useState("");
  const [ilosc, setIlosc] = useState("1");
  const [termin, setTermin] = useState("");
  const [zapis, setZapis] = useState(false);

  const odswiez = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["awarie", awariaId] }),
      qc.invalidateQueries({ queryKey: ["urzadzenia", nr, "czesci"] }),
      qc.invalidateQueries({ queryKey: ["czesci"] }),
      qc.invalidateQueries({ queryKey: ["magazyn"] }),
    ]);

  async function wykonaj(akcja: () => Promise<void>, sukces: string) {
    setZapis(true);
    try {
      await akcja();
      await odswiez();
      toast.success(sukces);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać.");
      return false;
    } finally {
      setZapis(false);
    }
  }

  async function dodaj(e: React.FormEvent) {
    e.preventDefault();
    const liczba = Number(ilosc);
    if (!nazwa.trim()) return void toast.error("Podaj nazwę lub numer części.");
    if (!Number.isInteger(liczba) || liczba < 1 || liczba > 9999) {
      return void toast.error("Ilość: liczba całkowita od 1 do 9999.");
    }
    const udalo = await wykonaj(
      () =>
        dodajCzesc({
          awariaId,
          nazwa: nazwa.trim(),
          ilosc: liczba,
          terminDostawy: termin || null,
        }),
      "Dodano część",
    );
    if (udalo) {
      setNazwa("");
      setIlosc("1");
      setTermin("");
      setFormularz(false);
    }
  }

  const listaPodpowiedzi = `podpowiedzi-czesci-${awariaId}`;
  const brakOczekujacych = czekaNaCzesc && !czesci.some((c) => c.status !== "dostarczona");

  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-bold uppercase">Części</h2>
      {isLoading && <p className="text-sm text-muted-foreground">Wczytywanie...</p>}
      {isError && (
        <p className="text-sm text-muted-foreground">Części są widoczne po połączeniu.</p>
      )}
      {!isLoading && !isError && czesci.length === 0 && (
        <p className="text-sm text-muted-foreground">Brak części przy tej awarii.</p>
      )}
      {brakOczekujacych && edycja && (
        <p className="rounded-xl bg-warning/30 p-3 text-sm">
          Awaria czeka na część — dodaj, jakiej części potrzeba, żeby było widać, na co czekacie.
        </p>
      )}
      <ul className="space-y-2">
        {czesci.map((c) => {
          const etap = nastepnyEtap(c.status);
          return (
            <li key={c.id} className="rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    <Package className="mr-1 inline size-4 align-[-2px] text-muted-foreground" />
                    {c.nazwa} <span className="font-normal text-muted-foreground">× {c.ilosc}</span>
                  </p>
                  <p className="mt-1 text-sm">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${KOLOR_STATUSU[c.status]}`}
                    >
                      {ETYKIETY_STATUSU_CZESCI[c.status]}
                    </span>
                    {c.termin_dostawy && c.status !== "dostarczona" && (
                      <span className="ml-2 text-muted-foreground">
                        dostawa: {formatujDate(c.termin_dostawy)}
                      </span>
                    )}
                  </p>
                </div>
                {edycja && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0 text-destructive"
                    aria-label={`Usuń część ${c.nazwa}`}
                    disabled={zapis || !online}
                    onClick={() => void wykonaj(() => usunCzesc(c.id), "Usunięto część")}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              {edycja && etap && (
                <Button
                  variant="outline"
                  className="mt-2 h-11 w-full"
                  disabled={zapis || !online}
                  onClick={() =>
                    void wykonaj(
                      () => zmienStatusCzesci(c.id, etap.na),
                      `Część: ${ETYKIETY_STATUSU_CZESCI[etap.na].toLowerCase()}`,
                    )
                  }
                >
                  {etap.etykieta}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {edycja && !formularz && !zMagazynu && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-12"
            disabled={!online}
            onClick={() => setZMagazynu(true)}
          >
            <Package className="size-5" /> Z magazynu
          </Button>
          <Button
            variant="outline"
            className="h-12"
            disabled={!online}
            onClick={() => setFormularz(true)}
          >
            <Plus className="size-5" /> Dodaj część
          </Button>
        </div>
      )}
      {edycja && zMagazynu && (
        <PobierzZMagazynu
          awariaId={awariaId}
          nr={nr}
          onGotowe={odswiez}
          onAnuluj={() => setZMagazynu(false)}
        />
      )}
      {edycja && formularz && (
        <form onSubmit={dodaj} className="space-y-3 rounded-xl bg-muted p-3">
          <div className="space-y-1">
            <Label htmlFor={`czesc-nazwa-${awariaId}`}>Nazwa lub numer katalogowy</Label>
            <Input
              id={`czesc-nazwa-${awariaId}`}
              list={listaPodpowiedzi}
              value={nazwa}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => setNazwa(e.target.value)}
              className="h-12 bg-card text-base"
            />
            <datalist id={listaPodpowiedzi}>
              {podpowiedziNazw(historiaUrzadzenia).map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`czesc-ilosc-${awariaId}`}>Ilość</Label>
              <Input
                id={`czesc-ilosc-${awariaId}`}
                type="number"
                inputMode="numeric"
                min={1}
                max={9999}
                value={ilosc}
                onChange={(e) => setIlosc(e.target.value)}
                className="h-12 bg-card text-base"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`czesc-termin-${awariaId}`}>Dostawa (opcjonalnie)</Label>
              <Input
                id={`czesc-termin-${awariaId}`}
                type="date"
                value={termin}
                onChange={(e) => setTermin(e.target.value)}
                className="h-12 bg-card text-base"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => setFormularz(false)}
            >
              Anuluj
            </Button>
            <Button type="submit" className="h-12 font-bold" disabled={zapis || !online}>
              {zapis ? "Zapisywanie..." : "Dodaj"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
