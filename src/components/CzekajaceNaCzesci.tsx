import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { czesciOczekujaceQuery } from "@/lib/czesci";
import { dniOczekiwania, ETYKIETY_STATUSU_CZESCI } from "@/lib/czesci-logika";
import { formatujDate } from "@/lib/przeglady";
import type { AwariaLokalna } from "@/lib/types";

/**
 * Awarie wstrzymane na części (status „Oczekuje na część”) z niedostarczonymi częściami. Lista awarii
 * pochodzi z pamięci (działa też offline), części — online.
 */
export function CzekajaceNaCzesci({ awarie }: { awarie: AwariaLokalna[] }) {
  const wstrzymane = awarie.filter((a) => a.status === "oczekuje_na_czesc");
  const {
    data: czesci = [],
    isError,
    isPending,
  } = useQuery({
    ...czesciOczekujaceQuery,
    enabled: wstrzymane.length > 0,
  });

  if (wstrzymane.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground">
        Żadna awaria nie czeka na części.
      </p>
    );
  }

  const pozycje = wstrzymane
    .map((a) => {
      const swoje = czesci.filter((c) => c.awaria_id === a.id);
      const od = swoje[0]?.created_at ?? a.data_awarii;
      return { a, swoje, dni: dniOczekiwania(od) };
    })
    .sort((x, y) => y.dni - x.dni);

  return (
    <div className="space-y-3">
      {isError && (
        <p className="text-sm text-muted-foreground">Lista części jest widoczna po połączeniu.</p>
      )}
      {pozycje.map(({ a, swoje, dni }) => (
        <Link
          key={a.id}
          to="/awarie/$id"
          params={{ id: a.id }}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 active:bg-accent"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-lg font-bold">
                {a.numer ?? "oczekuje na numer"}
              </span>
              <span className="text-sm text-muted-foreground">{a.nr_technologiczny}</span>
              <span className="text-sm font-semibold text-destructive">
                czeka {dni === 0 ? "od dziś" : dni === 1 ? "1 dzień" : `${dni} dni`}
              </span>
            </div>
            {swoje.length === 0 && !isError && !isPending && (
              <p className="text-sm text-muted-foreground">Nie wpisano, na jaką część.</p>
            )}
            {swoje.map((c) => (
              <p key={c.id} className="text-sm">
                {c.nazwa} × {c.ilosc} · {ETYKIETY_STATUSU_CZESCI[c.status].toLowerCase()}
                {c.termin_dostawy ? ` · dostawa ${formatujDate(c.termin_dostawy)}` : ""}
              </p>
            ))}
          </div>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}
