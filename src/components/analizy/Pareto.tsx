import type { MiaraPareto, PozycjaPareto } from "@/lib/wskazniki";

function formatujWartosc(wartosc: number, miara: MiaraPareto): string {
  if (miara === "liczba") return String(wartosc);
  return `${wartosc.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} h`;
}

/**
 * Pareto jako posortowane słupki poziome z wartością, udziałem i sumą narastającą w podpisie (bez drugiej osi).
 * Kategorie składające się na pierwsze 80% są wyróżnione — to na nich warto się skupić.
 */
export function Pareto({ pozycje, miara }: { pozycje: PozycjaPareto[]; miara: MiaraPareto }) {
  if (pozycje.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Brak zamkniętych awarii w wybranym okresie.</p>
    );
  }
  const maks = Math.max(...pozycje.map((p) => p.wartosc));
  let poprzednia = 0;
  return (
    <ol className="space-y-3" aria-label="Przyczyny awarii od najczęstszej">
      {pozycje.map((p) => {
        const kluczowa = p.klucz !== null && poprzednia < 80;
        poprzednia = p.narastajaco;
        return (
          <li key={p.etykieta}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className={kluczowa ? "font-semibold" : ""}>{p.etykieta}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold">{formatujWartosc(p.wartosc, miara)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {Math.round(p.udzial)}% · narastająco {Math.round(p.narastajaco)}%
                </span>
              </span>
            </div>
            <div className="h-3 rounded-full bg-muted">
              <div
                className={`h-3 rounded-full ${p.klucz === null ? "bg-muted-foreground/40" : kluczowa ? "bg-primary" : "bg-primary/50"}`}
                style={{ width: `${Math.max(2, (p.wartosc / maks) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function PrzelacznikOpcji<T extends string>({
  opcje,
  wartosc,
  onZmiana,
  etykieta,
}: {
  opcje: { wartosc: T; etykieta: string }[];
  wartosc: T;
  onZmiana: (w: T) => void;
  etykieta: string;
}) {
  return (
    <div role="radiogroup" aria-label={etykieta} className="inline-flex rounded-xl bg-muted p-1">
      {opcje.map((o) => (
        <button
          key={o.wartosc}
          type="button"
          role="radio"
          aria-checked={wartosc === o.wartosc}
          onClick={() => onZmiana(o.wartosc)}
          className={`min-h-11 min-w-11 rounded-lg px-3 text-sm font-semibold ${
            wartosc === o.wartosc ? "bg-card shadow-sm" : "text-muted-foreground"
          }`}
        >
          {o.etykieta}
        </button>
      ))}
    </div>
  );
}

export function KafelWskaznika({
  etykieta,
  wartosc,
  opis,
}: {
  etykieta: string;
  wartosc: string;
  opis?: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-border bg-card p-3 text-center">
      <p className="font-display text-2xl font-bold tabular-nums">{wartosc}</p>
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{etykieta}</p>
      {opis && <p className="mt-0.5 text-[10px] text-muted-foreground">{opis}</p>}
    </div>
  );
}
