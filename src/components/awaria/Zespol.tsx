import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { UserMinus, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOnline } from "@/hooks/use-online";
import { czyRola, ETYKIETY_ROL, type Rola } from "@/lib/uprawnienia";
import { dodajDoZespolu, osobyObslugiQuery, usunZZespolu, zespolQuery } from "@/lib/zespol";

type Props = {
  awariaId: string;
  zamknieta: boolean;
  rola: Rola | null;
  userId: string | null;
};

/** Zespół przy awarii: kilka osób obsługi; technik dołącza siebie, kierownik i admin zarządzają składem. */
export function Zespol({ awariaId, zamknieta, rola, userId }: Props) {
  const qc = useQueryClient();
  const online = useOnline();
  const obsluga = czyRola(rola, ["technik", "kierownik", "admin"]);
  const zarzadza = czyRola(rola, ["kierownik", "admin"]);
  const { data: zespol = [], isLoading, isError } = useQuery(zespolQuery(awariaId));
  const { data: osoby = [] } = useQuery({ ...osobyObslugiQuery, enabled: zarzadza && !zamknieta });
  const [wybrana, setWybrana] = useState("");
  const [zapis, setZapis] = useState(false);

  const jestemWZespole = zespol.some((c) => c.uzytkownik_id === userId);
  const doDodania = osoby.filter((o) => !zespol.some((c) => c.uzytkownik_id === o.id));
  const edycja = obsluga && !zamknieta;

  async function wykonaj(akcja: () => Promise<void>, komunikat: string) {
    setZapis(true);
    try {
      await akcja();
      toast.success(komunikat);
      await qc.invalidateQueries({ queryKey: ["awarie", awariaId] });
      await qc.invalidateQueries({ queryKey: ["zespoly"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zmienić zespołu.");
    } finally {
      setZapis(false);
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl font-bold uppercase">Zespół</h2>
      {isLoading && <p className="text-sm text-muted-foreground">Wczytywanie...</p>}
      {isError && (
        <p className="text-sm text-destructive">
          Nie udało się wczytać zespołu. Zespół wymaga połączenia z internetem.
        </p>
      )}
      {!isLoading && !isError && zespol.length === 0 && (
        <p className="text-sm text-muted-foreground">Nikt jeszcze nie zajmuje się tą awarią.</p>
      )}
      <ul className="space-y-2">
        {zespol.map((c) => (
          <li key={c.uzytkownik_id} className="flex items-center gap-2 rounded-xl bg-muted p-3">
            <span className="flex-1 text-base">
              {c.nazwa}
              {c.uzytkownik_id === userId && (
                <span className="ml-2 text-sm font-bold text-primary">(Ty)</span>
              )}
            </span>
            {edycja && zarzadza && c.uzytkownik_id !== userId && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Usuń z zespołu: ${c.nazwa}`}
                disabled={zapis || !online}
                onClick={() =>
                  void wykonaj(
                    () => usunZZespolu(awariaId, c.uzytkownik_id),
                    `Usunięto z zespołu: ${c.nazwa}`,
                  )
                }
                className="size-11"
              >
                <X className="size-5" />
              </Button>
            )}
          </li>
        ))}
      </ul>

      {edycja && userId && (
        <Button
          variant={jestemWZespole ? "outline" : "default"}
          disabled={zapis || !online}
          onClick={() =>
            void (jestemWZespole
              ? wykonaj(() => usunZZespolu(awariaId, userId), "Opuszczono zadanie")
              : wykonaj(() => dodajDoZespolu(awariaId, userId), "Dołączono do zadania"))
          }
          className="h-12 w-full text-base font-bold"
        >
          {jestemWZespole ? (
            <>
              <UserMinus className="size-5" /> Opuść zadanie
            </>
          ) : (
            <>
              <UserPlus className="size-5" /> Dołącz do zadania
            </>
          )}
        </Button>
      )}

      {edycja && zarzadza && (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Select value={wybrana} onValueChange={setWybrana} disabled={!online}>
            <SelectTrigger className="h-12 text-base" aria-label="Osoba do dodania">
              <SelectValue placeholder="Dodaj osobę do zespołu" />
            </SelectTrigger>
            <SelectContent>
              {doDodania.map((o) => (
                <SelectItem key={o.id} value={o.id} className="py-3 text-base">
                  {o.imie_nazwisko} · {ETYKIETY_ROL[o.rola]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={zapis || !online || !wybrana}
            onClick={() => {
              const osoba = osoby.find((o) => o.id === wybrana);
              void wykonaj(
                () => dodajDoZespolu(awariaId, wybrana),
                `Dodano do zespołu: ${osoba?.imie_nazwisko ?? ""}`,
              ).then(() => setWybrana(""));
            }}
            className="h-12 font-bold"
          >
            Dodaj
          </Button>
        </div>
      )}

      {edycja && !online && (
        <p className="text-sm text-muted-foreground">Zmiany w zespole wymagają połączenia.</p>
      )}
    </div>
  );
}
