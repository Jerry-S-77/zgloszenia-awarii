import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { KafelWskaznika, Pareto, PrzelacznikOpcji } from "@/components/analizy/Pareto";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { BEZ_KATEGORII, KROTKIE_ETYKIETY_KATEGORII } from "@/lib/kategorie-przyczyn";
import {
  dzisLokalnie,
  ETYKIETY_STATUSU_PRZEGLADU,
  KOLOR_STATUSU,
  statusPrzegladu,
} from "@/lib/przeglady";
import { przegladyQuery } from "@/lib/przeglady-zapytania";
import { czesciUrzadzeniaQuery } from "@/lib/czesci";
import { historiaCzesci } from "@/lib/czesci-logika";
import { czesciMagazynuUrzadzeniaQuery, formatujIlosc, niskiStan } from "@/lib/magazyn";
import { awarieQuery, wymagajSieci } from "@/lib/queries";
import { ETYKIETY_STATUSOW } from "@/lib/statusy-awarii";
import { czyRola } from "@/lib/uprawnienia";
import { formatujCzas, okresOstatnichDni, pareto, wOkresie, wskazniki } from "@/lib/wskazniki";
import type { Urzadzenie } from "@/lib/types";

export const Route = createFileRoute("/urzadzenia/$nr")({
  head: () => ({
    meta: [
      { title: "Karta urządzenia — Ewidencja awarii urządzeń" },
      {
        name: "description",
        content: "Historia awarii i przeglądów urządzenia, MTBF, MTTR i przyczyny awarii.",
      },
    ],
  }),
  component: KartaUrzadzenia,
});

function urzadzenieQuery(nr: string) {
  return queryOptions({
    queryKey: ["urzadzenia", nr],
    queryFn: async (): Promise<Urzadzenie | null> => {
      wymagajSieci();
      const { data, error } = await supabase
        .from("urzadzenia")
        .select("*")
        .eq("nr_technologiczny", nr)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

const OKRESY = [
  { wartosc: "90", etykieta: "90 dni" },
  { wartosc: "365", etykieta: "365 dni" },
] as const;

function KartaUrzadzenia() {
  const { nr } = Route.useParams();
  const auth = useAuth();
  const dostep =
    auth.stan === "zalogowany" &&
    !auth.profil.must_change_password &&
    czyRola(auth.profil.rola, ["technik", "kierownik", "admin"]);
  const { data: urzadzenie } = useQuery({ ...urzadzenieQuery(nr), enabled: dostep });
  const { data: wszystkie = [], isLoading } = useQuery({ ...awarieQuery, enabled: dostep });
  const { data: przeglady = [], isError: bladPrzegladow } = useQuery({
    ...przegladyQuery,
    enabled: dostep,
  });
  const { data: czesci = [], isError: bladCzesci } = useQuery({
    ...czesciUrzadzeniaQuery(nr),
    enabled: dostep,
  });
  const { data: czesciMagazynu = [], isError: bladMagazynu } = useQuery({
    ...czesciMagazynuUrzadzeniaQuery(nr),
    enabled: dostep,
  });
  const [okres, setOkres] = useState<"90" | "365">("365");

  const awarie = useMemo(
    () => wszystkie.filter((a) => a.nr_technologiczny === nr),
    [wszystkie, nr],
  );
  const zakres = useMemo(() => okresOstatnichDni(Number(okres)), [okres]);
  const w = useMemo(() => wskazniki(awarie, zakres), [awarie, zakres]);
  const przyczyny = useMemo(() => pareto(wOkresie(awarie, zakres), "liczba"), [awarie, zakres]);
  const przegladyUrzadzenia = przeglady.filter((p) => p.nr_technologiczny === nr);
  const dzis = dzisLokalnie();
  const nazwa = urzadzenie?.nazwa_urzadzenia ?? awarie[0]?.nazwa_urzadzenia ?? "";

  return (
    <AppShell title={nr} dozwoloneRole={["technik", "kierownik", "admin"]}>
      <section className="mb-4 space-y-1 rounded-2xl border border-border bg-card p-4">
        <p className="font-display text-xl font-bold">{nazwa || nr}</p>
        {urzadzenie && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <Pole etykieta="Kategoria" wartosc={urzadzenie.kategoria} />
            <Pole etykieta="Lokalizacja" wartosc={urzadzenie.lokalizacja} />
            <Pole etykieta="Krytyczność" wartosc={urzadzenie.krytycznosc} />
            <Pole etykieta="Właściciel" wartosc={urzadzenie.wlasciciel_nazwa} />
          </div>
        )}
      </section>

      <section className="mb-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold uppercase">Niezawodność</h2>
          <PrzelacznikOpcji
            etykieta="Okres"
            opcje={[...OKRESY]}
            wartosc={okres}
            onZmiana={setOkres}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <KafelWskaznika etykieta="Awarie" wartosc={String(w.liczba)} />
          <KafelWskaznika etykieta="Przestój" wartosc={formatujCzas(w.przestojH)} />
          <KafelWskaznika
            etykieta="MTBF"
            wartosc={formatujCzas(w.mtbfH)}
            opis="średnio między awariami"
          />
          <KafelWskaznika
            etykieta="MTTR"
            wartosc={formatujCzas(w.mttrH)}
            opis="średni czas przestoju"
          />
        </div>
      </section>

      <section className="mb-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-xl font-bold uppercase">
          Przyczyny awarii ({okres} dni)
        </h2>
        <Pareto pozycje={przyczyny} miara="liczba" />
      </section>

      <section className="mb-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-1 font-display text-xl font-bold uppercase">Części zamienne</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Części z magazynu przypisane do urządzenia i ich stan.
        </p>
        {bladMagazynu && (
          <p className="text-sm text-muted-foreground">Magazyn jest widoczny po połączeniu.</p>
        )}
        {!bladMagazynu && czesciMagazynu.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nie przypisano części z magazynu (Magazyn → część → Urządzenia).
          </p>
        )}
        <ul className="mb-5 divide-y divide-border">
          {czesciMagazynu.map(({ krytyczna, magazyn_czesci: c }) => (
            <li key={c.id} className="flex items-baseline justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-semibold">{c.nazwa}</span>
                {krytyczna && (
                  <span className="ml-1 rounded-full bg-warning px-1.5 text-[11px] font-bold text-warning-foreground">
                    krytyczna
                  </span>
                )}
                <span className="block text-xs text-muted-foreground">{c.numer_katalogowy}</span>
              </span>
              <span
                className={`shrink-0 font-semibold tabular-nums ${niskiStan(c) || c.stan === 0 ? "text-destructive" : ""}`}
              >
                {formatujIlosc(c.stan, c.jednostka)}
              </span>
            </li>
          ))}
        </ul>
        <h3 className="mb-1 font-display text-lg font-bold uppercase">Zużyte części</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Dostarczone części ze wszystkich awarii urządzenia, najczęściej wymieniane na górze.
        </p>
        {bladCzesci && (
          <p className="text-sm text-muted-foreground">Części są widoczne po połączeniu.</p>
        )}
        {!bladCzesci && historiaCzesci(czesci).length === 0 && (
          <p className="text-sm text-muted-foreground">Brak zapisanych części.</p>
        )}
        <ul className="divide-y divide-border">
          {historiaCzesci(czesci).map((c) => (
            <li key={c.nazwa} className="flex items-baseline justify-between gap-2 py-2 text-sm">
              <span className="min-w-0 font-semibold">{c.nazwa}</span>
              <span className="shrink-0 text-right text-muted-foreground tabular-nums">
                {c.ilosc} szt. · {c.awarie} {c.awarie === 1 ? "awaria" : "awarie"} · ostatnio{" "}
                {new Date(c.ostatnio).toLocaleDateString("pl-PL")}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-xl font-bold uppercase">Przeglądy</h2>
        {bladPrzegladow && (
          <p className="text-sm text-muted-foreground">Przeglądy są widoczne po połączeniu.</p>
        )}
        {!bladPrzegladow && przegladyUrzadzenia.length === 0 && (
          <p className="text-sm text-muted-foreground">Brak przeglądów w harmonogramie.</p>
        )}
        <div className="space-y-2">
          {przegladyUrzadzenia.map((p) => {
            const status = statusPrzegladu(p, dzis);
            return (
              <Link
                key={p.id}
                to="/przeglady/$id"
                params={{ id: p.id }}
                className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border border-l-4 border-border p-3 ${KOLOR_STATUSU[status].pasek}`}
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.typ_czynnosci ?? "Przegląd"}</p>
                  <p className={`text-sm ${KOLOR_STATUSU[status].tekst}`}>
                    {ETYKIETY_STATUSU_PRZEGLADU[status]}
                    {p.data_najblizszego ? ` · ${p.data_najblizszego}` : ""}
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-xl font-bold uppercase">
          Historia awarii ({awarie.length})
        </h2>
        {isLoading && <p className="text-sm text-muted-foreground">Wczytywanie...</p>}
        {!isLoading && awarie.length === 0 && (
          <p className="text-sm text-muted-foreground">Brak zgłoszonych awarii.</p>
        )}
        <div className="space-y-2">
          {awarie.map((a) => (
            <Link
              key={a.id}
              to="/awarie/$id"
              params={{ id: a.id }}
              className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-border p-3"
            >
              <div className="min-w-0">
                <p className="font-semibold">
                  {a.numer ?? "oczekuje na numer"}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    · {ETYKIETY_STATUSOW[a.status]}
                  </span>
                </p>
                <p className="truncate text-sm">{a.opis_awarii}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(a.data_awarii).toLocaleDateString("pl-PL")}
                  {a.status === "zamknieta" &&
                    ` · ${a.kategoria_przyczyny ? KROTKIE_ETYKIETY_KATEGORII[a.kategoria_przyczyny] : BEZ_KATEGORII}` +
                      (a.czas_przestoju_h !== null ? ` · przestój ${a.czas_przestoju_h} h` : "")}
                </p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function Pole({ etykieta, wartosc }: { etykieta: string; wartosc: string | null }) {
  return (
    <p>
      <span className="text-muted-foreground">{etykieta}:</span> {wartosc || "—"}
    </p>
  );
}
