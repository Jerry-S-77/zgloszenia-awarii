import { Link } from "@tanstack/react-router";
import { ChevronRight, TrendingUp } from "lucide-react";
import {
  ETYKIETY_STATUSU_PRZEGLADU,
  formatujDate,
  opisTerminu,
  roznicaDni,
  KOLOR_STATUSU,
  statusPrzegladu,
} from "@/lib/przeglady";
import { oczekujacaPropozycja, type PrzegladZUrzadzeniem } from "@/lib/przeglady-zapytania";

export function KartaPrzegladu({ p, dzis }: { p: PrzegladZUrzadzeniem; dzis: string }) {
  const status = statusPrzegladu(p, dzis);
  const kolor = KOLOR_STATUSU[status];
  const propozycja = oczekujacaPropozycja(p);
  return (
    <Link
      to="/przeglady/$id"
      params={{ id: p.id }}
      className={`flex items-center gap-3 rounded-2xl border border-l-[6px] border-border bg-card p-4 active:bg-accent ${kolor.pasek}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-display text-lg font-bold">
            {p.nr_technologiczny}
            <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">
              {p.urzadzenia?.nazwa_urzadzenia}
            </span>
          </p>
          {p.data_najblizszego && (
            <span className={`shrink-0 text-sm font-bold ${kolor.tekst}`}>
              {opisTerminu(roznicaDni(dzis, p.data_najblizszego))}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {p.typ_czynnosci ?? "Brak typu czynności"} · termin {formatujDate(p.data_najblizszego)}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
            {ETYKIETY_STATUSU_PRZEGLADU[status]}
          </span>
          {propozycja && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
              <TrendingUp className="size-3" /> Zalecane przyspieszenie
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
