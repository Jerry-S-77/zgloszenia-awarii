import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ETYKIETY_WYNIKU,
  MAKS_DLUGOSC_PUNKTU,
  MAKS_DLUGOSC_UWAGI,
  MAKS_PUNKTOW,
  WYNIKI,
  type WynikPunktu,
  type ZapisanyWynik,
} from "@/lib/lista-kontrolna";

/** Edycja punktów listy kontrolnej w harmonogramie (kierownik, admin). */
export function EdytorListyKontrolnej({
  punkty,
  onZmiana,
}: {
  punkty: string[];
  onZmiana: (punkty: string[]) => void;
}) {
  const zmien = (i: number, tresc: string) => onZmiana(punkty.map((p, j) => (j === i ? tresc : p)));
  const przesun = (i: number, o: -1 | 1) => {
    const nowe = [...punkty];
    [nowe[i], nowe[i + o]] = [nowe[i + o] as string, nowe[i] as string];
    onZmiana(nowe);
  };
  return (
    <div className="space-y-2">
      {punkty.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Brak listy — wykonanie odnotowuje się bez punktów do sprawdzenia.
        </p>
      )}
      {punkty.map((p, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="w-6 shrink-0 text-right text-sm text-muted-foreground">{i + 1}.</span>
          <Input
            aria-label={`Punkt ${i + 1}`}
            value={p}
            maxLength={MAKS_DLUGOSC_PUNKTU}
            onChange={(e) => zmien(i, e.target.value)}
            className="h-11 min-w-0 flex-1 text-base"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            aria-label={`Przesuń punkt ${i + 1} w górę`}
            disabled={i === 0}
            onClick={() => przesun(i, -1)}
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            aria-label={`Przesuń punkt ${i + 1} w dół`}
            disabled={i === punkty.length - 1}
            onClick={() => przesun(i, 1)}
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-destructive"
            aria-label={`Usuń punkt ${i + 1}`}
            onClick={() => onZmiana(punkty.filter((_, j) => j !== i))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      {punkty.length < MAKS_PUNKTOW && (
        <Button
          type="button"
          variant="outline"
          className="h-12 w-full"
          onClick={() => onZmiana([...punkty, ""])}
        >
          <Plus className="size-5" /> Dodaj punkt
        </Button>
      )}
    </div>
  );
}

/** Ocena punktów przy odnotowaniu wykonania: OK / Nieprawidłowość (z opisem) / Nie dotyczy. */
export function WypelnianieListyKontrolnej({
  wyniki,
  onZmiana,
}: {
  wyniki: WynikPunktu[];
  onZmiana: (wyniki: WynikPunktu[]) => void;
}) {
  const zmien = (i: number, zmiana: Partial<WynikPunktu>) =>
    onZmiana(wyniki.map((w, j) => (j === i ? { ...w, ...zmiana } : w)));
  return (
    <ol className="space-y-3">
      {wyniki.map((w, i) => (
        <li
          key={i}
          className={`rounded-xl border p-3 ${w.wynik === "nok" ? "border-destructive bg-destructive/5" : "border-border"}`}
        >
          <p className="mb-2 text-base font-medium">
            {i + 1}. {w.tresc}
          </p>
          <div
            role="radiogroup"
            aria-label={`Wynik: ${w.tresc}`}
            className="grid grid-cols-3 gap-2"
          >
            {WYNIKI.map((wynik) => (
              <Button
                key={wynik}
                type="button"
                role="radio"
                aria-checked={w.wynik === wynik}
                variant={
                  w.wynik === wynik ? (wynik === "nok" ? "destructive" : "default") : "outline"
                }
                className="h-auto min-h-11 whitespace-normal px-1 text-sm leading-tight"
                onClick={() => zmien(i, { wynik })}
              >
                {ETYKIETY_WYNIKU[wynik]}
              </Button>
            ))}
          </div>
          {w.wynik === "nok" && (
            <Textarea
              aria-label={`Opis nieprawidłowości: ${w.tresc}`}
              placeholder="Co jest nie tak?"
              rows={2}
              maxLength={MAKS_DLUGOSC_UWAGI}
              value={w.uwaga}
              onChange={(e) => zmien(i, { uwaga: e.target.value })}
              className="mt-2 text-base"
            />
          )}
        </li>
      ))}
    </ol>
  );
}

/** Wyniki listy w historii wykonań: podsumowanie, nieprawidłowości zawsze widoczne, reszta po rozwinięciu. */
export function WynikiListyKontrolnej({ wyniki }: { wyniki: ZapisanyWynik[] }) {
  if (wyniki.length === 0) return null;
  const nok = wyniki.filter((w) => w.wynik === "nok");
  const ok = wyniki.filter((w) => w.wynik === "ok").length;
  const nd = wyniki.filter((w) => w.wynik === "nd").length;
  return (
    <div className="mt-1 text-sm">
      <p className={nok.length ? "font-semibold text-destructive" : "text-muted-foreground"}>
        Lista kontrolna: {ok} OK
        {nok.length > 0 &&
          `, ${nok.length} ${nok.length === 1 ? "nieprawidłowość" : "nieprawidłowości"}`}
        {nd > 0 && `, ${nd} nie dotyczy`}
      </p>
      {nok.map((w, i) => (
        <p key={i} className="text-destructive">
          • {w.tresc}: {w.uwaga}
        </p>
      ))}
      <details className="mt-1">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-muted-foreground underline underline-offset-4">
          Wszystkie punkty
        </summary>
        <ul className="space-y-0.5">
          {wyniki.map((w, i) => (
            <li key={i}>
              {ETYKIETY_WYNIKU[w.wynik]} — {w.tresc}
              {w.uwaga && w.wynik !== "nok" ? ` (${w.uwaga})` : ""}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
