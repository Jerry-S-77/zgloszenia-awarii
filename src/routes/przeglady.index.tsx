import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { KartaPrzegladu } from "@/components/przeglady/KartaPrzegladu";
import { useAuth } from "@/lib/auth";
import {
  dzisLokalnie,
  filtrujPrzeglady,
  sortujPoPilnosci,
  type FiltrPrzegladow,
} from "@/lib/przeglady";
import { przegladyQuery } from "@/lib/przeglady-zapytania";
import { czyRola } from "@/lib/uprawnienia";

export const Route = createFileRoute("/przeglady/")({
  head: () => ({
    meta: [
      { title: "Przeglądy — Ewidencja awarii urządzeń" },
      { name: "description", content: "Harmonogram przeglądów urządzeń posortowany po pilności." },
    ],
  }),
  component: Przeglady,
});

function Przeglady() {
  const auth = useAuth();
  const dostep =
    auth.stan === "zalogowany" &&
    !auth.profil.must_change_password &&
    czyRola(auth.profil.rola, ["technik", "kierownik", "admin"]);
  const {
    data: przeglady = [],
    isLoading,
    isError,
  } = useQuery({ ...przegladyQuery, enabled: dostep });
  const [filtr, setFiltr] = useState<FiltrPrzegladow>("wszystkie");
  const dzis = dzisLokalnie();

  const posortowane = useMemo(() => sortujPoPilnosci(przeglady), [przeglady]);
  const widoczne = useMemo(
    () => filtrujPrzeglady(posortowane, filtr, dzis),
    [posortowane, filtr, dzis],
  );
  const liczba = (f: FiltrPrzegladow) => filtrujPrzeglady(posortowane, f, dzis).length;

  const chipy: { f: FiltrPrzegladow; etykieta: string }[] = [
    { f: "wszystkie", etykieta: "Wszystkie" },
    { f: "opoznione", etykieta: `Opóźnione ${liczba("opoznione")}` },
    { f: "30dni", etykieta: "30 dni" },
    { f: "do_uzupelnienia", etykieta: `Do uzupełnienia ${liczba("do_uzupelnienia")}` },
  ];

  return (
    <AppShell title="Przeglądy" dozwoloneRole={["technik", "kierownik", "admin"]}>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {chipy.map(({ f, etykieta }) => (
          <button
            key={f}
            type="button"
            aria-pressed={filtr === f}
            onClick={() => setFiltr(f)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold ${
              filtr === f
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground"
            }`}
          >
            {etykieta}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-muted-foreground">Wczytywanie...</p>}
      {isError && (
        <p role="alert" className="text-destructive">
          Nie udało się wczytać przeglądów. Przeglądy wymagają połączenia z internetem.
        </p>
      )}
      <div className="space-y-3">
        {widoczne.map((p) => (
          <KartaPrzegladu key={p.id} p={p} dzis={dzis} />
        ))}
        {!isLoading && !isError && widoczne.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            Brak przeglądów w tym widoku.
          </p>
        )}
      </div>
    </AppShell>
  );
}
